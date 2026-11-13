"""Testes do coletor do IPCA com uma resposta FICTÍCIA no formato da SIDRA.

Os números do fixture são inventados (mês 2099-01) e servem só para testar a lógica.
"""

import copy
import json
import unittest
from pathlib import Path

from coletores.comum import ErroColeta
from coletores.ipca import COD_GERAL, COD_GRUPOS, historico, montar_url, montar_url_historico, transformar

FIXTURE = Path(__file__).parent / "fixtures" / "sidra_7060_ficticio.json"


class TestIpca(unittest.TestCase):
    def setUp(self):
        self.resposta = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_formato_padrao(self):
        d = transformar(self.resposta)
        self.assertEqual(d["periodo"], "2099-01")
        self.assertEqual(len(d["fatias"]), 9)
        self.assertAlmostEqual(d["total"], 100.0)
        for chave in ("tema", "sabor", "fonte", "fatias", "pizzaiolo", "unidade"):
            self.assertIn(chave, d)

    def test_ordenado_do_mais_pesado(self):
        valores = [f["valor"] for f in transformar(self.resposta)["fatias"]]
        self.assertEqual(valores, sorted(valores, reverse=True))
        self.assertEqual(transformar(self.resposta)["fatias"][0]["ordem"], 1)

    def test_nome_sem_numero_e_ingrediente(self):
        nomes = {f["nome"]: f["ingrediente"] for f in transformar(self.resposta)["fatias"]}
        self.assertEqual(nomes["Alimentação e bebidas"], "Tomate e manjericão")
        self.assertNotIn("A definir", nomes.values())

    def test_contribuicao_e_valor_ausente(self):
        fatias = {f["nome"]: f for f in transformar(self.resposta)["fatias"]}
        self.assertAlmostEqual(fatias["Alimentação e bebidas"]["detalhe"]["contribuicao_pp"], 0.2)
        self.assertIsNone(fatias["Comunicação"]["detalhe"]["variacao_mes_pct"])
        self.assertIsNone(fatias["Comunicação"]["detalhe"]["contribuicao_pp"])

    def test_frase_do_pizzaiolo_usa_dados(self):
        frase = transformar(self.resposta)["pizzaiolo"]["frase"]
        self.assertIn("Alimentação e bebidas", frase)
        self.assertIn("0,50%", frase)

    def test_nota_pela_distancia_da_meta(self):
        com_doze_meses = copy.deepcopy(self.resposta)
        linha = next(l for l in com_doze_meses[1:] if l["D4C"] == COD_GERAL)
        com_doze_meses.append({**linha, "D2C": "2265", "V": "4.5"})
        pizzaiolo = transformar(com_doze_meses)["pizzaiolo"]
        # 1,5 ponto acima da meta de 3%: limite da tolerância, nota 5
        self.assertEqual(pizzaiolo["nota"], 5.0)
        self.assertIn("4,50%", pizzaiolo["regra"])
        self.assertIn("1,50 ponto acima", pizzaiolo["regra"])
        self.assertTrue(pizzaiolo["regra_fonte"]["url"].startswith("https://"))
        com_doze_meses[-1]["V"] = "-1"
        self.assertEqual(transformar(com_doze_meses)["pizzaiolo"]["nota"], 0.0)

    def test_sem_doze_meses_sem_nota(self):
        pizzaiolo = transformar(self.resposta)["pizzaiolo"]
        self.assertIsNone(pizzaiolo["nota"])
        self.assertIsNone(pizzaiolo["regra"])

    def test_falha_se_soma_nao_fecha(self):
        ruim = copy.deepcopy(self.resposta)
        for linha in ruim[1:]:
            if linha["D4C"] == "7170" and linha["D2C"] == "66":
                linha["V"] = "40"
        with self.assertRaises(ErroColeta):
            transformar(ruim)

    def test_falha_se_faltar_grupo(self):
        ruim = [l for l in self.resposta if l.get("D4C") != "7786"]
        with self.assertRaises(ErroColeta):
            transformar(ruim)

    def test_url(self):
        url = montar_url()
        self.assertIn("/t/7060/", url)
        self.assertIn("/v/63,66,2265/", url)
        self.assertIn("p/last%201", url)



def resposta_historico(meses):
    """Resposta fictícia da SIDRA com peso (66) e acumulado no ano (69) para cada grupo."""
    cab = {"V": "Valor", "D2C": "Variável (Código)", "D2N": "Variável", "D3C": "Mês (Código)", "D3N": "Mês",
           "D4C": "Geral, grupo, subgrupo, item e subitem (Código)", "D4N": "Geral, grupo, subgrupo, item e subitem"}
    linhas = [cab]
    nomes_mes = {"11": "novembro", "12": "dezembro", "01": "janeiro", "02": "fevereiro", "03": "março"}
    for mes in meses:
        for i, cod in enumerate([COD_GERAL, *COD_GRUPOS]):
            for var, valor in (("66", 100 if cod == COD_GERAL else 10 + i), ("69", int(mes[4:]) + i / 10)):
                linhas.append({"V": str(valor), "D2C": var, "D2N": "x", "D3C": mes,
                               "D3N": f"{nomes_mes[mes[4:]]} {mes[:4]}", "D4C": cod, "D4N": f"{i}.Grupo {cod}"})
    return linhas


class TestHistoricoIpca(unittest.TestCase):
    def setUp(self):
        respostas = [resposta_historico(["209712", "209811", "209812"]), resposta_historico(["209901", "209902", "209903"])]
        self.inflacao, self.peso = historico(respostas)

    def test_um_ponto_por_ano_no_ultimo_mes(self):
        self.assertEqual(self.inflacao["rotulos"], ["2097", "2098", "2099"])
        # dezembro nos anos fechados, março no ano corrente
        self.assertEqual(self.inflacao["referencia"]["valores"], [12, 12, 3])

    def test_ano_parcial(self):
        self.assertEqual(self.inflacao["parcial"], {"rotulo": "2099", "texto": "até março"})
        self.assertIn("janeiro a março", self.inflacao["nota"])

    def test_series_por_nome_de_grupo(self):
        self.assertEqual(len(self.inflacao["series"]), 9)
        self.assertIsNone(self.peso["referencia"])
        self.assertEqual(self.peso["series"]["Grupo 7170"], [11, 11, 11])

    def test_url_historico(self):
        self.assertIn("/t/1419/", montar_url_historico(1419))
        self.assertIn("/v/66,69/p/all/", montar_url_historico(1419))


if __name__ == "__main__":
    unittest.main()
