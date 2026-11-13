"""Coletor da Quattro Energie: geração de eletricidade por fonte no último mês completo.

Fonte: ONS Dados Abertos, conjunto "Geração por usina em base horária"
  - um CSV por mês, separado por ';', com a geração horária de cada usina (MWmed)
  - a coluna nom_tipocombustivel diz a fonte (Hidráulica, Eólica, Gás, ...)

Uso: python -m coletores.matriz_eletrica
"""

from __future__ import annotations

import calendar
import csv
import sys
from collections import defaultdict
from datetime import date
from typing import Iterable

from coletores.comum import ErroColeta, baixar_linhas, formatar_numero, log, para_numero, salvar_json

URL_DATASET = "https://dados.ons.org.br/dataset/geracao-usina-2"
URL_ARQUIVO = (
    "https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/geracao_usina_2_ho/"
    "GERACAO_USINA-2_{ano}_{mes:02d}.csv"
)

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
        "pizzaiolo": {"frase": frase, "nota": None, "regra": None},
    }


def main() -> int:
    erros = []
    for ano, mes in meses_candidatos(date.today()):
        try:
            agregado = agregar(baixar_linhas(URL_ARQUIVO.format(ano=ano, mes=mes)))
            dados = transformar(agregado, ano, mes)
        except ErroColeta as erro:
            log.warning("%d-%02d: %s", ano, mes, erro)
            erros.append(str(erro))
            continue
        salvar_json("matriz_eletrica", dados)
        log.info("Matriz %s: %d fatias, %s GWh", dados["periodo"], len(dados["fatias"]),
                 formatar_numero(dados["resumo"]["energia_total_gwh"]))
        return 0
    log.error("Coleta da matriz elétrica falhou: %s", " / ".join(erros))
    return 1


if __name__ == "__main__":
    sys.exit(main())
