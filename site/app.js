// Terminou em Pizza: lê os JSONs de dados/gerados e serve cada pizza em 3D.
// Sem WebGL (ou se o Three.js não carregar), a pizza aparece em SVG.

import { corDoIngrediente } from "./ingredientes.js";
import { EXPLICACOES } from "./textos.js";

const PASTA_DADOS = "../dados/gerados/";

// Ordem do cardápio. "arquivo" é o nome do JSON gerado pelo coletor.
const CARDAPIO = [
  { id: "ipca", arquivo: "ipca.json", rotulo: "Pizza Inflação", tema: "IPCA" },
  { id: "matriz", arquivo: "matriz_eletrica.json", rotulo: "Quattro Energie", tema: "Matriz elétrica" },
  { id: "cpis", arquivo: "cpis.json", rotulo: "Calabresa da CPI", tema: "CPIs" },
];

// Cores do gráfico em SVG, usado só quando não há 3D
const CORES_SVG = [
  "#d4402b", "#e8902f", "#e9c046", "#7aa249", "#3f8f7a",
  "#4f7fb8", "#8a5aa8", "#9b8b7a", "#c0622b", "#5c4a3d",
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

// ---------- pizza 3D (carregada sob demanda) ----------

let palcoPromessa = null;
let palco = null;
let aoEscolherAtual = () => {};
let rotuloAtual = () => "";

function obterPalco() {
  if (!palcoPromessa) {
    palcoPromessa = (async () => {
      const teste = document.createElement("canvas");
      if (!(teste.getContext("webgl2") || teste.getContext("webgl"))) return null;
      try {
        const modulo = await import("./pizza3d.js");
        const lugar = document.createElement("div");
        palco = modulo.criarPalco(lugar, {
          aoEscolher: (fatia) => aoEscolherAtual(fatia),
          rotulo: (fatia) => rotuloAtual(fatia),
        });
        return palco;
      } catch (erro) {
        console.warn("Pizza 3D indisponível, usando SVG:", erro);
        return null;
      }
    })();
  }
  return palcoPromessa;
}

// ---------- pizza em SVG (reserva) ----------

const NS = "http://www.w3.org/2000/svg";
const RAIO = 100;

function ponto(angulo) {
  // ângulo 0 no topo, sentido horário
  return [RAIO * Math.sin(angulo), -RAIO * Math.cos(angulo)];
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

function desenharSvg(svg, dados, aoEscolher) {
  svg.replaceChildren();
  const soma = dados.fatias.reduce((s, f) => s + f.valor, 0);
  let angulo = 0;
  dados.fatias.forEach((fatia, i) => {
    const fim = angulo + (fatia.valor / soma) * 2 * Math.PI;
    const caminho = document.createElementNS(NS, "path");
    caminho.setAttribute("d", caminhoFatia(angulo, fim));
    caminho.setAttribute("fill", CORES_SVG[i % CORES_SVG.length]);
    caminho.setAttribute("class", "fatia");
    caminho.dataset.codigo = fatia.codigo;
    const titulo = document.createElementNS(NS, "title");
    titulo.textContent = `${fatia.nome}: ${rotuloValor(dados, fatia)}`;
    caminho.append(titulo);
    caminho.addEventListener("click", () => aoEscolher(fatia));
    svg.append(caminho);
    angulo = fim;
  });
}

// ---------- detalhe de cada tema ----------

function listaDados(pares) {
  const dl = document.createElement("dl");
  for (const [rotulo, valor] of pares) {
    if (valor === null || valor === undefined) continue;
    const item = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = rotulo;
    const dd = document.createElement("dd");
    dd.textContent = valor;
    item.append(dt, dd);
    dl.append(item);
  }
  return dl;
}

const sinal = (v, casas) => `${v > 0 ? "+" : ""}${numero(v, casas)}`;

const DETALHES = {
  IPCA(fatia) {
    const d = fatia.detalhe;
    return [listaDados([
      ["Peso no orçamento", `${numero(d.peso_pct, 2)}%`],
      ["Variação de preço no mês", d.variacao_mes_pct === null ? "sem dado" : `${sinal(d.variacao_mes_pct, 2)}%`],
      ["Contribuição para o IPCA do mês",
        d.contribuicao_pp === null ? "sem dado" : `${sinal(d.contribuicao_pp, 2)} ponto percentual`],
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
      p.className = "subtitulo";
      p.textContent = "O que tem nesta fatia";
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
      periodo.className = "datas";
      periodo.textContent = `${dataBR(cpi.inicio)} a ${cpi.fim ? dataBR(cpi.fim) : "hoje"}`;
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
      link.textContent = cpi.origem === "manual" ? "Fonte (curadoria manual)" : "Registro na API da Câmara";
      li.append(link);
      lista.append(li);
    }
    return [lista];
  },
};

// ---------- página ----------

function montarPizza(dados, comPalco) {
  const artigo = document.getElementById("modelo-pizza").content.firstElementChild.cloneNode(true);
  artigo.querySelector(".tema").textContent = dados.tema;
  artigo.querySelector(".sabor").textContent = dados.sabor;
  artigo.querySelector(".periodo").textContent = dados.periodo_nome || dados.periodo;
  artigo.querySelector(".total").textContent = rotuloTotal(dados);
  artigo.querySelector(".pizzaiolo blockquote").textContent = dados.pizzaiolo.frase;

  const explicacao = EXPLICACOES[dados.tema];
  if (explicacao) {
    artigo.querySelector(".resumo-tema").textContent = explicacao.resumo;
    artigo.querySelector(".entenda .blocos").replaceChildren(...explicacao.blocos.map((bloco) => {
      const div = document.createElement("div");
      div.className = "bloco";
      const h4 = document.createElement("h4");
      h4.textContent = bloco.titulo;
      div.append(h4, ...bloco.texto.map((texto) => {
        const p = document.createElement("p");
        p.textContent = texto;
        return p;
      }));
      return div;
    }));
  } else {
    artigo.querySelector(".resumo-tema").remove();
    artigo.querySelector(".entenda").remove();
  }

  const fonte = artigo.querySelector(".fonte");
  fonte.href = dados.fonte.url;
  fonte.textContent = dados.fonte.nome;
  const atualizado = artigo.querySelector(".atualizado");
  atualizado.dateTime = dados.atualizado_em;
  atualizado.textContent = dataBR(dados.atualizado_em);

  const descricao = `${dados.sabor}: ${dados.fatias.map((f) => `${f.nome} ${rotuloValor(dados, f)}`).join("; ")}`;
  const lugar = artigo.querySelector(".palco");
  const svg = artigo.querySelector(".grafico");
  const instrucao = artigo.querySelector(".instrucao");

  const corDaFatia = (fatia) => comPalco
    ? corDoIngrediente(fatia.ingrediente)
    : CORES_SVG[dados.fatias.indexOf(fatia) % CORES_SVG.length];

  const escolher = (fatia) => {
    const secao = artigo.querySelector(".detalhe");
    const titulo = document.createElement("h3");
    titulo.innerHTML = `<span class="amostra" aria-hidden="true"></span><span></span><small></small>`;
    titulo.querySelector(".amostra").style.setProperty("--cor", corDaFatia(fatia));
    titulo.querySelector("span:not(.amostra)").textContent = fatia.nome;
    titulo.querySelector("small").textContent = `${fatia.ingrediente} · ${rotuloValor(dados, fatia)}`;
    const significado = explicacao && explicacao.fatias[fatia.nome];
    const extra = [];
    if (significado) {
      const p = document.createElement("p");
      p.className = "significado";
      p.textContent = significado;
      extra.push(p);
    }
    const montar = DETALHES[dados.tema];
    secao.replaceChildren(titulo, ...extra, ...(montar ? montar(fatia) : []));

    artigo.querySelectorAll("[data-codigo]").forEach((el) => {
      const sim = el.dataset.codigo === fatia.codigo;
      el.classList.toggle("escolhida", sim);
      if (el.tagName === "BUTTON") el.setAttribute("aria-pressed", String(sim));
    });
    if (comPalco) palco.selecionar(fatia.codigo);
  };

  if (comPalco) {
    lugar.setAttribute("aria-label", descricao);
    instrucao.textContent = "Arraste para girar. Clique numa fatia para tirar da pizza.";
    aoEscolherAtual = escolher;
    rotuloAtual = (fatia) => rotuloValor(dados, fatia);
  } else {
    lugar.remove();
    svg.removeAttribute("hidden"); // SVGElement não tem a propriedade hidden
    svg.setAttribute("aria-label", descricao);
    desenharSvg(svg, dados, escolher);
    instrucao.textContent = "Clique numa fatia para ver o detalhe.";
  }

  const lista = artigo.querySelector(".fatias");
  dados.fatias.forEach((fatia) => {
    const li = document.createElement("li");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.dataset.codigo = fatia.codigo;
    botao.setAttribute("aria-pressed", "false");
    botao.style.setProperty("--cor", corDaFatia(fatia));
    botao.innerHTML = `<span class="amostra" aria-hidden="true"></span>
      <span class="nome"></span><span class="ingrediente"></span><span class="valor"></span>
      <span class="barra" aria-hidden="true"><span></span></span>`;
    botao.querySelector(".nome").textContent = fatia.nome;
    botao.querySelector(".ingrediente").textContent = fatia.ingrediente;
    botao.querySelector(".valor").textContent = rotuloValor(dados, fatia);
    botao.querySelector(".barra span").style.width = `${(fatia.valor / dados.fatias[0].valor) * 100}%`;
    botao.addEventListener("click", () => escolher(fatia));
    if (comPalco) {
      botao.addEventListener("mouseenter", () => palco.destacar(fatia.codigo));
      botao.addEventListener("mouseleave", () => palco.destacar(null));
      botao.addEventListener("focus", () => palco.destacar(fatia.codigo));
      botao.addEventListener("blur", () => palco.destacar(null));
    }
    li.append(botao);
    lista.append(li);
  });

  return artigo;
}

function montarCardapio(ativo) {
  const nav = document.getElementById("cardapio");
  nav.replaceChildren(...CARDAPIO.map((item, i) => {
    const a = document.createElement("a");
    a.href = `#${item.id}`;
    a.innerHTML = `<span class="num"></span><span class="sabor-menu"></span><span class="tema-menu"></span>`;
    a.querySelector(".num").textContent = String(i + 1).padStart(2, "0");
    a.querySelector(".sabor-menu").textContent = item.rotulo;
    a.querySelector(".tema-menu").textContent = item.tema;
    if (item.id === ativo) a.setAttribute("aria-current", "page");
    return a;
  }));
}

let pizzaAtual = null;

async function abrir() {
  const id = location.hash.slice(1);
  let item = CARDAPIO.find((p) => p.id === id);
  if (!item) {
    // âncora da página, como #por-que-pizza: só rola, sem trocar a pizza
    if (pizzaAtual && document.getElementById(id)) return;
    item = pizzaAtual || CARDAPIO[0];
  }
  pizzaAtual = item;
  montarCardapio(item.id);

  const conteudo = document.getElementById("conteudo");
  try {
    const [dados, comPalco] = await Promise.all([carregar(item), obterPalco()]);
    const artigo = montarPizza(dados, Boolean(comPalco));
    conteudo.replaceChildren(artigo);
    if (comPalco) {
      palco.anexar(artigo.querySelector(".palco"));
      palco.servir(dados);
    }
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
