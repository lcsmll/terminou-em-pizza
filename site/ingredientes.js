// Receita de cada ingrediente: cor (para a legenda) e as partes que vão na fatia.
// Só dados, sem Three.js, para a página poder usar as cores mesmo sem WebGL.
//
// Cada parte: forma da geometria, material, densidade (peças por unidade de área,
// com a pizza de raio 1), espaço mínimo entre peças, escala [mín, máx],
// achatamento (altura relativa) e altura extra sobre o queijo.

const P = (forma, mat, densidade, espaco, escala, achata = 1, alt = 0) => ({ forma, mat, densidade, espaco, escala, achata, alt });

export const INGREDIENTES = {
  "Tomate e manjericão": { cor: "#d4402b", partes: [P("disco", "tomate", 17, 0.163, [0.075, 0.09], 0.16), P("manjericao", "manjericao", 13, 0.062, [0.037, 0.05], 1, 0.006)] },
  "Azeitona preta": { cor: "#2a2420", partes: [P("anel", "azeitonaPreta", 42, 0.072, [0.024, 0.03])] },
  "Azeitona verde": { cor: "#8a9436", partes: [P("anel", "azeitonaVerde", 42, 0.072, [0.024, 0.03])] },
  "Cogumelos": { cor: "#c8ae88", partes: [P("cogumelo", "cogumelo", 34, 0.1, [0.05, 0.062])] },
  "Rúcula": { cor: "#4f7d34", partes: [P("rucula", "rucula", 42, 0.075, [0.056, 0.075], 1, 0.004)] },
  "Salame": { cor: "#a83026", partes: [P("disco", "salame", 21, 0.175, [0.08, 0.092], 0.17)] },
  "Calabresa": { cor: "#9a4024", partes: [P("disco", "calabresa", 23, 0.15, [0.062, 0.075], 0.3)] },
  "Alcachofra": { cor: "#a6ab78", partes: [P("alcachofra", "alcachofra", 27, 0.112, [0.05, 0.062])] },
  "Pimentões": { cor: "#c7361f", partes: [
    P("tira", "pimentaoVermelho", 15, 0.075, [0.138, 0.175]), P("tira", "pimentaoVerde", 13, 0.075, [0.138, 0.175]),
    P("tira", "pimentaoAmarelo", 13, 0.075, [0.138, 0.175])] },
  "Cebola roxa": { cor: "#8e3a6c", partes: [P("arco", "cebolaRoxa", 34, 0.088, [0.056, 0.081])] },
  "Cebola": { cor: "#d9c49a", partes: [P("arco", "cebola", 34, 0.088, [0.056, 0.081])] },
  "Alcaparras": { cor: "#6b7a33", partes: [P("esfera", "alcaparra", 95, 0.039, [0.013, 0.018], 0.85)] },
  "Muçarela de búfala": { cor: "#f4efe2", partes: [P("esfera", "bufala", 19, 0.184, [0.069, 0.086], 0.28)] },
  "Milho": { cor: "#f2c22c", partes: [P("esfera", "milho", 209, 0.033, [0.014, 0.019], 0.7)] },
  "Manjericão": { cor: "#2f6a22", partes: [P("manjericao", "manjericao", 34, 0.088, [0.05, 0.069], 1, 0.006)] },
  "Pimenta calabresa": { cor: "#b0261a", partes: [P("lasca", "flocoVermelho", 418, 0.0, [0.011, 0.018])] },
  "Orégano": { cor: "#5b6a30", partes: [P("lasca", "oregano", 608, 0.0, [0.009, 0.014])] },
  "Pimenta": { cor: "#c4241a", partes: [P("anelFino", "pimenta", 57, 0.066, [0.02, 0.026])] },
};

export function corDoIngrediente(nome) {
  return (INGREDIENTES[nome] || {}).cor || "#b9a58c";
}
