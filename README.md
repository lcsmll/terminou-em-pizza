# Terminou em Pizza

Dados públicos do Brasil, servidos em fatias.

"Terminar em pizza" é quando um assunto sério acaba sem consequência. Este projeto inverte a piada: a pizza vira uma forma séria de mostrar dados reais. Cada pizza é um tema, cada fatia é uma parte do todo, e o pizzaiolo resume o que os números dizem.

## Cardápio da v1

| Sabor | Tema | Fonte | Status |
| --- | --- | --- | --- |
| Pizza Inflação | Pesos dos grupos do IPCA | IBGE SIDRA | Coletor validado com dados reais |
| Quattro Energie | Matriz elétrica por fonte | ONS Dados Abertos | A fazer |
| Calabresa da CPI | Desfechos das CPIs | Câmara dos Deputados + curadoria manual | A fazer |

## Como funciona

```
Fontes públicas -> coletores Python -> dados/gerados/*.json -> site estático (GitHub Pages)
                   (GitHub Actions, toda semana)
```

O site só lê os JSONs do repositório. Não há servidor, banco de dados nem chave de API no navegador.

## Rodar localmente

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python -m coletores.ipca          # gera dados/gerados/ipca.json
python -m unittest discover -s tests
```

## Estrutura

```
coletores/        scripts que buscam e tratam os dados
dados/gerados/    JSONs que o site lê
dados/manual/     dados curados à mão, sempre com link da fonte
site/             página estática
tests/            testes dos coletores
```

## Status do roteiro

- [x] Etapa 0: estrutura, README, CLAUDE.md
- [x] Etapa 1: coletor do IPCA com testes, validado com dados reais (outubro de 2026: 9 grupos, soma dos pesos 100,00%)
- [ ] Etapa 2: primeira pizza na tela (2D)
- [ ] Etapa 3: pizza 3D
- [ ] Etapa 4: detalhe da fatia e nota do pizzaiolo
- [ ] Etapa 5: Matriz elétrica e CPIs
- [ ] Etapa 6: GitHub Actions e GitHub Pages

## Fontes

- IPCA: [IBGE SIDRA, tabela 7060](https://sidra.ibge.gov.br/tabela/7060) (variação mensal e peso mensal por grupo)

## Autor

Projeto de portfólio de Lucas Mello.
