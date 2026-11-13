# Terminou em Pizza

Dados públicos do Brasil, servidos em fatias.

"Terminar em pizza" é quando um assunto sério acaba sem consequência. Este projeto inverte a piada: a pizza vira uma forma séria de mostrar dados reais. Cada pizza é um tema, cada fatia é uma parte do todo, e o pizzaiolo resume o que os números dizem.

## Cardápio da v1

| Sabor | Tema | Fonte | Status |
| --- | --- | --- | --- |
| Pizza Inflação | Pesos dos grupos do IPCA | IBGE SIDRA | Coletor validado com dados reais |
| Quattro Energie | Geração de eletricidade por fonte no último mês completo | ONS Dados Abertos | Coletor validado com dados reais |
| Calabresa da CPI | Desfechos das CPIs da Câmara criadas desde 2015 | Câmara dos Deputados + curadoria manual | Coletor validado com dados reais |

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

python -m coletores.ipca              # gera dados/gerados/ipca.json
python -m coletores.matriz_eletrica   # gera dados/gerados/matriz_eletrica.json (baixa ~70 MB)
python -m coletores.cpis              # gera dados/gerados/cpis.json
python -m unittest discover -s tests

python -m http.server 8000            # e abra http://localhost:8000/site/
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
- [x] Etapa 2: primeira pizza na tela (2D, SVG): as três pizzas, legenda, fonte e data. Visual provisório, design a fazer
- [ ] Etapa 3: pizza 3D
- [ ] Etapa 4: detalhe da fatia e nota do pizzaiolo (detalhe da fatia pronto; falta a nota)
- [x] Etapa 5: coletores da Matriz elétrica e das CPIs, com testes e dados reais
- [ ] Etapa 6: GitHub Actions e GitHub Pages

## Fontes

- IPCA: [IBGE SIDRA, tabela 7060](https://sidra.ibge.gov.br/tabela/7060) (variação mensal e peso mensal por grupo)
- Matriz elétrica: [ONS, Geração por usina em base horária](https://dados.ons.org.br/dataset/geracao-usina-2). Soma a geração horária do mês por tipo de combustível. Inclui a geração distribuída (MMGD) estimada pelo ONS. Óleo, biomassa, resíduos industriais e multicombustível ficam juntos em "Outras térmicas".
- CPIs: [API de Dados Abertos da Câmara](https://dadosabertos.camara.leg.br/swagger/api.html). A API não tem campo de desfecho. O coletor considera "relatório aprovado" quando um relatório (REL) da CPI tem tramitação "Aprovação de Proposição Interna". Quando a API não registra o desfecho, a CPI aparece como "sem relatório registrado na API" até ser corrigida em `dados/manual/cpis_desfechos.json`, sempre com link da fonte.

## Autor

Projeto de portfólio de Lucas Mello.
