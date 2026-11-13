"""Coletor da Calabresa da CPI: como terminaram as CPIs da Câmara dos Deputados.

Fonte: API de Dados Abertos da Câmara dos Deputados
  - /orgaos?codTipoOrgao=4: as Comissões Parlamentares de Inquérito e suas datas
  - /proposicoes?siglaTipo=REL: os relatórios (REL) apresentados nas comissões
  - /proposicoes/{id}/tramitacoes: onde aparece "Aprovação de Proposição Interna"
    quando a CPI aprova o relatório final

A API não tem um campo de desfecho. A classificação vem só do que está registrado
nela; correções feitas à mão ficam em dados/manual/cpis_desfechos.json, sempre com
link da fonte.

Uso: python -m coletores.cpis
"""

from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from pathlib import Path

from coletores.comum import RAIZ, ErroColeta, baixar_json, log, salvar_json

API = "https://dadosabertos.camara.leg.br/api/v2"
COD_TIPO_CPI = 4
INICIO = "2015-02-01"  # início da 55ª legislatura
# Tramitações do relatório podem ser registradas alguns dias depois do fim da CPI
FOLGA_APOS_FIM = timedelta(days=120)
ARQUIVO_MANUAL = RAIZ / "dados" / "manual" / "cpis_desfechos.json"

DESFECHOS = {
    "relatorio_aprovado": ("Relatório final aprovado", "Calabresa"),
    "relatorio_sem_aprovacao": ("Relatório apresentado, sem aprovação registrada", "Cebola"),
    "sem_relatorio_registrado": ("Sem relatório registrado na API", "Azeitona preta"),
    "nao_instalada": ("Criada e não instalada", "Orégano"),
    "em_andamento": ("Em andamento", "Pimenta"),
}


def _paginar(url: str) -> list[dict]:
    dados = []
    while url:
        resposta = baixar_json(url, silencioso=True)
        dados += resposta["dados"]
        url = next((l["href"] for l in resposta["links"] if l["rel"] == "next"), None)
    return dados


def _em_paralelo(funcao, itens: list) -> list:
    with ThreadPoolExecutor(max_workers=6) as executor:
        return list(executor.map(funcao, itens))


def buscar_cpis(hoje: date) -> list[dict]:
    """Detalhe de cada CPI criada desde INICIO."""
    lista = _paginar(
        f"{API}/orgaos?codTipoOrgao={COD_TIPO_CPI}&dataInicio=1900-01-01"
        f"&dataFim={hoje.isoformat()}&itens=100"
    )
    if not lista:
        raise ErroColeta("A API da Câmara não devolveu nenhuma CPI")
    unicas = {o["id"]: o for o in lista}  # a paginação da API repete itens
    log.info("%d CPIs na API, buscando detalhes", len(unicas))
    detalhes = _em_paralelo(lambda o: baixar_json(o["uri"], silencioso=True)["dados"], list(unicas.values()))
    return [d for d in detalhes if (d.get("dataInicio") or "") >= INICIO]


def buscar_relatorios(hoje: date) -> list[dict]:
    """Todos os REL desde INICIO, cada um com suas tramitações."""
    rels = []
    for ano in range(int(INICIO[:4]), hoje.year + 1):
        rels += _paginar(f"{API}/proposicoes?siglaTipo=REL&ano={ano}&dataInicio={ano}-01-01&itens=100")
    log.info("%d relatórios (REL) na API, buscando tramitações", len(rels))

    def com_tramitacoes(rel: dict) -> dict:
        tram = baixar_json(f"{API}/proposicoes/{rel['id']}/tramitacoes", silencioso=True)["dados"]
        return {**rel, "tramitacoes": tram}

    return _em_paralelo(com_tramitacoes, rels)


def carregar_manual(caminho: Path = ARQUIVO_MANUAL) -> dict[str, dict]:
    """Correções curadas à mão. Cada uma precisa de desfecho válido e link da fonte."""
    if not caminho.exists():
        return {}
    manual = json.loads(caminho.read_text(encoding="utf-8")).get("cpis", {})
    for id_cpi, item in manual.items():
        if item.get("desfecho") not in DESFECHOS:
            raise ErroColeta(f"Desfecho manual inválido para a CPI {id_cpi}: {item.get('desfecho')}")
        if not str(item.get("fonte", "")).startswith("http"):
            raise ErroColeta(f"Desfecho manual da CPI {id_cpi} sem link da fonte")
    return manual


def _dia(texto: str | None) -> date | None:
    return datetime.fromisoformat(texto[:10]).date() if texto else None


def classificar(cpi: dict, relatorios: list[dict], hoje: date) -> dict:
    """Decide o desfecho de uma CPI só com o que está registrado na API."""
    inicio, fim = _dia(cpi["dataInicio"]), _dia(cpi.get("dataFim"))
    base = {
        "id": cpi["id"],
        "sigla": cpi["sigla"],
        "nome": cpi.get("nomePublicacao") or cpi.get("apelido") or cpi["nome"],
        "inicio": inicio.isoformat(),
        "fim": fim.isoformat() if fim else None,
        "url": f"{API}/orgaos/{cpi['id']}",
        "relatorios": [],
        "evidencia": None,
        "origem": "api",
    }

    if not cpi.get("dataInstalacao"):
        return {**base, "desfecho": "nao_instalada"}
    if fim is None or fim > hoje:
        return {**base, "desfecho": "em_andamento"}

    limite = fim + FOLGA_APOS_FIM
    aprovacao = None
    for rel in relatorios:
        tram = [
            t for t in rel["tramitacoes"]
            if t.get("siglaOrgao") == cpi["sigla"] and inicio <= _dia(t["dataHora"]) <= limite
        ]
        if not tram:
            continue
        base["relatorios"].append(f"REL {rel['numero']}/{rel['ano']}")
        for t in tram:
            texto = f"{t.get('descricaoTramitacao') or ''}: {t.get('despacho') or ''}"
            if t.get("descricaoTramitacao") == "Aprovação de Proposição Interna" and "aprovad" in texto.lower():
                aprovacao = aprovacao or f"REL {rel['numero']}/{rel['ano']}, {_dia(t['dataHora']):%d/%m/%Y}: {(t.get('despacho') or '').strip()}"

    if aprovacao:
        return {**base, "desfecho": "relatorio_aprovado", "evidencia": aprovacao}
    if base["relatorios"]:
        return {**base, "desfecho": "relatorio_sem_aprovacao"}
    return {**base, "desfecho": "sem_relatorio_registrado"}


def transformar(cpis: list[dict], relatorios: list[dict], manual: dict[str, dict], hoje: date) -> dict:
    """Agrupa as CPIs por desfecho no formato padrão do projeto."""
    if not cpis:
        raise ErroColeta(f"Nenhuma CPI criada desde {INICIO}")

    classificadas = []
    for cpi in cpis:
        item = classificar(cpi, relatorios, hoje)
        correcao = manual.get(str(cpi["id"]))
        if correcao:
            item = {**item, "desfecho": correcao["desfecho"], "origem": "manual",
                    "evidencia": correcao.get("observacao"), "fonte_manual": correcao["fonte"]}
        classificadas.append(item)

    total = len(classificadas)
    fatias = []
    for codigo, (nome, ingrediente) in DESFECHOS.items():
        grupo = sorted((c for c in classificadas if c["desfecho"] == codigo), key=lambda c: c["inicio"])
        if not grupo:
            continue
        fatias.append({
            "codigo": codigo,
            "nome": nome,
            "ingrediente": ingrediente,
            "valor": len(grupo),
            "detalhe": {
                "percentual": round(len(grupo) / total * 100, 1),
                "cpis": [{k: v for k, v in c.items() if k != "desfecho"} for c in grupo],
            },
        })

    fatias.sort(key=lambda f: f["valor"], reverse=True)
    fatias = [{"ordem": i, **f} for i, f in enumerate(fatias, start=1)]

    aprovadas = sum(f["valor"] for f in fatias if f["codigo"] == "relatorio_aprovado")
    ano_inicio = INICIO[:4]
    frase = (
        f"Desde {ano_inicio}, a Câmara criou {total} CPIs. "
        f"{aprovadas} terminaram com relatório final aprovado."
    )

    return {
        "tema": "CPIs",
        "sabor": "Calabresa da CPI",
        "periodo": f"{ano_inicio}/{hoje.year}",
        "periodo_nome": f"CPIs da Câmara criadas de {ano_inicio} a {hoje.year}",
        "total": total,
        "unidade": "CPIs",
        "fonte": {
            "nome": "Câmara dos Deputados, Dados Abertos",
            "url": "https://dadosabertos.camara.leg.br/swagger/api.html",
        },
        "resumo": {
            "cpis": total,
            "relatorio_aprovado": aprovadas,
            "corrigidas_manualmente": sum(1 for c in classificadas if c["origem"] == "manual"),
        },
        "fatias": fatias,
        "pizzaiolo": {"frase": frase, "nota": None, "regra": None},
    }


def main() -> int:
    hoje = date.today()
    try:
        dados = transformar(buscar_cpis(hoje), buscar_relatorios(hoje), carregar_manual(), hoje)
    except ErroColeta as erro:
        log.error("Coleta das CPIs falhou: %s", erro)
        return 1
    salvar_json("cpis", dados)
    resumo = ", ".join(f"{f['nome']}: {f['valor']}" for f in dados["fatias"])
    log.info("CPIs desde %s: %d (%s)", INICIO[:4], dados["total"], resumo)
    return 0


if __name__ == "__main__":
    sys.exit(main())
