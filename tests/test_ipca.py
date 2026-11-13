"""Testes do coletor do IPCA com uma resposta FICTÍCIA no formato da SIDRA.

Os números do fixture são inventados (mês 2099-01) e servem só para testar a lógica.
"""

import copy
import json
import unittest
from pathlib import Path

from coletores.comum import ErroColeta
from coletores.ipca import montar_url, transformar

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
        self.assertIn("0.50%", frase)

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
        self.assertIn("/v/63,66/", url)
        self.assertIn("p/last%201", url)


if __name__ == "__main__":
    unittest.main()
