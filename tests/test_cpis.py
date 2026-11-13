"""Testes do coletor das CPIs com respostas FICTÍCIAS no formato da API da Câmara.

As CPIs, datas e relatórios abaixo são inventados e servem só para testar a lógica.
"""

import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from coletores.comum import ErroColeta
from coletores.cpis import carregar_manual, classificar, transformar

HOJE = date(2099, 6, 1)


def cpi(id_, sigla, inicio, fim, instalada=True):
    return {
        "id": id_, "sigla": sigla, "nome": f"CPI {sigla}", "nomePublicacao": f"CPI {sigla}",
        "dataInicio": f"{inicio}T00:00", "dataFim": f"{fim}T00:00" if fim else None,
        "dataInstalacao": f"{inicio}T00:00" if instalada else None,
    }


def rel(numero, ano, tramitacoes):
    return {"id": numero, "numero": numero, "ano": ano, "tramitacoes": [
        {"siglaOrgao": s, "dataHora": f"{d}T10:00", "descricaoTramitacao": desc, "despacho": desp}
        for s, d, desc, desp in tramitacoes
    ]}


CPIS = [
    cpi(1, "CPIA", "2098-01-10", "2098-06-10"),
    cpi(2, "CPIB", "2098-01-10", "2098-06-10"),
    cpi(3, "CPIC", "2098-01-10", "2098-06-10"),
    cpi(4, "CPID", "2098-01-10", "2098-06-10", instalada=False),
    cpi(5, "CPIE", "2099-03-01", "2099-09-01"),
    # mesma sigla da CPIA, em outra época: não pode herdar o relatório dela
    cpi(6, "CPIA", "2099-01-02", "2099-05-01"),
]

RELATORIOS = [
    rel(1, 2098, [
        ("CPIA", "2098-06-01", "Apresentação de Proposição", "Apresentação do REL 1/2098"),
        ("CPIA", "2098-06-09", "Aprovação de Proposição Interna", "Aprovado o Relatório. Sim: 10; Não: 3"),
    ]),
    rel(2, 2098, [
        ("CPIB", "2098-06-01", "Apresentação de Proposição", "Apresentação do REL 2/2098"),
        ("CPIB", "2098-07-01", "Arquivamento", "Arquivada em decorrência do encerramento do prazo da CPI."),
    ]),
]


class TestCpis(unittest.TestCase):
    def setUp(self):
        self.dados = transformar(CPIS, RELATORIOS, {}, HOJE)
        self.fatias = {f["codigo"]: f for f in self.dados["fatias"]}

    def test_formato_padrao(self):
        self.assertEqual(self.dados["total"], 6)
        self.assertEqual(self.dados["unidade"], "CPIs")
        self.assertEqual(sum(f["valor"] for f in self.dados["fatias"]), 6)
        for chave in ("tema", "sabor", "fonte", "fatias", "pizzaiolo"):
            self.assertIn(chave, self.dados)

    def test_desfechos(self):
        self.assertEqual(self.fatias["relatorio_aprovado"]["valor"], 1)
        self.assertEqual(self.fatias["relatorio_sem_aprovacao"]["valor"], 1)
        self.assertEqual(self.fatias["nao_instalada"]["valor"], 1)
        self.assertEqual(self.fatias["em_andamento"]["valor"], 1)
        # CPIC sem relatório e a segunda CPIA (sigla repetida, fora da janela do REL 1)
        siglas = [c["id"] for c in self.fatias["sem_relatorio_registrado"]["detalhe"]["cpis"]]
        self.assertEqual(sorted(siglas), [3, 6])

    def test_evidencia_da_aprovacao(self):
        aprovada = self.fatias["relatorio_aprovado"]["detalhe"]["cpis"][0]
        self.assertIn("REL 1/2098", aprovada["evidencia"])
        self.assertIn("Sim: 10", aprovada["evidencia"])

    def test_ordenado_do_mais_pesado(self):
        valores = [f["valor"] for f in self.dados["fatias"]]
        self.assertEqual(valores, sorted(valores, reverse=True))

    def test_correcao_manual(self):
        manual = {"3": {"desfecho": "relatorio_aprovado", "fonte": "https://exemplo.gov.br/x"}}
        dados = transformar(CPIS, RELATORIOS, manual, HOJE)
        aprovadas = {f["codigo"]: f for f in dados["fatias"]}["relatorio_aprovado"]
        self.assertEqual(aprovadas["valor"], 2)
        self.assertEqual(dados["resumo"]["corrigidas_manualmente"], 1)

    def test_manual_exige_fonte(self):
        with tempfile.TemporaryDirectory() as pasta:
            arquivo = Path(pasta) / "manual.json"
            arquivo.write_text(json.dumps({"cpis": {"3": {"desfecho": "relatorio_aprovado"}}}))
            with self.assertRaises(ErroColeta):
                carregar_manual(arquivo)

    def test_falha_sem_cpis(self):
        with self.assertRaises(ErroColeta):
            transformar([], RELATORIOS, {}, HOJE)

    def test_classificar_sem_fim_e_em_andamento(self):
        self.assertEqual(classificar(cpi(9, "CPIZ", "2099-01-01", None), [], HOJE)["desfecho"], "em_andamento")


if __name__ == "__main__":
    unittest.main()
