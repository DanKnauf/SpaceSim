// Debug: print Pluto's ephemeris state vector at J2000 in ecliptic J2000
// and compare against the JPL approximate-elements prediction.
const P = require("../js/physics.js");
const Astronomy = require("./node_modules/astronomy-engine");
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const J2000 = P.daysFromUTC(new Date(Date.UTC(2000, 0, 1, 12)));

function dateFor(tDays) { return new Date(Date.UTC(2000, 0, 1, 12) + tDays * 86400000); }
function toEclipticJ2000(eq, tDays) {
  const d = dateFor(tDays);
  const ec = Astronomy.Ecliptic(eq);
  const T = tDays / 36525;
  const pArc = 5028.7961955 * T - 62.569310 * T * T + 6.226787 * T * T * T
           - 0.654230 * Math.pow(T, 4) - 0.059468 * Math.pow(T, 5)
           + 0.005789 * Math.pow(T, 6);
  const p = pArc / 3600 * D2R, c = Math.cos(p), s = Math.sin(p);
  const v = ec.vec;
  return { x: v.x * c + v.y * s, y: -v.x * s + v.y * c, z: v.z };
}

const r = toEclipticJ2000(Astronomy.HelioVector(Astronomy.Body.Pluto, dateFor(J2000)), J2000);
console.log("ephemeris r at J2000 (ecliptic J2000, AU):",
  `x=${r.x.toFixed(4)} y=${r.y.toFixed(4)} z=${r.z.toFixed(4)}`,
  `r=${Math.hypot(r.x, r.y, r.z).toFixed(4)}`,
  `lon=${(Math.atan2(r.y, r.x) * R2D + 360) % 360}`.padStart(0) + " deg");

// JPL approximate elements (Standish 1992), propagated to J2000
{
  const a = 39.48211675, e = 0.24880757, i = 17.14001206 * D2R;
  const L = 238.92903833 * D2R, pw = 224.06891629 * D2R, O = 110.30393684 * D2R;
  const w = pw - O;
  const M = L - pw;
  let E = M;
  for (let k = 0; k < 100; k++) { const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= dE; if (Math.abs(dE) < 1e-14) break; }
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const rr = a * (1 - e * Math.cos(E));
  const ci = Math.cos(i), si = Math.sin(i), cO = Math.cos(O), sO = Math.sin(O), cw = Math.cos(w), sw = Math.sin(w);
  const x1 = rr * Math.cos(nu), y1 = rr * Math.sin(nu);
  const X = (cO * cw - sO * sw * ci) * x1 + (-cO * sw - sO * cw * ci) * y1;
  const Y = (sO * cw + cO * sw * ci) * x1 + (-sO * sw + cO * cw * ci) * y1;
  const Z = (sw * si) * x1 + (cw * si) * y1;
  console.log("JPL approx elements at J2000:",
    `x=${X.toFixed(4)} y=${Y.toFixed(4)} z=${Z.toFixed(4)}`,
    `r=${Math.hypot(X, Y, Z).toFixed(4)}`,
    `lon=${(Math.atan2(Y, X) * R2D + 360) % 360}`.padStart(0) + " deg");
}

// and our current table
{
  const q = P.planetPosition("pluto", J2000);
  console.log("current ELEMENTS.pluto at J2000:",
    `x=${q.x.toFixed(4)} y=${q.y.toFixed(4)} z=${q.z.toFixed(4)}`,
    `r=${Math.hypot(q.x, q.y, q.z).toFixed(4)}`,
    `lon=${(Math.atan2(q.y, q.x) * R2D + 360) % 360}`.padStart(0) + " deg");
}
