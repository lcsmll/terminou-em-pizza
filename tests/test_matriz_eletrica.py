"""Testes do coletor da matriz elétrica com um CSV FICTÍCIO no formato do ONS.

Os números são inventados (mês 2099-02, 28 dias) e servem só para testar a lógica.
"""

import unittest
from datetime import date

from coletores.comum import ErroColeta
from coletores.matriz_eletrica import agregar, agregar_ano, historico, meses_candidatos, transformar

CABECALHO = (
    "din_instante;id_subsistema;nom_subsistema;id_estado;nom_estado;cod_modalidadeoperacao;"
    "nom_tipousina;nom_tipocombustivel;nom_usina;id_ons;ceg;val_geracao"
)

# Geração constante por hora (MWmed): total 100 por hora
USINAS = [
    ("TIPO I", "Hidráulica", 50.0),
    ("TIPO I", "Eólica", 20.0),
    ("Conjunto de Usinas", "Fotovoltaica", 5.0),
    ("Pequenas Usinas (MMGD)", "Fotovoltaica", 15.0),
    ("TIPO I", "Gás", 6.0),
    ("TIPO I", "Biomassa", 3.0),
    ("TIPO I", "Óleo Diesel", 1.0),
]


def csv_ficticio(dias=28, usinas=USINAS):
    linhas = [CABECALHO]
    for dia in range(1, dias + 1):
        for hora in range(24):
            instante = f"2099-02-{dia:02d} {hora:02d}:00:00"
            for modalidade, combustivel, valor in usinas:
                linhas.append(f"{instante};SE;SUDESTE;SP;SAO PAULO;{modalidade};X;{combustivel};USINA;;-;{valor}")
    return linhas


class TestMatrizEletrica(unittest.TestCase):
    def setUp(self):
        self.dados = transformar(agregar(csv_ficticio()), 2099, 2)
        self.fatias = {f["nome"]: f for f in self.dados["fatias"]}

    def test_formato_padrao(self):
        self.assertEqual(self.dados["periodo"], "2099-02")
        self.assertAlmostEqual(self.dados["total"], 100.0)
        for chave in ("tema", "sabor", "fonte", "fatias", "pizzaiolo", "unidade"):
            self.assertIn(chave, self.dados)

    def test_percentuais_e_agrupamento(self):
        self.assertAlmostEqual(self.fatias["Hidráulica"]["valor"], 50.0)
        self.assertAlmostEqual(self.fatias["Solar"]["valor"], 20.0)
        self.assertAlmostEqual(self.fatias["Outras térmicas"]["valor"], 4.0)
        self.assertEqual(self.fatias["Outras térmicas"]["detalhe"]["composicao_pct"]["Biomassa"], 75.0)
        self.assertAlmostEqual(self.fatias["Solar"]["detalhe"]["geracao_distribuida_pct"], 75.0)

    def test_energia_e_potencia(self):
        hidraulica = self.fatias["Hidráulica"]["detalhe"]
        self.assertAlmostEqual(hidraulica["potencia_media_mwmed"], 50.0)
        self.assertAlmostEqual(hidraulica["energia_gwh"], 50 * 28 * 24 / 1000, places=1)

    def test_ordenado_do_mais_pesado(self):
        valores = [f["valor"] for f in self.dados["fatias"]]
        self.assertEqual(valores, sorted(valores, reverse=True))

    def test_pizzaiolo_so_com_frase(self):
        self.assertEqual(list(self.dados["pizzaiolo"]), ["frase"])

    def test_frase_em_formato_brasileiro(self):
        frase = self.dados["pizzaiolo"]["frase"]
        self.assertIn("fevereiro de 2099", frase)
        self.assertIn("90,0%", frase)

    def test_falha_se_mes_incompleto(self):
        with self.assertRaises(ErroColeta):
            transformar(agregar(csv_ficticio(dias=27)), 2099, 2)

    def test_falha_com_combustivel_novo(self):
        usinas = USINAS + [("TIPO I", "Hidrogênio", 1.0)]
        with self.assertRaises(ErroColeta):
            transformar(agregar(csv_ficticio(usinas=usinas)), 2099, 2)

    def test_falha_se_colunas_mudarem(self):
        with self.assertRaises(ErroColeta):
            agregar(["a;b;c", "1;2;3"])

    def test_meses_candidatos(self):
        self.assertEqual(meses_candidatos(date(2026, 1, 15)), [(2025, 12), (2025, 11)])



BALANCO = [
    "id_subsistema;nom_subsistema;din_instante;val_gerhidraulica;val_gertermica;val_gereolica;val_gersolar;val_carga;val_intercambio",
    "SE ;SUDESTE;2099-01-01 00:00:00;60;10;0;10;0;0",
    "NE ;NORDESTE;2099-01-01 00:00:00;0;0;20;0;0;0",
    # a linha SIN repete o total e não pode ser somada
    "SIN;SISTEMA INTERLIGADO NACIONAL;2099-01-01 00:00:00;60;10;20;10;0;0",
    "SE ;SUDESTE;2099-03-31 23:00:00;;;;;0;0",
]


class TestHistoricoMatriz(unittest.TestCase):
    def test_ignora_linha_sin(self):
        ano = agregar_ano(BALANCO)
        self.assertEqual(sum(ano["mwh"].values()), 100)
        self.assertEqual(ano["ultimo_instante"], "2099-03-31 23:00:00")

    def test_participacao_e_ano_parcial(self):
        anos = {2098: {"mwh": {"Hidráulica": 50, "Térmicas (todas)": 50, "Eólica": 0, "Solar": 0},
                       "ultimo_instante": "2098-12-31 23:00:00"},
                2099: agregar_ano(BALANCO)}
        g = historico(anos, date(2099, 4, 10))
        self.assertEqual(g["rotulos"], ["2098", "2099"])
        self.assertEqual(g["series"]["Hidráulica"], [50.0, 60.0])
        self.assertEqual(g["parcial"], {"rotulo": "2099", "texto": "até 31 de março"})
        self.assertEqual(g["serie_da_fatia"]["Nuclear"], "Térmicas (todas)")


if __name__ == "__main__":
    unittest.main()
