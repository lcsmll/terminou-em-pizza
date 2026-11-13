// Gráficos de evolução no tempo (linha e barras) em SVG puro.
// Foco e contexto: a série da fatia escolhida aparece em destaque, a referência
// (o total) tracejada, e as demais em cinza ao fundo. Um eixo só.

const NS = "http://www.w3.org/2000/svg";
const MARGEM = { topo: 16, direita: 16, baixo: 30, esquerda: 44 };
const ALTURA = 280;

const numero = (valor, casas) =>
  Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

function el(nome, atributos = {}, pai = null) {
  const e = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, v);
  if (pai) pai.append(e);
  return e;
}

// Marcas "redondas" para o eixo: 0, 5, 10... ou 0, 20, 40...
function escalaBonita(min, max, alvo = 5, inteiro = false) {
  const passoBruto = Math.max((max - min) / alvo || 1, inteiro ? 1 : 0);
  const potencia = 10 ** Math.floor(Math.log10(passoBruto));
  const multiplos = inteiro ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const passo = multiplos.map((m) => m * potencia).find((p) => p >= passoBruto);
  const inicio = Math.floor(min / passo) * passo;
  const fim = Math.ceil(max / passo) * passo;
  const marcas = [];
  for (let v = inicio; v <= fim + passo / 2; v += passo) marcas.push(Math.round(v * 1e6) / 1e6);
  return { inicio, fim, marcas, passo };
}

function rotuloAno(spec, i) {
  const r = spec.rotulos[i];
  return spec.parcial && spec.parcial.rotulo === r ? `${r} (${spec.parcial.texto})` : r;
}

function textoValor(spec, v) {
  if (v === null || v === undefined) return "sem dado";
  return spec.unidade === "%" ? `${numero(v, spec.casas)}%` : `${numero(v, spec.casas)} ${spec.unidade}`;
}

// ---------- tabela (os números por trás do gráfico) ----------

function tabela(spec) {
  const detalhes = document.createElement("details");
  detalhes.className = "tabela-grafico";
  const resumo = document.createElement("summary");
  resumo.textContent = "Ver os números";
  const rolagem = document.createElement("div");
  rolagem.className = "rolagem";
  const t = document.createElement("table");
  const colunas = [...(spec.referencia ? [[spec.referencia.nome, spec.referencia.valores]] : []), ...Object.entries(spec.series)];
  const cab = t.createTHead().insertRow();
  ["Ano", ...colunas.map(([n]) => n)].forEach((n) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = n;
    cab.append(th);
  });
  const corpo = t.createTBody();
  spec.rotulos.forEach((_, i) => {
    const linha = corpo.insertRow();
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = rotuloAno(spec, i);
    linha.append(th);
    colunas.forEach(([, valores]) => {
      linha.insertCell().textContent = valores[i] === null ? "–" : numero(valores[i], spec.casas);
    });
  });
  rolagem.append(t);
  detalhes.append(resumo, rolagem);
  return detalhes;
}

// ---------- desenho ----------

// Com poucas séries, cada linha ganha o nome no fim (sem depender só da cor)
const ROTULAR_ATE = 4;
const ESPACO_ROTULOS = 104;

function desenharLinha(svg, spec, destaque, largura, aoPassar) {
  const n = spec.rotulos.length;
  const rotular = Object.keys(spec.series).length <= ROTULAR_ATE;
  const direita = MARGEM.direita + (rotular ? ESPACO_ROTULOS : 0);
  const valores = [
    ...Object.values(spec.series).flat(),
    ...(spec.referencia ? spec.referencia.valores : []),
  ].filter((v) => v !== null);
  const esc = escalaBonita(Math.min(0, ...valores), Math.max(...valores));
  const w = largura - MARGEM.esquerda - direita;
  const h = ALTURA - MARGEM.topo - MARGEM.baixo;
  const x = (i) => MARGEM.esquerda + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v) => MARGEM.topo + h - ((v - esc.inicio) / (esc.fim - esc.inicio)) * h;

  eixos(svg, spec, esc, x, y, largura, n, direita);

  const caminho = (vals) => {
    let d = "";
    vals.forEach((v, i) => {
      if (v === null) return;
      d += `${d && vals[i - 1] !== null ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    });
    return d;
  };

  // contexto: as outras séries, finas e cinza
  for (const [nome, vals] of Object.entries(spec.series)) {
    if (nome === destaque) continue;
    el("path", { d: caminho(vals), class: "linha-contexto" }, svg);
  }
  if (spec.referencia) el("path", { d: caminho(spec.referencia.valores), class: "linha-referencia" }, svg);

  const vals = spec.series[destaque];
  if (vals) {
    el("path", { d: caminho(vals), class: "linha-destaque" }, svg);
    vals.forEach((v, i) => {
      if (v === null) return;
      const parcial = spec.parcial && spec.rotulos[i] === spec.parcial.rotulo;
      el("circle", { cx: x(i), cy: y(v), r: 4, class: parcial ? "ponto-destaque parcial" : "ponto-destaque" }, svg);
    });
  }

  if (rotular) {
    // rótulos no fim das linhas, afastados uns dos outros pelo menos 13px
    const rotulos = Object.entries(spec.series)
      .map(([nome, v]) => ({ nome, y: y(v[v.length - 1] ?? 0) }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < rotulos.length; i++) rotulos[i].y = Math.max(rotulos[i].y, rotulos[i - 1].y + 13);
    for (const r of rotulos) {
      const texto = el("text", { x: x(n - 1) + 8, y: r.y, class: r.nome === destaque ? "rotulo-serie destaque" : "rotulo-serie" }, svg);
      texto.textContent = r.nome;
    }
  }

  // mira e área de toque cobrindo todo o gráfico
  const mira = el("line", { class: "mira", y1: MARGEM.topo, y2: MARGEM.topo + h, visibility: "hidden" }, svg);
  const alvo = el("rect", { x: MARGEM.esquerda, y: MARGEM.topo, width: w, height: h, class: "alvo" }, svg);
  const indice = (evento) => {
    const caixa = svg.getBoundingClientRect();
    const px = ((evento.clientX - caixa.left) / caixa.width) * largura;
    return Math.max(0, Math.min(n - 1, Math.round(((px - MARGEM.esquerda) / w) * (n - 1))));
  };
  alvo.addEventListener("pointermove", (e) => {
    const i = indice(e);
    mira.setAttribute("x1", x(i));
    mira.setAttribute("x2", x(i));
    mira.setAttribute("visibility", "visible");
    const linhas = [];
    if (vals) linhas.push([destaque, textoValor(spec, vals[i]), "destaque"]);
    if (spec.referencia) linhas.push([spec.referencia.nome, textoValor(spec, spec.referencia.valores[i]), "referencia"]);
    aoPassar({ x: x(i) / largura, titulo: rotuloAno(spec, i), linhas });
  });
  alvo.addEventListener("pointerleave", () => {
    mira.setAttribute("visibility", "hidden");
    aoPassar(null);
  });
}

function desenharBarras(svg, spec, destaque, largura, aoPassar) {
  const n = spec.rotulos.length;
  const nomes = Object.keys(spec.series);
  const neutra = spec.serie_neutra && spec.series[spec.serie_neutra];
  const totais = spec.rotulos.map((_, i) => nomes.reduce((s, nome) => s + (spec.series[nome][i] || 0), 0));
  const esc = escalaBonita(0, Math.max(...totais, 1), 4, spec.casas === 0);
  const w = largura - MARGEM.esquerda - MARGEM.direita;
  const h = ALTURA - MARGEM.topo - MARGEM.baixo;
  const faixa = w / n;
  const larguraBarra = Math.max(3, Math.min(28, faixa * 0.7));
  const x = (i) => MARGEM.esquerda + faixa * (i + 0.5);
  const y = (v) => MARGEM.topo + h - ((v - esc.inicio) / (esc.fim - esc.inicio)) * h;

  eixos(svg, spec, esc, x, y, largura, n, MARGEM.direita);

  spec.rotulos.forEach((_, i) => {
    const doDestaque = spec.series[destaque] ? spec.series[destaque][i] || 0 : 0;
    const semClasse = neutra && destaque !== spec.serie_neutra ? neutra[i] || 0 : 0;
    const resto = totais[i] - doDestaque - semClasse;
    const x0 = x(i) - larguraBarra / 2;
    // o destaque fica apoiado no eixo; os outros empilham em cima, com 2px de folga
    let acumulado = 0;
    for (const [valor, classe] of [[doDestaque, "barra-destaque"], [resto, "barra-contexto"], [semClasse, "barra-neutra"]]) {
      if (valor <= 0) continue;
      const base = acumulado > 0 ? y(acumulado) - 2 : y(0);
      const topo = y(acumulado + valor);
      const inset = classe === "barra-neutra" ? 0.75 : 0; // contorno inteiro dentro da barra
      el("rect", { x: x0 + inset, y: topo + inset, width: larguraBarra - 2 * inset, height: Math.max(1, base - topo - 2 * inset), rx: 2, class: classe }, svg);
      acumulado += valor;
    }
    const alvo = el("rect", { x: x(i) - faixa / 2, y: MARGEM.topo, width: faixa, height: h, class: "alvo" }, svg);
    alvo.addEventListener("pointerenter", () => {
      const linhas = [[destaque, textoValor(spec, doDestaque), "destaque"]];
      for (const nome of nomes) {
        if (nome !== destaque && spec.series[nome][i]) linhas.push([nome, textoValor(spec, spec.series[nome][i]), "contexto"]);
      }
      linhas.push(["Total", textoValor(spec, totais[i]), "total"]);
      aoPassar({ x: x(i) / largura, titulo: rotuloAno(spec, i), linhas });
    });
    alvo.addEventListener("pointerleave", () => aoPassar(null));
  });
}

function eixos(svg, spec, esc, x, y, largura, n, direita) {
  for (const v of esc.marcas) {
    el("line", { x1: MARGEM.esquerda, x2: largura - direita, y1: y(v), y2: y(v), class: v === 0 ? "eixo-zero" : "grade" }, svg);
    const t = el("text", { x: MARGEM.esquerda - 8, y: y(v), class: "rotulo-y" }, svg);
    t.textContent = spec.unidade === "%" ? `${numero(v, esc.passo < 1 ? 1 : 0)}%` : numero(v, 0);
  }
  // rótulos de ano sem amontoar: no máximo um a cada ~56px
  const passo = Math.max(1, Math.ceil(n / ((largura - MARGEM.esquerda - direita) / 56)));
  spec.rotulos.forEach((r, i) => {
    if (i % passo !== 0 && i !== n - 1) return;
    if (i !== n - 1 && n - 1 - i < passo) return; // não colar no último
    const t = el("text", { x: x(i), y: ALTURA - 8, class: "rotulo-x" }, svg);
    t.textContent = r;
  });
}

// ---------- componente ----------

export function criarGrafico(spec) {
  const figura = document.createElement("figure");
  figura.className = "grafico-tempo";

  const titulo = document.createElement("figcaption");
  titulo.innerHTML = `<strong></strong><span class="legenda-grafico"></span>`;
  titulo.querySelector("strong").textContent = spec.titulo;

  const area = document.createElement("div");
  area.className = "area-grafico";
  const dica = document.createElement("div");
  dica.className = "dica-grafico";
  dica.hidden = true;

  const nota = document.createElement("p");
  nota.className = "nota-grafico";
  nota.textContent = spec.nota || "";
  const fonte = document.createElement("p");
  fonte.className = "nota-grafico";
  fonte.innerHTML = `Fonte: <a target="_blank" rel="noopener"></a>`;
  fonte.querySelector("a").href = spec.fonte.url;
  fonte.querySelector("a").textContent = spec.fonte.nome;

  figura.append(titulo, area, nota, fonte, tabela(spec));

  let destaque = Object.keys(spec.series)[0];
  let aviso = "";

  function legenda() {
    const caixa = titulo.querySelector(".legenda-grafico");
    caixa.replaceChildren();
    const item = (classe, texto) => {
      const s = document.createElement("span");
      s.className = `item-legenda ${classe}`;
      s.textContent = texto;
      caixa.append(s);
    };
    item("destaque", destaque);
    if (spec.referencia) item("referencia", spec.referencia.nome);
    const outras = Object.keys(spec.series).filter((n) => n !== destaque && n !== spec.serie_neutra);
    if (outras.length) item("contexto", spec.tipo === "barras" ? "Demais desfechos" : "Demais séries");
    if (spec.serie_neutra && destaque !== spec.serie_neutra) item("neutra", spec.serie_neutra);
    if (aviso) item("aviso", aviso);
  }

  function aoPassar(info) {
    if (!info) {
      dica.hidden = true;
      return;
    }
    dica.replaceChildren();
    const t = document.createElement("strong");
    t.textContent = info.titulo;
    dica.append(t);
    for (const [nome, valor, classe] of info.linhas) {
      const linha = document.createElement("div");
      linha.className = `linha-dica ${classe}`;
      const a = document.createElement("span");
      a.textContent = nome;
      const b = document.createElement("span");
      b.textContent = valor;
      linha.append(a, b);
      dica.append(linha);
    }
    dica.hidden = false;
    dica.style.left = `${info.x * 100}%`;
    dica.classList.toggle("a-esquerda", info.x > 0.6);
  }

  function desenhar() {
    const largura = Math.max(280, area.clientWidth || 600);
    const svg = el("svg", { viewBox: `0 0 ${largura} ${ALTURA}`, role: "img", class: "svg-grafico" });
    svg.setAttribute("aria-label", `${spec.titulo}. Em destaque: ${destaque}. Os números estão na tabela abaixo do gráfico.`);
    (spec.tipo === "barras" ? desenharBarras : desenharLinha)(svg, spec, destaque, largura, aoPassar);
    area.replaceChildren(svg, dica);
    legenda();
  }

  new ResizeObserver(() => desenhar()).observe(area);

  return {
    elemento: figura,
    destacar(nomeFatia) {
      const serie = spec.series[nomeFatia] ? nomeFatia : (spec.serie_da_fatia || {})[nomeFatia];
      if (!serie) return;
      destaque = serie;
      aviso = serie !== nomeFatia ? `${nomeFatia} está dentro de ${serie}` : "";
      desenhar();
    },
  };
}
