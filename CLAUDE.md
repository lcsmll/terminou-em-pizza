# CLAUDE.md — Terminou em Pizza

Leia este arquivo e o README antes de qualquer tarefa. No fim de cada sessão, atualize o README com o que mudou.

## O projeto

Site estático (GitHub Pages) que mostra dados públicos reais do Brasil em formato de pizza.
Cada pizza é um tema, cada fatia uma categoria, cada ingrediente identifica um grupo e o pizzaiolo dá uma frase e uma nota.
Pizzas da v1: IPCA, Matriz elétrica, CPIs.

## Regras

- Coletores: Python 3.11, só `requests` e biblioteca padrão.
- Site: HTML, CSS e JavaScript puros. Three.js via CDN com versão fixa (0.160.0, no import map). Sem framework e sem build.
- Ingrediente novo: adicionar a receita em `site/ingredientes.js`, senão a fatia sai só com orégano.
- Fatia ou pizza nova: escrever a explicação em `site/textos.js` (o que é, o que é cada fatia, cuidado ao ler). Texto neutro, sem números.
- Textos em português, sem emoji.
- Todo número exibido precisa ter fonte e data de atualização.
- Nunca inventar dado. Se um valor não existe, o coletor falha com mensagem clara e o site mantém o último JSON válido.
- Pizza só para dados que são partes de um todo. Detalhe e evolução no tempo vão em gráfico de linha ou barra.
- Tom neutro: contagens e fontes, sem apontar culpados.

## Formato padrão dos JSONs (dados/gerados/*.json)

```
{
  "tema": "IPCA",
  "sabor": "Pizza Inflação",
  "periodo": "AAAA-MM",
  "total": 100.0,
  "unidade": "%",
  "fonte": {"nome": "...", "url": "..."},
  "atualizado_em": "AAAA-MM-DD",
  "fatias": [
    {"ordem": 1, "codigo": "...", "nome": "...", "ingrediente": "...", "valor": 0.0, "detalhe": {}}
  ],
  "pizzaiolo": {"frase": "...", "nota": null, "regra": null}
}
```

`fatias` vem ordenada da mais pesada para a mais leve. `valor` é o que define o tamanho da fatia.

## Comandos

- Rodar um coletor: `python -m coletores.ipca` (também `matriz_eletrica` e `cpis`)
- Testes: `python -m unittest discover -s tests`
- Ver o site localmente: `python -m http.server 8000` na raiz e abrir `http://localhost:8000/site/`

## Roteiro

0. Estrutura do projeto (feito)
1. Coletor do IPCA (feito e validado com dados reais)
2. Primeira pizza na tela (2D, SVG) (feito; hoje é a reserva sem WebGL)
3. Pizza 3D (Three.js) (feito: pizza realista, texturas em canvas, visual de pizzaria)
4. Detalhe da fatia e pizzaiolo (detalhe feito; falta a nota)
5. Matriz elétrica e CPIs (coletores feitos e validados com dados reais)
6. Automação (GitHub Actions) e publicação (GitHub Pages)
