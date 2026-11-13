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


def baixar_json(url: str, tentativas: int = 3, timeout: int = 60):
    """Baixa um JSON com algumas tentativas e espera crescente."""
    ultimo_erro = None
    for n in range(1, tentativas + 1):
        try:
            log.info("GET %s (tentativa %d)", url, n)
            resp = requests.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as erro:
            ultimo_erro = erro
            time.sleep(2 * n)
    raise ErroColeta(f"Não consegui baixar {url}: {ultimo_erro}")


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
