"""Coletor da Pizza Inflação: pesos e variações dos grupos do IPCA.

Fonte: IBGE SIDRA, tabela 7060
  - variável 63: IPCA, variação mensal (%)
  - variável 66: IPCA, peso mensal (%)
  - classificação 315: geral, grupo, subgrupo, item e subitem

Uso: python -m coletores.ipca
"""

from __future__ import annotations

import re
import sys

from coletores.comum import ErroColeta, baixar_json, log, para_numero, salvar_json

TABELA = 7060
VAR_VARIACAO = "63"
VAR_PESO = "66"
COD_GERAL = "7169"
# Códigos dos 9 grupos na classificação 315 da tabela 7060
COD_GRUPOS = ["7170", "7445", "7486", "7558", "7625", "7660", "7712", "7766", "7786"]

INGREDIENTES = {
    "Alimentação e bebidas": "Tomate e manjericão",
    "Transportes": "Azeitona preta",
    "Habitação": "Cogumelos",
    "Saúde e cuidados pessoais": "Rúcula",
    "Despesas pessoais": "Salame",
    "Educação": "Alcachofra",
    "Vestuário": "Pimentões",
    "Comunicação": "Cebola roxa",
    "Artigos de residência": "Alcaparras",
}

TOLERANCIA_SOMA = 0.5  # pontos percentuais


def montar_url(periodo: str = "last 1") -> str:
    codigos = ",".join([COD_GERAL, *COD_GRUPOS])
    periodo_url = periodo.replace(" ", "%20")
    return (
        f"https://apisidra.ibge.gov.br/values/t/{TABELA}/n1/all"
        f"/v/{VAR_VARIACAO},{VAR_PESO}/p/{periodo_url}/c315/{codigos}"
    )


def _achar_chaves(cabecalho: dict) -> dict:
    """Descobre quais colunas D1..Dn são variável, mês e grupo, pelo texto do cabeçalho."""
    chaves = {}
    for chave, rotulo in cabecalho.items():
        if not (chave.startswith("D") and chave.endswith("C")):
            continue
        rotulo = str(rotulo)
        base = chave[:-1]
        if rotulo.startswith("Variável"):
            chaves["variavel"] = base
        elif rotulo.startswith("Mês"):
            chaves["mes"] = base
        elif "grupo" in rotulo.lower():
            chaves["grupo"] = base
    faltando = {"variavel", "mes", "grupo"} - chaves.keys()
    if faltando:
        raise ErroColeta(f"Cabeçalho da SIDRA mudou; não achei: {sorted(faltando)}")
    return chaves


def limpar_nome(nome: str) -> str:
    """'1.Alimentação e bebidas' -> 'Alimentação e bebidas'."""
    return re.sub(r"^\d+\.\s*", "", nome).strip()


def transformar(resposta: list[dict]) -> dict:
    """Converte a resposta crua da SIDRA no formato padrão do projeto."""
    if not resposta or len(resposta) < 2:
        raise ErroColeta("Resposta da SIDRA vazia")

    cabecalho, linhas = resposta[0], resposta[1:]
    k = _achar_chaves(cabecalho)

    meses = {l[k["mes"] + "C"] for l in linhas}
    if len(meses) != 1:
        raise ErroColeta(f"Esperava um mês, vieram {sorted(meses)}")
    mes_cod = meses.pop()                      # ex.: '202610'
    periodo = f"{mes_cod[:4]}-{mes_cod[4:]}"
    mes_nome = linhas[0][k["mes"] + "N"]       # ex.: 'outubro 2026'

    grupos: dict[str, dict] = {}
    geral: dict[str, float | None] = {}
    for l in linhas:
        cod = l[k["grupo"] + "C"]
        var = l[k["variavel"] + "C"]
        valor = para_numero(l.get("V"))
        if cod == COD_GERAL:
            geral[var] = valor
            continue
        g = grupos.setdefault(cod, {"codigo": cod, "nome": limpar_nome(l[k["grupo"] + "N"])})
        g[var] = valor

    if len(grupos) != len(COD_GRUPOS):
        raise ErroColeta(f"Esperava {len(COD_GRUPOS)} grupos, vieram {len(grupos)}")

    fatias = []
    for g in grupos.values():
        peso, variacao = g.get(VAR_PESO), g.get(VAR_VARIACAO)
        if peso is None:
            raise ErroColeta(f"Grupo sem peso: {g['nome']}")
        contribuicao = round(peso * variacao / 100, 4) if variacao is not None else None
        fatias.append({
            "codigo": g["codigo"],
            "nome": g["nome"],
            "ingrediente": INGREDIENTES.get(g["nome"], "A definir"),
            "valor": round(peso, 4),
            "detalhe": {
                "peso_pct": round(peso, 4),
                "variacao_mes_pct": variacao,
                "contribuicao_pp": contribuicao,
            },
        })

    soma = sum(f["valor"] for f in fatias)
    if abs(soma - 100) > TOLERANCIA_SOMA:
        raise ErroColeta(f"Soma dos pesos = {soma:.3f}, longe de 100. Confira os códigos dos grupos.")

    fatias.sort(key=lambda f: f["valor"], reverse=True)
    fatias = [{"ordem": i, **f} for i, f in enumerate(fatias, start=1)]

    ipca_mes = geral.get(VAR_VARIACAO)
    maior = fatias[0]
    frase = f"A fatia mais pesada é {maior['nome']}: {maior['valor']:.1f}% do orçamento."
    if ipca_mes is not None:
        frase += f" Em {mes_nome}, o IPCA variou {ipca_mes:.2f}%."

    return {
        "tema": "IPCA",
        "sabor": "Pizza Inflação",
        "periodo": periodo,
        "periodo_nome": mes_nome,
        "total": round(soma, 4),
        "unidade": "%",
        "fonte": {
            "nome": f"IBGE SIDRA, tabela {TABELA}",
            "url": f"https://sidra.ibge.gov.br/tabela/{TABELA}",
        },
        "resumo": {"ipca_variacao_mes_pct": ipca_mes},
        "fatias": fatias,
        # A nota e a regra entram na Etapa 4
        "pizzaiolo": {"frase": frase, "nota": None, "regra": None},
    }


def main() -> int:
    try:
        dados = transformar(baixar_json(montar_url()))
    except ErroColeta as erro:
        log.error("Coleta do IPCA falhou: %s", erro)
        return 1
    salvar_json("ipca", dados)
    log.info("IPCA %s: %d fatias, soma %.2f%%", dados["periodo"], len(dados["fatias"]), dados["total"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
