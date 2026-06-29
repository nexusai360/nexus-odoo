// Gera geometria SIMPLIFICADA do mapa do Brasil a partir de @svg-maps/brazil.
// Os paths originais (~5.857 pontos) têm detalhe de litoral em excesso; aplicamos
// Ramer-Douglas-Peucker por subpath e descartamos ilhas minúsculas, mantendo a
// silhueta reconhecível com bem menos pontos. Saída: src/.../uf-paths.gen.ts
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const m = require("@svg-maps/brazil");
const map = m.default || m;

const TOL = 1.2; // tolerância RDP (unidades do viewBox 613x639); curvas suavizam o resto

/** Converte um path relativo (só m/z) em lista de subpaths absolutos [[x,y],...]. */
function parsePath(d) {
  const subs = [];
  let cp = [0, 0];
  for (const segRaw of d.split("z")) {
    const seg = segRaw.trim();
    if (!seg) continue;
    const body = seg.replace(/^m/i, " ");
    const nums = body.match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number) ?? [];
    if (nums.length < 2) continue;
    const start = [cp[0] + nums[0], cp[1] + nums[1]];
    const pts = [start];
    let cur = start;
    for (let k = 2; k + 1 < nums.length; k += 2) {
      cur = [cur[0] + nums[k], cur[1] + nums[k + 1]];
      pts.push(cur);
    }
    subs.push(pts);
    cp = start; // após z, o ponto corrente volta ao início do subpath
  }
  return subs;
}

function perpDist(p, a, b) {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(x - x1, y - y1);
  let t = ((x - x1) * dx + (y - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function rdp(points, tol) {
  if (points.length < 3) return points;
  let maxD = 0, idx = 0;
  const a = points[0], b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > tol) {
    const left = rdp(points.slice(0, idx + 1), tol);
    const right = rdp(points.slice(idx), tol);
    return [...left.slice(0, -1), ...right];
  }
  return [a, b];
}

function bboxArea(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}

const r = (n) => Math.round(n * 10) / 10;

/**
 * Curva fechada suave (Catmull-Rom -> Bézier cúbica) passando por todos os
 * pontos. Arredonda os cantos angulosos do RDP, deixando o contorno do estado
 * limpo/orgânico em vez de "low-poly". Tensão padrão 1/6.
 */
function smoothClosed(ptsIn) {
  const pts = ptsIn.slice();
  // remove ponto de fechamento duplicado (RDP pode repetir o primeiro no fim)
  const a = pts[0], z = pts[pts.length - 1];
  if (Math.abs(a[0] - z[0]) < 0.01 && Math.abs(a[1] - z[1]) < 0.01) pts.pop();
  const n = pts.length;
  if (n < 3) return null;
  let d = `M${r(pts[0][0])},${r(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${r(c1x)},${r(c1y)} ${r(c2x)},${r(c2y)} ${r(p2[0])},${r(p2[1])}`;
  }
  return d + "Z";
}

let totalIn = 0, totalOut = 0;
const out = map.locations.map((loc) => {
  const subs = parsePath(loc.path);
  totalIn += subs.reduce((s, p) => s + p.length, 0);
  // Mantém SÓ o maior subpath (o continente do estado). Ilhas/recortes do litoral
  // , ex.: o delta do Amazonas/Marajó no PA, com dezenas de ilhotas , viravam um
  // emaranhado de linhas no mapa. Para um mapa de calor, a massa principal basta.
  const areas = subs.map(bboxArea);
  const maxIdx = areas.indexOf(Math.max(...areas));
  const pts = rdp(subs[maxIdx], TOL);
  totalOut += pts.length;
  // Suaviza o contorno (curvas) em vez de polilinha angular.
  const dStr = smoothClosed(pts) ?? ("M" + pts.map(([x, y]) => `${r(x)},${r(y)}`).join("L") + "Z");
  return { uf: loc.id.toUpperCase(), nome: loc.name, path: dStr };
});

const header = `// GERADO por scripts/gen-uf-paths.mjs , NÃO editar à mão.\n// Contorno SIMPLIFICADO (RDP tol=${TOL}) e SUAVIZADO (Catmull-Rom) do mapa do Brasil. ${totalIn} -> ${totalOut} pontos.\n`;
const body =
  `export const BRAZIL_VIEWBOX = ${JSON.stringify(map.viewBox)} as const;\n\n` +
  `export interface UfPathGen { uf: string; nome: string; path: string; }\n\n` +
  `export const UF_PATHS_GEN: UfPathGen[] = ${JSON.stringify(out)};\n`;

writeFileSync(
  new URL("../src/components/diretoria/brazil-map/uf-paths.gen.ts", import.meta.url),
  header + body,
);
console.log(`OK: ${totalIn} -> ${totalOut} pontos (${(100 * totalOut / totalIn).toFixed(1)}%). 27 UFs.`);
