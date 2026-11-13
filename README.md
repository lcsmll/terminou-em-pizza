# Terminou em Pizza

Dados públicos do Brasil, servidos em fatias.

**Veja o site: https://lcsmll.github.io/terminou-em-pizza/**

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

## Publicação e atualização

- O GitHub Pages publica a branch `main`. O `index.html` da raiz leva para `site/`.
- O workflow `.github/workflows/coletar.yml` roda toda segunda-feira às 6h (horário de Brasília). Ele roda os testes e os três coletores, e faz commit dos JSONs que mudaram. Esse commit atualiza o site.
- Um coletor que falha não grava nada, e o site continua com o último JSON válido. O run fica vermelho para avisar.
- Para rodar na hora: aba Actions, "Coletar dados", "Run workflow", ou `gh workflow run coletar.yml`.

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
  app.js          lê os JSONs, monta a página e escolhe entre 3D e SVG
  pizza3d.js      pizza 3D: massa, molho, queijo e ingredientes gerados por código
  ingredientes.js receita e cor de cada ingrediente (sem Three.js)
  textos.js       explicações de cada pizza e de cada fatia
  graficos.js     gráficos de evolução no tempo (linha e barras), em SVG
tests/            testes dos coletores
```

## Status do roteiro

- [x] Etapa 0: estrutura, README, CLAUDE.md
- [x] Etapa 1: coletor do IPCA com testes, validado com dados reais (outubro de 2026: 9 grupos, soma dos pesos 100,00%)
- [x] Etapa 2: primeira pizza na tela (2D, SVG): as três pizzas, legenda, fonte e data
- [x] Etapa 3: pizza 3D realista (Three.js) e visual do site. O SVG continua como reserva sem WebGL
- [ ] Etapa 4: detalhe da fatia e nota do pizzaiolo (detalhe da fatia, explicação de cada pizza e seção "Por que pizza?" prontos; falta a nota)
- [x] Etapa 5: coletores da Matriz elétrica e das CPIs, com testes e dados reais
- [x] Etapa 6: publicado no GitHub Pages, com coleta automática toda segunda-feira (GitHub Actions)

## A pizza 3D

- Three.js 0.160.0 via CDN (jsDelivr), com versão fixa no import map do `index.html`. Sem build.
- Nenhuma imagem: as texturas de massa, molho, queijo, madeira e embutidos são desenhadas em canvas, e a borda e o queijo recebem ruído determinístico para parecerem feitos à mão.
- O ângulo de cada fatia é proporcional ao valor. O ingrediente identifica a fatia, e a mesma cor aparece na legenda.
- Para girar, arraste. Ao passar o mouse, aparece o nome e o valor da fatia. Clicar tira a fatia da pizza e abre o detalhe. A roda do mouse continua rolando a página.
- Sem WebGL, ou se o CDN falhar, o site mostra a pizza em SVG com a mesma legenda e o mesmo detalhe.

## Ao longo dos anos

Cada pizza é um retrato. A evolução no tempo vai em gráficos de linha ou de barras, logo abaixo da pizza, e a série em destaque acompanha a fatia escolhida.

| Pizza | Gráfico | Período | Fonte |
| --- | --- | --- | --- |
| Pizza Inflação | Inflação de cada ano e peso no orçamento, por grupo | 2012 até hoje | IBGE SIDRA, tabelas 1419 e 7060 |
| Quattro Energie | Participação de cada fonte na geração | 2000 até hoje | ONS, Balanço de energia nos subsistemas |
| Calabresa da CPI | CPIs criadas por ano, por desfecho a partir de 2015 | 1999 até hoje | API da Câmara |

No histórico do ONS, as térmicas (gás, carvão, nuclear, óleo e biomassa) vêm somadas. Os anos fechados ficam guardados no próprio JSON (`cache_balanco`), e o coletor só baixa de novo o ano corrente e o anterior. A API da Câmara repete algumas CPIs antigas com outro número; o coletor conta cada uma só uma vez.

## Fontes

- IPCA: [IBGE SIDRA, tabela 7060](https://sidra.ibge.gov.br/tabela/7060) (variação mensal e peso mensal por grupo)
- Matriz elétrica: [ONS, Geração por usina em base horária](https://dados.ons.org.br/dataset/geracao-usina-2). Soma a geração horária do mês por tipo de combustível. Inclui a geração distribuída (MMGD) estimada pelo ONS. Óleo, biomassa, resíduos industriais e multicombustível ficam juntos em "Outras térmicas".
- CPIs: [API de Dados Abertos da Câmara](https://dadosabertos.camara.leg.br/swagger/api.html). A API não tem campo de desfecho. O coletor considera "relatório aprovado" quando um relatório (REL) da CPI tem tramitação "Aprovação de Proposição Interna". Quando a API não registra o desfecho, a CPI aparece como "sem relatório registrado na API" até ser corrigida em `dados/manual/cpis_desfechos.json`, sempre com link da fonte.

## Autor

Projeto de portfólio de Lucas Mello.
