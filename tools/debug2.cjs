// Compare: (1) elements derived directly from the Horizons 2026 vector
// (corrected formulas) vs (2) what the app table yields at the same instant.
const P = require("../js/physics.js");
const data = require("./comets_state.json");
const RAD = P.DEG;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function deriveElements(sv, mu) {
  const r = sv.r, v = sv.v;
  const rmag = P.len(r), v2 = P.dot(v, v);
  const a = 1 / (2 / rmag - v2 / mu);
  const h = P.cross(r, v);
  const H = P.len(h);
  const evec = P.sub(P.scl(P.cross(v, h), 1 / mu), P.unit(r));
  const e = P.len(evec);
  const nhat = P.scl(h, 1 / H);
  const i = Math.acos(clamp(nhat.z, -1, 1));
  const nbar = P.unit(P.cross(P.V(0, 0, 1), nhat));
  const O = Math.atan2(nbar.y, nbar.x);
  const Pdir = e > 1e-10 ? P.scl(evec, 1 / e) : P.unit(r);
  const w = Math.atan2(P.dot(nhat, P.cross(nbar, Pdir)), P.dot(nbar, Pdir));
  const Q = P.cross(nhat, Pdir);
  const nu = Math.atan2(P.dot(r, Q), P.dot(r, Pdir));
  const cosE = (1 - rmag / a) / e;
  const sinE = P.dot(r, v) * Math.sqrt(1 - e * e) / (e * H);
  const E = Math.atan2(sinE, clamp(cosE, -1, 1));
  const M = E - e * Math.sin(E);
  return { a, e, i, O, w, M };
}

const name = process.argv[2] || "pluto";
const ref = data.bodies[name].horizons["2026-10-03"];
const t0 = data.tEpoch;
const d = deriveElements(ref, P.MU_SUN);
const deg = x => x / RAD;
console.log("derived @2026 :", "a=" + d.a.toFixed(6), "e=" + d.e.toFixed(6),
  "i=" + deg(d.i).toFixed(4), "O=" + deg(d.O).toFixed(4), "w=" + deg(d.w).toFixed(4), "M=" + deg(d.M).toFixed(4));

const s = P.elementState(name, t0);
console.log("app state @t0 :", "a=" + s.a.toFixed(6), "e=" + s.e.toFixed(6),
  "i=" + deg(s.i).toFixed(4), "O=" + deg(s.O).toFixed(4),
  "w=" + deg(s.wbar - s.O).toFixed(4), "M=" + deg(s.L - s.wbar).toFixed(4));

const pp = P.planetPosition(name, t0);
const err = P.len(P.sub(pp, ref.r));
console.log("planetPosition err:", err.toFixed(4), "AU");

// Also: what position does the DIRECT (correct) rotation of the derived elements give?
// replicate planetPosition math inline (rotateToEcliptic is not exported)
let E = d.M;
for (let k = 0; k < 100; k++) { const f = E - d.e * Math.sin(E) - d.M, fp = 1 - d.e * Math.cos(E); const dE = f / fp; E -= dE; if (Math.abs(dE) < 1e-12) break; }
const xp = d.a * (Math.cos(E) - d.e), yp = d.a * Math.sqrt(1 - d.e * d.e) * Math.sin(E);
const cw = Math.cos(d.w), sw = Math.sin(d.w), cO = Math.cos(d.O), sO = Math.sin(d.O), ci = Math.cos(d.i), si = Math.sin(d.i);
const x1 = cw * xp - sw * yp, y1 = sw * xp + cw * yp;
const pos = P.V(cO * x1 - sO * ci * y1, sO * x1 + cO * ci * y1, si * y1);
console.log("direct rotation err:", P.len(P.sub(pos, ref.r)).toExponential(3), "AU");
