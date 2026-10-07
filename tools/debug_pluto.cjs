// Debug: isolate where the Pluto model diverges from the Horizons vector.
const P = require("../js/physics.js");
const data = require("./comets_state.json");
const RAD = P.DEG;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const name = process.argv[2] || "pluto";
const body = data.bodies[name];
const ref = body.horizons["2026-10-03"];
const t0 = data.tEpoch;
console.log("t0 =", t0);
console.log("ref r =", JSON.stringify(ref.r), " |r| =", P.len(ref.r).toFixed(5));

// 1) derive elements from ref vector
const r = ref.r, v = ref.v;
const rmag = P.len(r), v2 = P.dot(v, v);
const a = 1 / (2 / rmag - v2 / P.MU_SUN);
const h = P.cross(r, v), H = P.len(h);
const evec = P.sub(P.scl(P.cross(v, h), 1 / P.MU_SUN), P.unit(r));
const e = P.len(evec);
const nhat = P.scl(h, 1 / H);
const i = Math.acos(clamp(nhat.z, -1, 1));
const O = Math.atan2(nhat.y, nhat.x);
const Pdir = P.scl(evec, 1 / e);
const Q = P.cross(nhat, Pdir);
const w = Math.atan2(P.dot(Pdir, Q), 1);
const nu = Math.atan2(P.dot(r, Q), P.dot(r, Pdir));
const cosE = (1 - rmag / a) / e;
const sinE = P.dot(r, v) * Math.sqrt(1 - e * e) / (e * H);
const E = Math.atan2(sinE, clamp(cosE, -1, 1));
const M = E - e * Math.sin(E);
const T = P.TAU * Math.sqrt(a ** 3 / P.MU_SUN);
const deg = x => (x / RAD);
console.log("\nderived @2026: a=%.6f e=%.6f i=%.4f° O=%.4f° w=%.4f° M=%.4f° T=%.3f d",
  a, e, deg(i), deg(O), deg(w), deg(M), T);

// 2) round-trip: state from derived elements at the same instant
function stateFrom(el, mu) {
  let Mn = ((el.M % P.TAU) + P.TAU) % P.TAU;
  let E2 = (el.e < 0.8) ? Mn : Math.PI;
  for (let k = 0; k < 100; k++) {
    const f = E2 - el.e * Math.sin(E2) - Mn, fp = 1 - el.e * Math.cos(E2);
    const dE = f / fp; E2 -= dE; if (Math.abs(dE) < 1e-12) break;
  }
  const cE = Math.cos(E2), sE = Math.sin(E2);
  const xp = el.a * (cE - el.e), yp = el.a * Math.sqrt(1 - el.e * el.e) * sE;
  const cw = Math.cos(el.w), sw = Math.sin(el.w), cO = Math.cos(el.O), sO = Math.sin(el.O), ci = Math.cos(el.i), si = Math.sin(el.i);
  const x1 = cw * xp - sw * yp, y1 = sw * xp + cw * yp;
  return P.V(cO * x1 - sO * ci * y1, sO * x1 + cO * ci * y1, si * y1);
}
const rt = stateFrom({ a, e, i, O, w, M }, P.MU_SUN);
const rtErr = P.len(P.sub(rt, ref.r));
console.log("\nround-trip error:", rtErr.toExponential(3), "AU");

// 3) table entry via elementState + planetPosition
const s = P.elementState(name, t0);
console.log("\nelementState @t0: a=%.6f e=%.6f i=%.4f° L=%.4f° wbar=%.4f° O=%.4f°",
  s.a, s.e, deg(s.i), deg(s.L), deg(s.wbar), deg(s.O));
const Mtable = s.L - s.wbar;
console.log("M table =", deg(Mtable).toFixed(4), "°  (derived M =", deg(M).toFixed(4) + "°)");
const pp = P.planetPosition(name, t0);
console.log("planetPosition:", JSON.stringify(pp));
console.log("err vs ref:", P.len(P.sub(pp, ref.r)).toFixed(5), "AU");

// 4) what does the table say at J2000 (t=0)?
const s0 = P.elementState(name, 0);
console.log("\nelementState @J2000: a=%.6f e=%.6f L=%.4f° wbar=%.4f° O=%.4f°", s0.a, s0.e, deg(s0.L), deg(s0.wbar), deg(s0.O));
console.log("expected J2000 from build: a_2026 - da*T0 etc — T0 =", t0 / 36525);
