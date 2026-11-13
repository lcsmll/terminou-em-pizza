// Terminou em Pizza: lê os JSONs de dados/gerados e monta cada pizza em SVG.
// Sem framework e sem build. O visual definitivo entra na etapa de design.

"use strict";

const PASTA_DADOS = "../dados/gerados/";

// Ordem do cardápio. "arquivo" é o nome do JSON gerado pelo coletor.
const CARDAPIO = [
  { id: "ipca", arquivo: "ipca.json", rotulo: "Pizza Inflação" },
  { id: "matriz", arquivo: "matriz_eletrica.json", rotulo: "Quattro Energie" },
  { id: "cpis", arquivo: "cpis.json", rotulo: "Calabresa da CPI" },
];

// Cores provisórias, uma por posição da fatia. Serão trocadas no design.
const CORES = [
  "#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#16a085",
  "#2980b9", "#8e44ad", "#7f8c8d", "#d35400", "#2c3e50",
];

const numero = (valor, casas = 1) =>
  Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

const dataBR = (iso) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

const cache = new Map();

async function carregar(item) {
  if (!cache.has(item.id)) {
    const resposta = await fetch(PASTA_DADOS + item.arquivo, { cache: "no-cache" });
    if (!resposta.ok) throw new Error(`${item.arquivo}: HTTP ${resposta.status}`);
    cache.set(item.id, await resposta.json());
  }
  return cache.get(item.id);
}

// ---------- valores exibidos ----------

// Texto curto do tamanho da fatia, conforme a unidade do JSON.
function rotuloValor(dados, fatia) {
  if (dados.unidade === "%") return `${numero(fatia.valor)}%`;
  const pct = (fatia.valor / dados.total) * 100;
  return `${fatia.valor} ${dados.unidade} (${numero(pct)}%)`;
}

function rotuloTotal(dados) {
  if (dados.unidade === "%") return `${dados.fatias.length} fatias somando ${numero(dados.total)}%`;
  return `${dados.total} ${dados.unidade} no total`;
}

// ---------- SVG ----------

const NS = "http://www.w3.org/2000/svg";
const RAIO = 100;

function ponto(angulo, raio = RAIO) {
  // ângulo 0 no topo, sentido horário
  return [raio * Math.sin(angulo), -raio * Math.cos(angulo)];
}

function caminhoFatia(inicio, fim) {
  if (fim - inicio >= 2 * Math.PI - 1e-9) {
    return `M 0 ${-RAIO} A ${RAIO} ${RAIO} 0 1 1 0 ${RAIO} A ${RAIO} ${RAIO} 0 1 1 0 ${-RAIO} Z`;
  }
  const [x1, y1] = ponto(inicio);
  const [x2, y2] = ponto(fim);
  const grande = fim - inicio > Math.PI ? 1 : 0;
  return `M 0 0 L ${x1} ${y1} A ${RAIO} ${RAIO} 0 ${grande} 1 ${x2} ${y2} Z`;
}

function desenharPizza(svg, dados, aoEscolher) {
  svg.replaceChildren();
  svg.setAttribute("aria-label", `${dados.sabor}: ${dados.fatias.map((f) => `${f.nome} ${rotuloValor(dados, f)}`).join("; ")}`);

  const soma = dados.fatias.reduce((s, f) => s + f.valor, 0);
  let angulo = 0;
  dados.fatias.forEach((fatia, i) => {
    const fim = angulo + (fatia.valor / soma) * 2 * Math.PI;
    const caminho = document.createElementNS(NS, "path");
    caminho.setAttribute("d", caminhoFatia(angulo, fim));
    caminho.setAttribute("fill", CORES[i % CORES.length]);
    caminho.setAttribute("class", "fatia");
    caminho.setAttribute("tabindex", "0");
    caminho.setAttribute("role", "button");
    caminho.setAttribute("aria-label", `${fatia.nome}, ${rotuloValor(dados, fatia)}`);
    caminho.dataset.codigo = fatia.codigo;

    const titulo = document.createElementNS(NS, "title");
    titulo.textContent = `${fatia.nome}: ${rotuloValor(dados, fatia)}`;
    caminho.append(titulo);

    caminho.addEventListener("click", () => aoEscolher(fatia));
    caminho.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        aoEscolher(fatia);
      }
    });
    svg.append(caminho);
    angulo = fim;
  });
}

// ---------- detalhe de cada tema ----------

function linhaDado(rotulo, valor) {
  const dt = document.createElement("dt");
  dt.textContent = rotulo;
  const dd = document.createElement("dd");
  dd.textContent = valor;
  return [dt, dd];
}

function listaDados(pares) {
  const dl = document.createElement("dl");
  pares.filter(([, v]) => v !== null && v !== undefined).forEach(([r, v]) => dl.append(...linhaDado(r, v)));
  return dl;
}

const DETALHES = {
  IPCA(fatia) {
    const d = fatia.detalhe;
    const variacao = d.variacao_mes_pct;
    return [listaDados([
      ["Peso no orçamento", `${numero(d.peso_pct, 2)}%`],
      ["Variação no mês", variacao === null ? "sem dado" : `${numero(variacao, 2)}%`],
      ["Contribuição para o IPCA", d.contribuicao_pp === null ? "sem dado" : `${numero(d.contribuicao_pp, 2)} ponto percentual`],
    ])];
  },

  "Matriz elétrica"(fatia) {
    const d = fatia.detalhe;
    const blocos = [listaDados([
      ["Participação na geração", `${numero(fatia.valor, 2)}%`],
      ["Energia gerada no mês", `${numero(d.energia_gwh)} GWh`],
      ["Potência média", `${numero(d.potencia_media_mwmed)} MWmed`],
      ["Geração distribuída (telhados e pequenas usinas)",
        d.geracao_distribuida_pct === undefined ? null : `${numero(d.geracao_distribuida_pct)}% da fatia`],
    ])];
    if (d.composicao_pct) {
      const p = document.createElement("p");
      p.textContent = "Composição da fatia:";
      blocos.push(p, listaDados(Object.entries(d.composicao_pct).map(([nome, pct]) => [nome, `${numero(pct)}%`])));
    }
    return blocos;
  },

  CPIs(fatia) {
    const lista = document.createElement("ul");
    lista.className = "lista-cpis";
    for (const cpi of fatia.detalhe.cpis) {
      const li = document.createElement("li");
      const nome = document.createElement("strong");
      nome.textContent = cpi.nome;
      const periodo = document.createElement("span");
      periodo.textContent = ` (${dataBR(cpi.inicio)} a ${cpi.fim ? dataBR(cpi.fim) : "hoje"})`;
      li.append(nome, periodo);
      if (cpi.evidencia) {
        const ev = document.createElement("p");
        ev.textContent = cpi.evidencia;
        li.append(ev);
      }
      const link = document.createElement("a");
      link.href = cpi.fonte_manual || cpi.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = cpi.origem === "manual" ? "fonte (curadoria manual)" : "registro na API da Câmara";
      li.append(" ", link);
      lista.append(li);
    }
    return [lista];
  },
};

function mostrarDetalhe(artigo, dados, fatia) {
  const secao = artigo.querySelector(".detalhe");
  secao.hidden = false;
  secao.querySelector("h3").textContent = `${fatia.nome} · ${fatia.ingrediente}`;
  const montar = DETALHES[dados.tema];
  secao.querySelector(".corpo").replaceChildren(...(montar ? montar(fatia) : []));

  artigo.querySelectorAll("[data-codigo]").forEach((el) => {
    el.classList.toggle("escolhida", el.dataset.codigo === fatia.codigo);
  });
}

// ---------- página ----------

function montarPizza(dados) {
  const artigo = document.getElementById("modelo-pizza").content.firstElementChild.cloneNode(true);
  artigo.querySelector(".tema").textContent = dados.tema;
  artigo.querySelector(".sabor").textContent = dados.sabor;
  artigo.querySelector(".periodo").textContent = dados.periodo_nome || dados.periodo;
  artigo.querySelector(".total").textContent = rotuloTotal(dados);
  artigo.querySelector(".pizzaiolo").textContent = dados.pizzaiolo.frase;

  const fonte = artigo.querySelector(".fonte");
  fonte.href = dados.fonte.url;
  fonte.textContent = dados.fonte.nome;
  const atualizado = artigo.querySelector(".atualizado");
  atualizado.dateTime = dados.atualizado_em;
  atualizado.textContent = dataBR(dados.atualizado_em);

  const escolher = (fatia) => mostrarDetalhe(artigo, dados, fatia);
  desenharPizza(artigo.querySelector(".grafico"), dados, escolher);

  const lista = artigo.querySelector(".fatias");
  dados.fatias.forEach((fatia, i) => {
    const li = document.createElement("li");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.dataset.codigo = fatia.codigo;
    botao.style.setProperty("--cor", CORES[i % CORES.length]);
    botao.innerHTML = `<span class="amostra" aria-hidden="true"></span>
      <span class="nome"></span><span class="ingrediente"></span><span class="valor"></span>`;
    botao.querySelector(".nome").textContent = fatia.nome;
    botao.querySelector(".ingrediente").textContent = fatia.ingrediente;
    botao.querySelector(".valor").textContent = rotuloValor(dados, fatia);
    botao.addEventListener("click", () => escolher(fatia));
    li.append(botao);
    lista.append(li);
  });

  return artigo;
}

function montarCardapio(ativo) {
  const nav = document.getElementById("cardapio");
  nav.replaceChildren(...CARDAPIO.map((item) => {
    const a = document.createElement("a");
    a.href = `#${item.id}`;
    a.textContent = item.rotulo;
    if (item.id === ativo) a.setAttribute("aria-current", "page");
    return a;
  }));
}

async function abrir() {
  const id = location.hash.slice(1);
  const item = CARDAPIO.find((p) => p.id === id) || CARDAPIO[0];
  montarCardapio(item.id);

  const conteudo = document.getElementById("conteudo");
  try {
    const dados = await carregar(item);
    conteudo.replaceChildren(montarPizza(dados));
    document.title = `${dados.sabor} · Terminou em Pizza`;
  } catch (erro) {
    const aviso = document.createElement("p");
    aviso.className = "aviso erro";
    aviso.textContent = `Esta pizza não saiu do forno: não foi possível ler os dados (${erro.message}).`;
    conteudo.replaceChildren(aviso);
  }
}

window.addEventListener("hashchange", abrir);
abrir();
