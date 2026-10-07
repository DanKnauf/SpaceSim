const A = require("astronomy-engine");
const P = require("../js/physics.js");

function keplerPos(el, T) {
  const a = el.a + el.da * T, e = el.e + el.de * T, i = (el.i + el.di * T) * Math.PI / 180;
  const L = (el.L + el.dL * T) * Math.PI / 180, wbar = (el.wbar + el.dwbar * T) * Math.PI / 180;
  const O = (el.O + el.dO * T) * Math.PI / 180;
  const M = L - wbar;
  let E = M;
  for (let k = 0; k < 50; k++) { const f = E - e * Math.sin(E) - M; E -= f / (1 - e * Math.cos(E)); if (Math.abs(f) < 1e-14) break; }
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = wbar - O;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return {
    x: (cO*cw - sO*sw*ci)*xp + (-cO*sw - sO*cw*ci)*yp,
    y: (sO*cw + cO*sw*ci)*xp + (-sO*sw + cO*cw*ci)*yp,
    z: (sw*si)*xp + (cw*si)*yp
  };
}
function ll(r) {
  const rr = Math.hypot(r.x, r.y, r.z);
  return [Math.atan2(r.y, r.x) * 180 / Math.PI, Math.asin(r.z / rr) * 180 / Math.PI, rr];
}
function ang(a, b) {
  const c = (a.x*b.x + a.y*b.y + a.z*b.z) / (Math.hypot(a.x,a.y,a.z) * Math.hypot(b.x,b.y,b.z));
  return Math.acos(Math.max(-1, Math.min(1, c))) * 206264.806;
}

// 1800-2050 table: as in our code (dO = -0.01532341) and as per JPL/danbp (dO = -0.00508664)
const N1800_OURS = { a: 30.06992276, e: 0.00859048, i: 1.77004347, L: -55.12002969, wbar: 44.96476227, O: 131.78422574,
                     da: 0.00026291, de: 0.00005105, di: 0.00035372, dL: 218.45945325, dwbar: -0.32241464, dO: -0.01532341 };
const N1800_JPL  = { ...N1800_OURS, dO: -0.00508664 };
const N3000      = { a: 30.06952752, e: 0.00895439, i: 1.77005520, L: 304.22289287, wbar: 46.68158724, O: 131.78635853,
                     da: 0.00006447, de: 0.00000818, di: 0.00022400, dL: 218.46515314, dwbar: 0.01009938, dO: -0.00606302 };

const EPS = 23.4392911 * Math.PI / 180, C = Math.cos(EPS), S = Math.sin(EPS);
const eqjToEcl = v => ({ x: v.x, y: v.y * C + v.z * S, z: -v.y * S + v.z * C });

for (const [label, d] of [["J2000", new Date(Date.UTC(2000, 0, 1, 12))], ["2050-06-15", new Date(Date.UTC(2050, 5, 15, 12))]]) {
  const t = P.daysFromUTC(d), T = t / 36525;
  const eng = eqjToEcl(A.HelioVector(A.Body.Neptune, d));
  const rows = {
    "1800-2050 (our dO)": keplerPos(N1800_OURS, T),
    "1800-2050 (JPL dO)": keplerPos(N1800_JPL, T),
    "3000BC-3000AD table": keplerPos(N3000, T),
    "physics.js": P.planetPosition("neptune", t),
    "engine VSOP87": eng,
  };
  console.log(label);
  for (const [tag, v] of Object.entries(rows)) {
    const [lon, lat, r] = ll(v);
    console.log(`  ${tag.padEnd(20)} lon=${lon.toFixed(5)}  lat=${lat.toFixed(5)}  r=${r.toFixed(6)}   d(eng)=${ang(v, eng).toFixed(2)}"`);
  }
}
