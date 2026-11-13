"""Coletor da Quattro Energie: geração de eletricidade por fonte no último mês completo.

Fonte: ONS Dados Abertos
  - "Geração por usina em base horária": um CSV por mês, separado por ';', com a
    geração horária de cada usina (MWmed); a coluna nom_tipocombustivel diz a fonte
  - "Balanço de energia nos subsistemas", para o histórico desde 2000: um CSV por
    ano, com a geração horária de cada subsistema em quatro fontes (hidráulica,
    térmica, eólica e solar)

Uso: python -m coletores.matriz_eletrica
"""

from __future__ import annotations

import calendar
import csv
import json
import sys
from collections import defaultdict
from datetime import date
from typing import Iterable

from coletores.comum import PASTA_GERADOS, ErroColeta, baixar_linhas, formatar_numero, log, para_numero, salvar_json

URL_DATASET = "https://dados.ons.org.br/dataset/geracao-usina-2"
URL_ARQUIVO = (
    "https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/geracao_usina_2_ho/"
    "GERACAO_USINA-2_{ano}_{mes:02d}.csv"
)

URL_BALANCO = (
    "https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/balanco_energia_subsistema_ho/"
    "BALANCO_ENERGIA_SUBSISTEMA_{ano}.csv"
)
URL_DATASET_BALANCO = "https://dados.ons.org.br/dataset/balanco-energia-subsistema"
ANO_INICIO_HISTORICO = 2000
# coluna do balanço -> série do histórico
COLUNAS_BALANCO = {
    "val_gerhidraulica": "Hidráulica",
    "val_gertermica": "Térmicas (todas)",
    "val_gereolica": "Eólica",
    "val_gersolar": "Solar",
}
# No balanço as térmicas vêm somadas: cada fatia térmica aponta para essa série
SERIE_DA_FATIA = {
    "Gás natural": "Térmicas (todas)",
    "Nuclear": "Térmicas (todas)",
    "Carvão": "Térmicas (todas)",
    "Outras térmicas": "Térmicas (todas)",
}

# nom_tipocombustivel -> fatia. Combustível desconhecido faz o coletor falhar,
# para ninguém somar uma fonte nova no lugar errado sem perceber.
FATIAS = {
    "Hidráulica": "Hidráulica",
    "Fotovoltaica": "Solar",
    "Eólica": "Eólica",
    "Gás": "Gás natural",
    "Nuclear": "Nuclear",
    "Carvão": "Carvão",
    "Biomassa": "Outras térmicas",
    "Resíduos Industriais": "Outras térmicas",
    "Outras Multi-Combustível": "Outras térmicas",
    "Óleo Combustível": "Outras térmicas",
    "Óleo Diesel": "Outras térmicas",
    "Multi-Combustível Diesel/Óleo": "Outras térmicas",
}

INGREDIENTES = {
    "Hidráulica": "Muçarela de búfala",
    "Solar": "Milho",
    "Eólica": "Manjericão",
    "Gás natural": "Cebola",
    "Nuclear": "Azeitona verde",
    "Carvão": "Azeitona preta",
    "Outras térmicas": "Pimenta calabresa",
}

MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def meses_candidatos(hoje: date) -> list[tuple[int, int]]:
    """Os dois meses anteriores ao atual, do mais recente para o mais antigo."""
    saida = []
    ano, mes = hoje.year, hoje.month
    for _ in range(2):
        ano, mes = (ano - 1, 12) if mes == 1 else (ano, mes - 1)
        saida.append((ano, mes))
    return saida


def agregar(linhas: Iterable[str]) -> dict:
    """Soma a geração horária por combustível e por modalidade de operação."""
    leitor = csv.DictReader(linhas, delimiter=";")
    obrigatorias = {"din_instante", "nom_tipocombustivel", "cod_modalidadeoperacao", "val_geracao"}
    if not leitor.fieldnames or not obrigatorias <= set(leitor.fieldnames):
        raise ErroColeta(f"Colunas do CSV do ONS mudaram: {leitor.fieldnames}")

    por_combustivel: dict[str, float] = defaultdict(float)
    solar_mmgd = 0.0
    instantes = set()
    for linha in leitor:
        valor = para_numero(linha["val_geracao"])
        if valor is None:
            continue
        instantes.add(linha["din_instante"])
        combustivel = linha["nom_tipocombustivel"]
        por_combustivel[combustivel] += valor
        if combustivel == "Fotovoltaica" and "MMGD" in linha["cod_modalidadeoperacao"]:
            solar_mmgd += valor
    return {"por_combustivel": dict(por_combustivel), "solar_mmgd": solar_mmgd, "instantes": instantes}


def transformar(agregado: dict, ano: int, mes: int) -> dict:
    """Converte a soma horária no formato padrão do projeto."""
    horas_mes = calendar.monthrange(ano, mes)[1] * 24
    horas = len(agregado["instantes"])
    if horas < horas_mes:
        raise ErroColeta(f"Mês {ano}-{mes:02d} incompleto no ONS: {horas} de {horas_mes} horas")

    desconhecidos = set(agregado["por_combustivel"]) - FATIAS.keys()
    if desconhecidos:
        raise ErroColeta(f"Combustível novo no ONS, classifique em FATIAS: {sorted(desconhecidos)}")

    # val_geracao é MWmed de uma hora, então a soma das horas dá MWh
    mwh: dict[str, float] = defaultdict(float)
    composicao: dict[str, dict[str, float]] = defaultdict(dict)
    for combustivel, soma in agregado["por_combustivel"].items():
        fatia = FATIAS[combustivel]
        mwh[fatia] += soma
        composicao[fatia][combustivel] = soma

    total_mwh = sum(mwh.values())
    if total_mwh <= 0:
        raise ErroColeta("Geração total zerada")

    fatias = []
    for nome, energia in mwh.items():
        detalhe = {
            "energia_gwh": round(energia / 1000, 1),
            "potencia_media_mwmed": round(energia / horas, 1),
        }
        if len(composicao[nome]) > 1:
            detalhe["composicao_pct"] = {
                c: round(v / energia * 100, 2)
                for c, v in sorted(composicao[nome].items(), key=lambda kv: -kv[1])
            }
        if nome == "Solar":
            detalhe["geracao_distribuida_pct"] = round(agregado["solar_mmgd"] / energia * 100, 2)
        fatias.append({
            "codigo": nome.lower().replace(" ", "_"),
            "nome": nome,
            "ingrediente": INGREDIENTES[nome],
            "valor": round(energia / total_mwh * 100, 2),
            "detalhe": detalhe,
        })

    fatias.sort(key=lambda f: f["valor"], reverse=True)
    fatias = [{"ordem": i, **f} for i, f in enumerate(fatias, start=1)]

    renovaveis = sum(f["valor"] for f in fatias if f["nome"] in {"Hidráulica", "Solar", "Eólica"})
    mes_nome = f"{MESES[mes - 1]} de {ano}"
    maior = fatias[0]
    frase = (
        f"Em {mes_nome}, a fonte {maior['nome'].lower()} gerou {formatar_numero(maior['valor'])}% da eletricidade do país. "
        f"Água, sol e vento somaram {formatar_numero(renovaveis)}%."
    )

    return {
        "tema": "Matriz elétrica",
        "sabor": "Quattro Energie",
        "periodo": f"{ano}-{mes:02d}",
        "periodo_nome": mes_nome,
        "total": round(sum(f["valor"] for f in fatias), 2),
        "unidade": "%",
        "fonte": {"nome": "ONS, Geração por usina em base horária", "url": URL_DATASET},
        "resumo": {
            "energia_total_gwh": round(total_mwh / 1000, 1),
            "potencia_media_mwmed": round(total_mwh / horas, 1),
            "renovaveis_pct": round(renovaveis, 2),
        },
        "fatias": fatias,
        "pizzaiolo": {"frase": frase},
    }


def agregar_ano(linhas: Iterable[str]) -> dict:
    """Soma a geração do ano por fonte, sem a linha 'SIN', que repete o total do país."""
    leitor = csv.DictReader(linhas, delimiter=";")
    obrigatorias = {"id_subsistema", "din_instante", *COLUNAS_BALANCO}
    if not leitor.fieldnames or not obrigatorias <= set(leitor.fieldnames):
        raise ErroColeta(f"Colunas do balanço do ONS mudaram: {leitor.fieldnames}")
    soma = dict.fromkeys(COLUNAS_BALANCO.values(), 0.0)
    ultimo = ""
    for linha in leitor:
        if linha["id_subsistema"].strip() == "SIN":
            continue
        for coluna, serie in COLUNAS_BALANCO.items():
            soma[serie] += para_numero(linha[coluna]) or 0.0
        ultimo = max(ultimo, linha["din_instante"])
    if sum(soma.values()) <= 0:
        raise ErroColeta("Balanço do ONS sem geração")
    return {"mwh": soma, "ultimo_instante": ultimo}


def historico(anos: dict[int, dict], hoje: date) -> dict:
    """Participação de cada fonte por ano, no formato dos gráficos do site."""
    rotulos = sorted(anos)
    series = {}
    for serie in COLUNAS_BALANCO.values():
        series[serie] = [round(anos[a]["mwh"][serie] / sum(anos[a]["mwh"].values()) * 100, 2) for a in rotulos]
    parcial = None
    ultimo = anos[rotulos[-1]]["ultimo_instante"]
    if rotulos[-1] == hoje.year and not ultimo.startswith(f"{hoje.year}-12-31"):
        mes = MESES[int(ultimo[5:7]) - 1]
        parcial = {"rotulo": str(rotulos[-1]), "texto": f"até {int(ultimo[8:10])} de {mes}"}
    return {
        "id": "participacao_anual",
        "titulo": "Participação de cada fonte na geração",
        "tipo": "linha",
        "unidade": "%",
        "casas": 1,
        "rotulos": [str(a) for a in rotulos],
        "parcial": parcial,
        "referencia": None,
        "series": series,
        "serie_da_fatia": SERIE_DA_FATIA,
        "energia_twh": [round(sum(anos[a]["mwh"].values()) / 1e6, 1) for a in rotulos],
        "nota": (
            "No histórico do ONS as térmicas aparecem somadas: gás natural, carvão, nuclear, óleo e biomassa. "
            "A solar inclui a geração em telhados estimada pelo ONS."
            + (f" Em {parcial['rotulo']}, dados de 1º de janeiro {parcial['texto']}." if parcial else "")
        ),
        "fonte": {"nome": "ONS, Balanço de energia nos subsistemas", "url": URL_DATASET_BALANCO},
    }


def anos_guardados() -> dict[int, dict]:
    """Anos fechados que já estão no JSON anterior, para não baixar tudo de novo."""
    anterior = PASTA_GERADOS / "matriz_eletrica.json"
    if not anterior.exists():
        return {}
    guardado = json.loads(anterior.read_text(encoding="utf-8")).get("cache_balanco", {})
    return {int(ano): dados for ano, dados in guardado.items()}


def coletar_historico(hoje: date) -> tuple[dict, dict]:
    anos = anos_guardados()
    for ano in range(ANO_INICIO_HISTORICO, hoje.year + 1):
        # o ano corrente e o anterior podem mudar; os outros vêm do JSON anterior
        if ano in anos and ano < hoje.year - 1:
            continue
        anos[ano] = agregar_ano(baixar_linhas(URL_BALANCO.format(ano=ano)))
    return historico(anos, hoje), {str(a): anos[a] for a in sorted(anos)}


def main() -> int:
    try:
        grafico, cache = coletar_historico(date.today())
    except ErroColeta as erro:
        log.error("Histórico da matriz elétrica falhou: %s", erro)
        return 1

    erros = []
    for ano, mes in meses_candidatos(date.today()):
        try:
            agregado = agregar(baixar_linhas(URL_ARQUIVO.format(ano=ano, mes=mes)))
            dados = transformar(agregado, ano, mes)
        except ErroColeta as erro:
            log.warning("%d-%02d: %s", ano, mes, erro)
            erros.append(str(erro))
            continue
        dados["historico"] = [grafico]
        dados["cache_balanco"] = cache
        salvar_json("matriz_eletrica", dados)
        log.info("Matriz %s: %d fatias, %s GWh", dados["periodo"], len(dados["fatias"]),
                 formatar_numero(dados["resumo"]["energia_total_gwh"]))
        return 0
    log.error("Coleta da matriz elétrica falhou: %s", " / ".join(erros))
    return 1


if __name__ == "__main__":
    sys.exit(main())
