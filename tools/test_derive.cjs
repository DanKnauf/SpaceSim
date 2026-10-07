// Self-test: derive elements from a synthetic orbit with known elements.
const P = require("../js/physics.js");
const RAD = P.DEG;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function stateFromElements(el, tDays, mu) { // angles in radians
  const T = P.TAU * Math.sqrt(el.a ** 3 / mu);
  let M = ((el.M + (tDays - el.epochDays) * P.TAU / T) % P.TAU + P.TAU) % P.TAU;
  let E = (el.e < 0.8) ? M : Math.PI;
  for (let k = 0; k < 100; k++) {
    const f = E - el.e * Math.sin(E) - M, fp = 1 - el.e * Math.cos(E);
    const dE = f / fp; E -= dE; if (Math.abs(dE) < 1e-12) break;
  }
  const cE = Math.cos(E), sE = Math.sin(E);
  const oneMinus = 1 - el.e * cE;
  const xp = el.a * (cE - el.e), yp = el.a * Math.sqrt(1 - el.e * el.e) * sE;
  const vxp = -Math.sqrt(mu / el.a) * sE / oneMinus, vyp = Math.sqrt(mu / el.a) * Math.sqrt(1 - el.e * el.e) * cE / oneMinus;
  const cw = Math.cos(el.w), sw = Math.sin(el.w), cO = Math.cos(el.O), sO = Math.sin(el.O), ci = Math.cos(el.i), si = Math.sin(el.i);
  const x1 = cw * xp - sw * yp, y1 = sw * xp + cw * yp;
  const vx1 = cw * vxp - sw * vyp, vy1 = sw * vxp + cw * vyp;
  return { r: { x: cO * x1 - sO * ci * y1, y: sO * x1 + cO * ci * y1, z: si * y1 },
           v: { x: cO * vx1 - sO * ci * vy1, y: sO * vx1 + cO * ci * vy1, z: si * vy1 } };
}

function deriveElements(sv, mu) { // fixed version (mirrors derive_comets.cjs)
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
  let M;
  if (Math.abs(e) < 1e-10) M = nu;
  else {
    const cosE = (1 - rmag / a) / e;
    const sinE = P.dot(r, v) * Math.sqrt(1 - e * e) / (e * H);
    const E = Math.atan2(sinE, clamp(cosE, -1, 1));
    M = E - e * Math.sin(E);
  }
  const T = P.TAU * Math.sqrt(Math.abs(a) ** 3 / mu);
  return { a, e, i, O, w, M, T };
}

const cases = [
  { a: 4.0, e: 0.70, i: 25, O: 140, w: 80, M: 130 },   // generic
  { a: 2.2, e: 0.846, i: 11.7, O: 244.6, w: 88.2, M: 300 }, // Encke-like
  { a: 17.86, e: 0.9673, i: 162.2, O: 110.3, w: 30.5, M: 10 }, // Halley-like (retrograde, high e)
  { a: 39.5, e: 0.247, i: 17.1, O: 110.3, w: 113.8, M: 200 }   // Pluto-like
];
let ok = true;
for (const c of cases) {
  const el = { a: c.a, e: c.e, i: c.i * RAD, O: c.O * RAD, w: c.w * RAD, M: c.M * RAD, epochDays: 0 };
  const sv = stateFromElements(el, 0, P.MU_SUN);
  const d = deriveElements(sv, P.MU_SUN);
  const deg = x => x / RAD;
  const near = (x, y, tol) => Math.abs((((x - y) % 360 + 540) % 360) - 180) < tol;
  const res = {
    a: Math.abs(d.a - c.a) < 1e-9,
    e: Math.abs(d.e - c.e) < 1e-9,
    i: Math.abs(deg(d.i) - c.i) < 1e-6,
    O: near(deg(d.O), c.O, 1e-6),
    w: near(deg(d.w), c.w, 1e-6),
    M: near(deg(d.M), c.M, 1e-6)
  };
  ok = ok && Object.values(res).every(Boolean);
  console.log(JSON.stringify(c), "->",
    `a=${d.a.toFixed(4)} e=${d.e.toFixed(4)} i=${deg(d.i).toFixed(3)} O=${deg(d.O).toFixed(3)} w=${deg(d.w).toFixed(3)} M=${deg(d.M).toFixed(3)}`,
    res);
}
console.log(ok ? "ALL SYNTHETIC TESTS PASS" : "SYNTHETIC TESTS FAILED");
process.exit(ok ? 0 : 1);
