// Pizza 3D realista com Three.js. Tudo é gerado por código: geometria da massa,
// texturas (canvas) e ingredientes. Cada fatia tem o ângulo proporcional ao valor
// e é coberta pelo ingrediente que identifica o grupo.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { INGREDIENTES } from "./ingredientes.js";

// ---------- medidas (raio da pizza = 1) ----------

const R_MIOLO = 0.8;      // onde começa a borda
const Y_MASSA = 0.045;    // topo da massa no centro
const Y_MOLHO = 0.05;
const Y_QUEIJO = 0.06;
const R_COBERTURA = 0.74; // até onde vão os ingredientes
const SEPARACAO = 0.17;   // quanto a fatia escolhida sai da pizza

// ---------- ruído determinístico ----------

function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function ruido2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

function fbm(x, y) {
  let soma = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < 4; i++) {
    soma += amp * ruido2(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2.03;
  }
  return soma;
}

// Funções periódicas no ângulo: a pizza fica contínua entre as fatias
const ondaBorda = (p) => 0.5 * Math.sin(3 * p + 1) + 0.3 * Math.sin(7 * p + 2) + 0.2 * Math.sin(13 * p + 0.5);
const ondaQueijo = (p) => 0.4 * Math.sin(5 * p) + 0.3 * Math.sin(11 * p + 1.3) + 0.3 * Math.sin(23 * p + 0.2);

const alturaQueijo = (x, z) => Y_QUEIJO + 0.007 * fbm(x * 7 + 11, z * 7 - 5);

function aleatorio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sementeDe(texto) {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// ---------- texturas em canvas ----------

function canvasTextura(tamanho, desenhar, repetir = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = tamanho;
  const ctx = canvas.getContext("2d");
  desenhar(ctx, tamanho, aleatorio(sementeDe(desenhar.name || "t")));
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 8;
  if (repetir) textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
  return textura;
}

function mancha(ctx, x, y, raio, cor, alfa) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, raio);
  g.addColorStop(0, cor.replace("A", alfa));
  g.addColorStop(1, cor.replace("A", 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, raio, 0, Math.PI * 2);
  ctx.fill();
}

function texQueijo(ctx, t, rnd) {
  ctx.fillStyle = "#e8b452";
  ctx.fillRect(0, 0, t, t);
  for (let i = 0; i < 1600; i++) mancha(ctx, rnd() * t, rnd() * t, 8 + rnd() * 30, "rgba(248,214,128,A)", 0.4);
  for (let i = 0; i < 700; i++) mancha(ctx, rnd() * t, rnd() * t, 5 + rnd() * 22, "rgba(214,128,40,A)", 0.3);
  // bolhas douradas e tostadas do forno
  for (let i = 0; i < 520; i++) {
    const x = rnd() * t, y = rnd() * t, r = 3 + rnd() * 15;
    mancha(ctx, x, y, r * 2, "rgba(190,105,30,A)", 0.55);
    mancha(ctx, x, y, r * 0.8, "rgba(120,55,15,A)", 0.5);
  }
  for (let i = 0; i < 900; i++) mancha(ctx, rnd() * t, rnd() * t, 1 + rnd() * 3, "rgba(255,248,215,A)", 0.7);
}

function texMolho(ctx, t, rnd) {
  ctx.fillStyle = "#a5281a";
  ctx.fillRect(0, 0, t, t);
  for (let i = 0; i < 900; i++) mancha(ctx, rnd() * t, rnd() * t, 5 + rnd() * 30, "rgba(120,20,10,A)", 0.35);
  for (let i = 0; i < 600; i++) mancha(ctx, rnd() * t, rnd() * t, 3 + rnd() * 14, "rgba(205,70,35,A)", 0.3);
  for (let i = 0; i < 300; i++) mancha(ctx, rnd() * t, rnd() * t, 1 + rnd() * 2.5, "rgba(60,80,30,A)", 0.6);
}

function texMassa(ctx, t, rnd) {
  ctx.fillStyle = "#d9a15b";
  ctx.fillRect(0, 0, t, t);
  for (let i = 0; i < 1500; i++) mancha(ctx, rnd() * t, rnd() * t, 6 + rnd() * 30, "rgba(238,196,128,A)", 0.35);
  for (let i = 0; i < 900; i++) mancha(ctx, rnd() * t, rnd() * t, 5 + rnd() * 24, "rgba(170,105,45,A)", 0.3);
  // pintas de leopardo, mais fortes na borda
  const c = t / 2;
  for (let i = 0; i < 700; i++) {
    const ang = rnd() * Math.PI * 2;
    const r = (0.78 + rnd() * 0.24) * c;
    const x = c + Math.cos(ang) * r, y = c + Math.sin(ang) * r;
    mancha(ctx, x, y, 2 + rnd() * 9, "rgba(70,32,10,A)", 0.55 + rnd() * 0.35);
  }
  for (let i = 0; i < 400; i++) mancha(ctx, rnd() * t, rnd() * t, 1 + rnd() * 2, "rgba(245,225,190,A)", 0.8);
}

function texMiolo(ctx, t, rnd) {
  ctx.fillStyle = "#efdcb3";
  ctx.fillRect(0, 0, t, t);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(190,150,95,${0.25 + rnd() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * t, rnd() * t, 1 + rnd() * 6, 1 + rnd() * 4, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function texMadeira(ctx, t, rnd) {
  ctx.fillStyle = "#7a4c2b";
  ctx.fillRect(0, 0, t, t);
  for (let y = 0; y < t; y += 1) {
    const v = fbm(y * 0.02, 3.1) * 0.5 + Math.sin(y * 0.09 + fbm(y * 0.01, 1) * 6) * 0.5;
    ctx.fillStyle = `rgba(${v > 0 ? "150,100,60" : "60,35,18"},${Math.abs(v) * 0.35})`;
    ctx.fillRect(0, y, t, 1);
  }
  for (let i = 0; i < 40; i++) mancha(ctx, rnd() * t, rnd() * t, 10 + rnd() * 40, "rgba(50,28,12,A)", 0.15);
}

function texEmbutido(base, gordura, borda) {
  const fn = function (ctx, t, rnd) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, t, t);
    for (let i = 0; i < 160; i++) mancha(ctx, rnd() * t, rnd() * t, 4 + rnd() * 18, "rgba(70,10,8,A)", 0.3);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = gordura;
      ctx.beginPath();
      ctx.ellipse(rnd() * t, rnd() * t, 2 + rnd() * 6, 2 + rnd() * 5, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (borda) {
      ctx.strokeStyle = borda;
      ctx.lineWidth = t * 0.07;
      ctx.beginPath();
      ctx.arc(t / 2, t / 2, t * 0.46, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
  return fn;
}

function texTomate(ctx, t) {
  const c = t / 2;
  ctx.fillStyle = "#c22a1c";
  ctx.fillRect(0, 0, t, t);
  ctx.fillStyle = "#d9442c";
  ctx.beginPath();
  ctx.arc(c, c, t * 0.42, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    ctx.fillStyle = "#e8743f";
    ctx.beginPath();
    ctx.ellipse(c + Math.cos(a) * t * 0.22, c + Math.sin(a) * t * 0.22, t * 0.13, t * 0.08, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f1c26a";
    for (let s = 0; s < 4; s++) {
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * t * (0.16 + s * 0.04), c + Math.sin(a) * t * (0.16 + s * 0.04), t * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#b8231a";
  ctx.beginPath();
  ctx.arc(c, c, t * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- geometria da massa ----------

// Perfil (raio, altura) da massa com a borda, fechado.
const PERFIL_MASSA = [
  [0.0001, 0], [0.5, 0], [0.95, 0], [0.985, 0.012], [1.0, 0.045], [0.998, 0.09],
  [0.985, 0.13], [0.955, 0.162], [0.915, 0.176], [0.875, 0.17], [0.845, 0.148],
  [0.822, 0.112], [0.806, 0.075], [0.795, 0.055], [0.775, Y_MASSA], [0.5, Y_MASSA], [0.0001, Y_MASSA],
];

function perfilParaPontos(perfil) {
  return perfil.map(([r, y]) => new THREE.Vector2(r, y));
}

// Coordenadas da textura vistas de cima: a pizza inteira cabe numa textura só
function uvDeCima(geo) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[2 * i] = p.getX(i) / 2 + 0.5;
    uv[2 * i + 1] = p.getZ(i) / 2 + 0.5;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

// Borda irregular, como massa aberta à mão
function deformarMassa(geo) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.74) continue;
    const fi = Math.atan2(x, z);
    const t = THREE.MathUtils.smoothstep(r, 0.74, 0.86);
    const k = 1 + 0.25 * t * ondaBorda(fi) + 0.08 * t * ruido2(fi * 9, 2.7);
    const yNovo = y > Y_MASSA ? Y_MASSA + (y - Y_MASSA) * k : y;
    const escala = 1 + 0.014 * t * ondaBorda(fi * 2 + 1);
    p.setXYZ(i, x * escala, yNovo, z * escala);
  }
  geo.computeVertexNormals();
}

function deformarQueijo(geo) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    const fi = Math.atan2(x, z);
    const escala = 1 + 0.04 * ondaQueijo(fi) * THREE.MathUtils.smoothstep(r, 0.5, 0.78);
    const topo = y > Y_QUEIJO - 0.003;
    p.setXYZ(i, x * escala, topo ? alturaQueijo(x, z) : y, z * escala);
  }
  geo.computeVertexNormals();
}

// Face do corte, no ângulo fi (fatia vista de lado)
function tampa(perfil, fi) {
  const forma = new THREE.Shape(perfilParaPontos(perfil));
  const geo = new THREE.ShapeGeometry(forma);
  geo.rotateY(fi - Math.PI / 2);
  return geo;
}

function segmentosPara(comprimento) {
  return Math.max(3, Math.ceil((comprimento / (Math.PI * 2)) * 220));
}

// ---------- ingredientes ----------

const cacheGeo = new Map();
function geo(nome, criar) {
  if (!cacheGeo.has(nome)) cacheGeo.set(nome, criar());
  return cacheGeo.get(nome);
}

function folha(lobos) {
  const pts = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let w = 0.36 * Math.sin(Math.PI * Math.pow(t, 0.8));
    if (lobos) w *= 0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 5));
    pts.push(new THREE.Vector2(w, t * 2 - 1));
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    let w = 0.36 * Math.sin(Math.PI * Math.pow(t, 0.8));
    if (lobos) w *= 0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 5 + 0.6));
    pts.push(new THREE.Vector2(-w, t * 2 - 1));
  }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, 0.9 * x * x + 0.08 * Math.sin(z * 3));
  }
  g.computeVertexNormals();
  return g;
}

function extrudado(pontos, profundidade) {
  const forma = new THREE.Shape(pontos.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(forma, {
    depth: profundidade, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 10,
  });
  g.rotateX(-Math.PI / 2);
  g.center();
  return g;
}

const GEOMETRIAS = {
  disco: () => geo("disco", () => new THREE.CylinderGeometry(1, 1, 1, 36)),
  anel: () => geo("anel", () => new THREE.TorusGeometry(1, 0.42, 10, 26).rotateX(Math.PI / 2)),
  anelFino: () => geo("anelFino", () => new THREE.TorusGeometry(1, 0.26, 8, 22).rotateX(Math.PI / 2)),
  esfera: () => geo("esfera", () => new THREE.SphereGeometry(1, 14, 10)),
  lasca: () => geo("lasca", () => new THREE.PlaneGeometry(1, 0.6).rotateX(-Math.PI / 2)),
  manjericao: () => geo("manjericao", () => folha(false)),
  rucula: () => geo("rucula", () => folha(true).scale(0.7, 1, 1.4)),
  cogumelo: () => geo("cogumelo", () => extrudado(
    [[-0.28, -0.9], [0.28, -0.9], [0.32, 0], [1, 0], [0.95, 0.5], [0.55, 0.85], [0, 0.92], [-0.55, 0.85], [-0.95, 0.5], [-1, 0], [-0.32, 0]], 0.18)),
  alcachofra: () => geo("alcachofra", () => extrudado(
    [[0, -1], [0.7, -0.4], [0.75, 0.4], [0.45, 0.95], [0.15, 0.7], [0, 0.95], [-0.15, 0.7], [-0.45, 0.95], [-0.75, 0.4], [-0.7, -0.4]], 0.3)),
  tira: () => geo("tira", () => {
    const curva = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(0, 0, 0.28), new THREE.Vector3(0.5, 0, 0));
    return new THREE.TubeGeometry(curva, 16, 0.09, 6, false).scale(1, 0.38, 1);
  }),
  arco: () => geo("arco", () => new THREE.TorusGeometry(1, 0.11, 6, 30, Math.PI * 1.15).rotateX(Math.PI / 2).scale(1, 0.55, 1)),
};

function material(cor, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: cor, roughness: 0.55, ...extra });
}

let MATERIAIS = null;
function materiais() {
  if (MATERIAIS) return MATERIAIS;
  const queijo = canvasTextura(1024, texQueijo);
  MATERIAIS = {
    massa: material("#ffffff", { map: canvasTextura(1024, texMassa), roughness: 0.85 }),
    miolo: material("#ffffff", { map: canvasTextura(256, texMiolo, true), roughness: 0.95, side: THREE.DoubleSide }),
    molho: material("#ffffff", { map: canvasTextura(512, texMolho), roughness: 0.42 }),
    queijo: material("#ffffff", { map: queijo, bumpMap: queijo, bumpScale: 0.8, roughness: 0.38 }),
    madeira: material("#ffffff", { map: canvasTextura(512, texMadeira), roughness: 0.75 }),
    salame: material("#ffffff", { map: canvasTextura(256, texEmbutido("#a32a22", "rgba(240,205,190,0.9)", "#6e1a12")), roughness: 0.4 }),
    calabresa: material("#ffffff", { map: canvasTextura(256, texEmbutido("#9a3f22", "rgba(232,190,160,0.85)", "#5a2412")), roughness: 0.42 }),
    tomate: material("#ffffff", { map: canvasTextura(256, texTomate), roughness: 0.3 }),
    azeitonaPreta: material("#1c1714", { roughness: 0.22 }),
    azeitonaVerde: material("#76802f", { roughness: 0.3 }),
    cogumelo: material("#c8ae88", { roughness: 0.7 }),
    manjericao: material("#2f6a22", { roughness: 0.4, side: THREE.DoubleSide }),
    rucula: material("#3c6626", { roughness: 0.55, side: THREE.DoubleSide }),
    pimentaoVermelho: material("#b52119", { roughness: 0.28 }),
    pimentaoVerde: material("#3d7a22", { roughness: 0.28 }),
    pimentaoAmarelo: material("#e2a51e", { roughness: 0.28 }),
    cebolaRoxa: material("#8e3a6c", { roughness: 0.35 }),
    cebola: material("#eadfc6", { roughness: 0.38 }),
    alcaparra: material("#5d6b2c", { roughness: 0.35 }),
    bufala: material("#f8f4ea", { roughness: 0.5 }),
    milho: material("#f2c22c", { roughness: 0.3 }),
    alcachofra: material("#a6ab78", { roughness: 0.6 }),
    flocoVermelho: material("#b0261a", { roughness: 0.7, side: THREE.DoubleSide }),
    oregano: material("#4c5a28", { roughness: 0.85, side: THREE.DoubleSide }),
    pimenta: material("#c4241a", { roughness: 0.3 }),
  };
  return MATERIAIS;
}

function distribuir(rnd, parte, fiIni, fiFim, ocupados) {
  const area = 0.5 * (R_COBERTURA ** 2 - 0.06 ** 2) * (fiFim - fiIni);
  const alvo = Math.max(parte.espaco ? 1 : 3, Math.round(parte.densidade * area));
  const pontos = [];
  for (let tentativa = 0; tentativa < alvo * 40 && pontos.length < alvo; tentativa++) {
    const r = Math.sqrt(0.06 ** 2 + rnd() * (R_COBERTURA ** 2 - 0.06 ** 2));
    // distância mínima até o corte, em unidades de comprimento
    const folga = Math.min(0.035, (r * (fiFim - fiIni)) / 2.2);
    const fi = fiIni + folga / r + rnd() * Math.max(0, fiFim - fiIni - (2 * folga) / r);
    const x = r * Math.sin(fi), z = r * Math.cos(fi);
    if (parte.espaco && ocupados.some((o) => Math.hypot(o[0] - x, o[1] - z) < (o[2] + parte.espaco) / 2)) continue;
    pontos.push([x, z]);
    if (parte.espaco) ocupados.push([x, z, parte.espaco]);
  }
  return pontos;
}

function cobertura(nome, fiIni, fiFim, semente) {
  const grupo = new THREE.Group();
  const receita = INGREDIENTES[nome] || INGREDIENTES["Orégano"];
  const mats = materiais();
  const rnd = aleatorio(semente);
  const ocupados = [];
  const tmp = new THREE.Object3D();

  for (const parte of receita.partes) {
    const pontos = distribuir(rnd, parte, fiIni, fiFim, ocupados);
    if (!pontos.length) continue;
    const malha = new THREE.InstancedMesh(GEOMETRIAS[parte.forma](), mats[parte.mat], pontos.length);
    pontos.forEach(([x, z], i) => {
      const largura = Math.hypot(x, z) * (fiFim - fiIni);
      const s = Math.min(parte.escala[0] + rnd() * (parte.escala[1] - parte.escala[0]), largura * 0.42);
      const sy = s * parte.achata * (parte.forma === "esfera" ? 0.8 + rnd() * 0.4 : 1);
      tmp.position.set(x, alturaQueijo(x, z) + sy * 0.35 + parte.alt + 0.002, z);
      tmp.rotation.set((rnd() - 0.5) * 0.25, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.25);
      const sx = parte.forma === "esfera" ? s * (0.85 + rnd() * 0.3) : s;
      tmp.scale.set(sx, sy, s);
      tmp.updateMatrix();
      malha.setMatrixAt(i, tmp.matrix);
    });
    malha.castShadow = true;
    malha.receiveShadow = true;
    grupo.add(malha);
  }
  return grupo;
}

// ---------- uma fatia ----------

function criarFatia(fatia, fiIni, fiFim) {
  const mats = materiais();
  const grupo = new THREE.Group();
  const corte = Math.min(0.006, (fiFim - fiIni) * 0.08);
  const a = fiIni + corte, b = fiFim - corte, comp = b - a;
  const seg = segmentosPara(comp);

  const massa = new THREE.LatheGeometry(perfilParaPontos(PERFIL_MASSA), seg, a, comp);
  deformarMassa(massa);
  uvDeCima(massa);

  const faces = [tampa(PERFIL_MASSA, a), tampa(PERFIL_MASSA, b)];
  faces.forEach(deformarMassa);

  // perfis de fora para dentro, para a face de cima apontar para cima
  const molho = new THREE.LatheGeometry(perfilParaPontos([[0.815, Y_MASSA], [0.81, Y_MOLHO], [0.4, Y_MOLHO], [0.0001, Y_MOLHO]]), seg, a, comp);
  uvDeCima(molho);

  const perfilQueijo = [[0.795, Y_MOLHO], [0.79, Y_QUEIJO - 0.004]];
  for (let i = 28; i >= 0; i--) perfilQueijo.push([0.0001 + (i / 28) * 0.78, Y_QUEIJO]);
  const queijo = new THREE.LatheGeometry(perfilParaPontos(perfilQueijo), seg, a, comp);
  deformarQueijo(queijo);
  uvDeCima(queijo);

  const partes = [
    new THREE.Mesh(massa, mats.massa),
    ...faces.map((f) => new THREE.Mesh(f, mats.miolo)),
    new THREE.Mesh(molho, mats.molho),
    new THREE.Mesh(queijo, mats.queijo),
  ];
  partes.forEach((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    grupo.add(m);
  });
  grupo.add(cobertura(fatia.ingrediente, a, b, sementeDe(fatia.codigo + fatia.ingrediente)));

  const meio = (a + b) / 2;
  grupo.userData = {
    fatia,
    direcao: new THREE.Vector3(Math.sin(meio), 0, Math.cos(meio)),
    saida: 0, alvoSaida: 0, realce: 0, alvoRealce: 0,
  };
  return grupo;
}

function liberar(objeto) {
  objeto.traverse((o) => {
    if (o.geometry && ![...cacheGeo.values()].includes(o.geometry)) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose();
  });
}

// ---------- palco ----------

export function criarPalco(container, { aoEscolher, rotulo }) {
  const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "pizza-3d";
  renderer.domElement.setAttribute("aria-hidden", "true");

  const cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  cena.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 3.35, 2.9);

  cena.add(new THREE.HemisphereLight(0xfff0d8, 0x2a1a10, 0.6));
  const sol = new THREE.DirectionalLight(0xffe0b0, 2.4);
  sol.position.set(2.2, 4.2, 1.6);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -1.8, right: 1.8, top: 1.8, bottom: -1.8, near: 1, far: 10 });
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.015;
  cena.add(sol);
  const contra = new THREE.DirectionalLight(0xff9a50, 0.7);
  contra.position.set(-3, 1.4, -2.5);
  cena.add(contra);

  const mats = materiais();
  Object.values(mats).forEach((m) => (m.envMapIntensity = 0.45));

  const tabua = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.22, 0.07, 96), mats.madeira);
  tabua.position.y = -0.036;
  tabua.receiveShadow = true;
  tabua.castShadow = true;
  uvDeCima(tabua.geometry);
  cena.add(tabua);

  const chao = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = -0.075;
  chao.receiveShadow = true;
  cena.add(chao);

  const pizza = new THREE.Group();
  cena.add(pizza);

  const controles = new OrbitControls(camera, renderer.domElement);
  Object.assign(controles, {
    enablePan: false, enableDamping: true, dampingFactor: 0.08,
    minDistance: 2.4, maxDistance: 5.2, minPolarAngle: 0.15, maxPolarAngle: 1.2,
    autoRotate: !reduzir, autoRotateSpeed: 0.55, zoomToCursor: false,
  });
  controles.target.set(0, -0.08, 0.05);
  controles.enableZoom = false; // a roda do mouse continua rolando a página
  controles.addEventListener("start", () => (controles.autoRotate = false));

  const dica = document.createElement("div");
  dica.className = "dica-fatia";
  dica.hidden = true;
  container.append(renderer.domElement, dica);

  // ---- tamanho ----
  function ajustar() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // em telas estreitas, afasta a câmera para a pizza caber
    camera.zoom = Math.min(1, camera.aspect * 1.05);
    camera.updateProjectionMatrix();
  }
  const observador = new ResizeObserver(ajustar);
  observador.observe(container);

  // ---- escolha com o mouse ----
  const raio = new THREE.Raycaster();
  const ponteiro = new THREE.Vector2();
  let sobre = null;

  function fatiaSob(evento) {
    const caixa = renderer.domElement.getBoundingClientRect();
    ponteiro.set(((evento.clientX - caixa.left) / caixa.width) * 2 - 1, -((evento.clientY - caixa.top) / caixa.height) * 2 + 1);
    raio.setFromCamera(ponteiro, camera);
    const [acerto] = raio.intersectObjects(pizza.children, true);
    let o = acerto && acerto.object;
    while (o && o.parent !== pizza) o = o.parent;
    return o || null;
  }

  function realcar(grupo) {
    pizza.children.forEach((g) => (g.userData.alvoRealce = g === grupo ? 1 : 0));
  }

  renderer.domElement.addEventListener("pointermove", (e) => {
    const g = fatiaSob(e);
    sobre = g;
    realcar(g);
    renderer.domElement.style.cursor = g ? "pointer" : "grab";
    if (g) {
      const caixa = container.getBoundingClientRect();
      dica.hidden = false;
      dica.textContent = `${g.userData.fatia.nome} · ${rotulo(g.userData.fatia)}`;
      dica.style.left = `${e.clientX - caixa.left}px`;
      dica.style.top = `${e.clientY - caixa.top}px`;
    } else {
      dica.hidden = true;
    }
  });
  renderer.domElement.addEventListener("pointerleave", () => {
    sobre = null;
    realcar(null);
    dica.hidden = true;
  });

  let inicioToque = null;
  renderer.domElement.addEventListener("pointerdown", (e) => (inicioToque = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener("pointerup", (e) => {
    // só conta como clique se o ponteiro não arrastou a pizza
    if (!inicioToque || Math.hypot(e.clientX - inicioToque[0], e.clientY - inicioToque[1]) > 6) return;
    const g = fatiaSob(e);
    if (g) aoEscolher(g.userData.fatia);
  });

  // ---- animação ----
  const relogio = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(relogio.getDelta(), 0.05);
    const k = reduzir ? 1 : 1 - Math.exp(-dt * 9);
    for (const g of pizza.children) {
      const u = g.userData;
      u.saida += (u.alvoSaida - u.saida) * k;
      u.realce += (u.alvoRealce - u.realce) * k;
      const d = SEPARACAO * u.saida + 0.03 * u.realce;
      g.position.set(u.direcao.x * d, 0.06 * u.saida + 0.012 * u.realce, u.direcao.z * d);
    }
    controles.update();
    renderer.render(cena, camera);
  });

  ajustar();

  return {
    servir(dados) {
      pizza.children.slice().forEach((g) => {
        pizza.remove(g);
        liberar(g);
      });
      const soma = dados.fatias.reduce((s, f) => s + f.valor, 0);
      // começa no alto da tela e segue no sentido horário, visto de cima
      let angulo = 0;
      for (const fatia of dados.fatias) {
        const passo = (fatia.valor / soma) * Math.PI * 2;
        pizza.add(criarFatia(fatia, Math.PI - angulo - passo, Math.PI - angulo));
        angulo += passo;
      }
    },
    selecionar(codigo) {
      pizza.children.forEach((g) => (g.userData.alvoSaida = g.userData.fatia.codigo === codigo ? 1 : 0));
      if (codigo) controles.autoRotate = false;
    },
    destacar(codigo) {
      realcar(pizza.children.find((g) => g.userData.fatia.codigo === codigo) || sobre);
    },
    anexar(novoContainer) {
      novoContainer.append(renderer.domElement, dica);
      observador.disconnect();
      container = novoContainer;
      observador.observe(container);
      ajustar();
    },
  };
}
