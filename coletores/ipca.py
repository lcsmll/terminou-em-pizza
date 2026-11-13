"""Coletor da Pizza Inflação: pesos e variações dos grupos do IPCA.

Fonte: IBGE SIDRA, tabela 7060 (desde 2020) e tabela 1419 (2012 a 2019, para o histórico)
  - variável 63: IPCA, variação mensal (%)
  - variável 66: IPCA, peso mensal (%)
  - variável 69: IPCA, variação acumulada no ano (%)
  - classificação 315: geral, grupo, subgrupo, item e subitem

Uso: python -m coletores.ipca
"""

from __future__ import annotations

import re
import sys

from coletores.comum import ErroColeta, baixar_json, formatar_numero, log, para_numero, salvar_json

TABELA = 7060
TABELA_ANTERIOR = 1419  # mesma estrutura de grupos, de 2012 a 2019
VAR_VARIACAO = "63"
VAR_PESO = "66"
VAR_ACUMULADO_ANO = "69"
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


def montar_url_historico(tabela: int) -> str:
    codigos = ",".join([COD_GERAL, *COD_GRUPOS])
    return (
        f"https://apisidra.ibge.gov.br/values/t/{tabela}/n1/all"
        f"/v/{VAR_PESO},{VAR_ACUMULADO_ANO}/p/all/c315/{codigos}"
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
    mes_nome = linhas[0][k["mes"] + "N"].replace(" ", " de ")  # 'outubro 2026' -> 'outubro de 2026'

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
    frase = f"A fatia mais pesada é {maior['nome']}: {formatar_numero(maior['valor'])}% do orçamento."
    if ipca_mes is not None:
        frase += f" Em {mes_nome}, o IPCA variou {formatar_numero(ipca_mes, 2)}%."

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


def historico(respostas: list[list[dict]]) -> list[dict]:
    """Inflação de cada ano e peso de cada grupo, a partir das séries mensais da SIDRA."""
    valores: dict[tuple[str, str, str], float | None] = {}
    nomes: dict[str, str] = {}
    nome_mes: dict[str, str] = {}
    for resposta in respostas:
        if not resposta or len(resposta) < 2:
            raise ErroColeta("Resposta da SIDRA vazia no histórico")
        k = _achar_chaves(resposta[0])
        for l in resposta[1:]:
            cod, mes = l[k["grupo"] + "C"], l[k["mes"] + "C"]
            valores[(cod, mes, l[k["variavel"] + "C"])] = para_numero(l.get("V"))
            nomes[cod] = limpar_nome(l[k["grupo"] + "N"])
            nome_mes[mes] = l[k["mes"] + "N"]

    meses = sorted({mes for _, mes, _ in valores})
    if not meses:
        raise ErroColeta("Histórico do IPCA sem meses")
    # para cada ano, o último mês disponível (dezembro, ou o mais recente no ano corrente)
    ultimo_mes = {}
    for mes in meses:
        ultimo_mes[mes[:4]] = mes
    anos = sorted(ultimo_mes)

    def serie(cod: str, var: str) -> list:
        return [valores.get((cod, ultimo_mes[ano], var)) for ano in anos]

    faltando = [nomes.get(c, c) for c in COD_GRUPOS if c not in nomes]
    if faltando:
        raise ErroColeta(f"Histórico do IPCA sem os grupos: {faltando}")

    ultimo = ultimo_mes[anos[-1]]
    parcial = None
    if not ultimo.endswith("12"):
        mes_nome = nome_mes[ultimo].split(" ")[0]
        parcial = {"rotulo": anos[-1], "texto": f"até {mes_nome}"}
    fonte = {"nome": f"IBGE SIDRA, tabelas {TABELA_ANTERIOR} e {TABELA}", "url": f"https://sidra.ibge.gov.br/tabela/{TABELA}"}
    nota_parcial = f" Em {anos[-1]}, acumulado de janeiro a {parcial['texto'][4:]}." if parcial else ""

    return [
        {
            "id": "inflacao_anual",
            "titulo": "Inflação de cada ano",
            "tipo": "linha",
            "unidade": "%",
            "casas": 2,
            "rotulos": anos,
            "parcial": parcial,
            "referencia": {"nome": "IPCA geral", "valores": serie(COD_GERAL, VAR_ACUMULADO_ANO)},
            "series": {nomes[c]: serie(c, VAR_ACUMULADO_ANO) for c in COD_GRUPOS},
            "nota": "Variação acumulada de janeiro a dezembro." + nota_parcial,
            "fonte": fonte,
        },
        {
            "id": "peso",
            "titulo": "Peso no orçamento das famílias",
            "tipo": "linha",
            "unidade": "%",
            "casas": 1,
            "rotulos": anos,
            "parcial": parcial,
            "referencia": None,
            "series": {nomes[c]: serie(c, VAR_PESO) for c in COD_GRUPOS},
            "nota": (
                "Peso de dezembro de cada ano (no ano corrente, do último mês). Em 2020 o IBGE passou a usar "
                "a cesta de consumo da Pesquisa de Orçamentos Familiares 2017-2018, por isso alguns pesos mudam de patamar."
            ),
            "fonte": fonte,
        },
    ]


def main() -> int:
    try:
        dados = transformar(baixar_json(montar_url()))
        dados["historico"] = historico([
            baixar_json(montar_url_historico(TABELA_ANTERIOR)),
            baixar_json(montar_url_historico(TABELA)),
        ])
    except ErroColeta as erro:
        log.error("Coleta do IPCA falhou: %s", erro)
        return 1
    salvar_json("ipca", dados)
    log.info("IPCA %s: %d fatias, soma %.2f%%", dados["periodo"], len(dados["fatias"]), dados["total"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
