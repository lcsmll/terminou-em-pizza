"""Funções compartilhadas pelos coletores."""

from __future__ import annotations

import json
import logging
import time
from datetime import date
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parent.parent
PASTA_GERADOS = RAIZ / "dados" / "gerados"

log = logging.getLogger("coletores")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


class ErroColeta(Exception):
    """Falha ao buscar ou validar dados. O JSON anterior é mantido."""


def baixar_json(url: str, tentativas: int = 3, timeout: int = 60, silencioso: bool = False):
    """Baixa um JSON com algumas tentativas e espera crescente."""
    ultimo_erro = None
    for n in range(1, tentativas + 1):
        try:
            if not silencioso:
                log.info("GET %s (tentativa %d)", url, n)
            resp = requests.get(url, timeout=timeout, headers={"Accept": "application/json"})
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as erro:
            ultimo_erro = erro
            time.sleep(2 * n)
    raise ErroColeta(f"Não consegui baixar {url}: {ultimo_erro}")


def baixar_linhas(url: str, timeout: int = 120):
    """Baixa um arquivo de texto grande em streaming, linha a linha, sem guardar tudo na memória."""
    log.info("GET %s (streaming)", url)
    try:
        resp = requests.get(url, timeout=timeout, stream=True)
        if resp.status_code == 404:
            raise ErroColeta(f"Arquivo não encontrado: {url}")
        resp.raise_for_status()
        for linha in resp.iter_lines(decode_unicode=False):
            yield linha.decode("utf-8")
    except requests.RequestException as erro:
        raise ErroColeta(f"Não consegui baixar {url}: {erro}") from erro


def formatar_numero(valor: float, casas: int = 1) -> str:
    """Formato brasileiro: 1234.5 -> '1.234,5'."""
    texto = f"{valor:,.{casas}f}"
    return texto.replace(",", "_").replace(".", ",").replace("_", ".")


def para_numero(texto: str) -> float | None:
    """Converte o valor da API em float. Símbolos de ausência viram None."""
    if texto is None:
        return None
    texto = str(texto).strip()
    if texto in {"", "-", "..", "...", "X"}:
        return None
    return float(texto.replace(",", "."))


def salvar_json(nome: str, dados: dict) -> Path:
    """Grava o JSON em dados/gerados, só se o conteúdo mudou (ignora a data)."""
    PASTA_GERADOS.mkdir(parents=True, exist_ok=True)
    destino = PASTA_GERADOS / f"{nome}.json"

    if destino.exists():
        anterior = json.loads(destino.read_text(encoding="utf-8"))
        sem_data = lambda d: {k: v for k, v in d.items() if k != "atualizado_em"}
        if sem_data(anterior) == sem_data(dados):
            log.info("%s sem mudanças, arquivo mantido", destino.name)
            return destino

    dados = {**dados, "atualizado_em": date.today().isoformat()}
    destino.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log.info("Gravado %s", destino)
    return destino
