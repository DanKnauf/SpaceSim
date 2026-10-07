const P = require("../js/physics.js");
const RAD = P.DEG, MU = P.MU_SUN;
function stateFromElements(el) {
  const T = P.TAU * Math.sqrt(el.a ** 3 / MU);
  let M = ((el.M % P.TAU) + P.TAU) % P.TAU;
  let E = (el.e < 0.8) ? M : Math.PI;
  for (let k = 0; k < 100; k++) { const f = E - el.e * Math.sin(E) - M, fp = 1 - el.e * Math.cos(E); const dE = f / fp; E -= dE; if (Math.abs(dE) < 1e-12) break; }
  const cE = Math.cos(E), sE = Math.sin(E);
  const xp = el.a * (cE - el.e), yp = el.a * Math.sqrt(1 - el.e * el.e) * sE;
  const vxp = -Math.sqrt(MU / el.a) * sE, vyp = Math.sqrt(MU / el.a) * Math.sqrt(1 - el.e * el.e) * cE;
  const cw = Math.cos(el.w), sw = Math.sin(el.w), cO = Math.cos(el.O), sO = Math.sin(el.O), ci = Math.cos(el.i), si = Math.sin(el.i);
  const x1 = cw * xp - sw * yp, y1 = sw * xp + cw * yp;
  const vx1 = cw * vxp - sw * vyp, vy1 = sw * vxp + cw * vyp;
  return { r: { x: cO * x1 - sO * ci * y1, y: sO * x1 + cO * ci * y1, z: si * y1 },
           v: { x: cO * vx1 - sO * ci * vy1, y: sO * vx1 + cO * ci * vy1, z: si * vy1 } };
}
const el = { a: 4.0, e: 0.70, i: 25 * RAD, O: 140 * RAD, w: 80 * RAD, M: 130 * RAD };
const sv = stateFromElements(el);
console.log("r =", JSON.stringify(sv.r), "|r| =", P.len(sv.r).toFixed(6));
console.log("v =", JSON.stringify(sv.v), "|v| =", P.len(sv.v).toFixed(6));
const rmag = P.len(sv.r), v2 = P.dot(sv.v, sv.v);
console.log("vis-viva a =", (1 / (2 / rmag - v2 / MU)).toFixed(6), "(expect 4)");
console.log("|h| =", P.len(P.cross(sv.r, sv.v)).toFixed(6), "expect", Math.sqrt(MU * 4 * (1 - 0.49)).toFixed(6));
// expected position via direct formula check at E
const T = P.TAU * Math.sqrt(el.a ** 3 / MU);
let E = el.M;
for (let k = 0; k < 100; k++) { const f = E - el.e * Math.sin(E) - el.M, fp = 1 - el.e * Math.cos(E); const dE = f / fp; E -= dE; if (Math.abs(dE) < 1e-12) break; }
console.log("E =", (E / RAD).toFixed(4), "deg");
// expected r magnitude from geometry: r = a(1 - e cosE)
console.log("r expected =", (el.a * (1 - el.e * Math.cos(E))).toFixed(6));
