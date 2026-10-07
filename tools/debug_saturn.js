const A = require("astronomy-engine");
const P = require("../js/physics.js");

// Independent Kepler-solve using a generic element set.
function keplerPos(el, T) {
  const a = el.a + el.da * T, e = el.e + el.de * T, i = (el.i + el.di * T) * Math.PI / 180;
  const L = (el.L + el.dL * T) * Math.PI / 180, wbar = (el.wbar + el.dwbar * T) * Math.PI / 180;
  const O = (el.O + el.dO * T) * Math.PI / 180;
  const M = L - wbar;
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 50; k++) { const f = E - e * Math.sin(E) - M; E -= f / (1 - e * Math.cos(E)); if (Math.abs(f) < 1e-14) break; }
  const nu = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
  const r = a * (1 - e * Math.cos(E));
  const u = wbar - O + nu;
  const xp = r * Math.cos(u), yp = r * Math.sin(u);
  return {
    x: xp * Math.cos(O) - yp * Math.sin(O) * Math.cos(i),
    y: xp * Math.sin(O) + yp * Math.cos(O) * Math.cos(i),
    z: yp * Math.sin(i)
  };
}
function lonlat(r) {
  const rr = Math.hypot(r.x, r.y, r.z);
  return { lon: Math.atan2(r.y, r.x) * 180 / Math.PI, lat: Math.asin(r.z / rr) * 180 / Math.PI, rr };
}

const T1800 = { a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, wbar: 92.59887831, O: 113.66242448,
                da: -0.00125060, de: -0.00050991, di: 0.00193609, dL: 1222.49362201, dwbar: -0.41897216, dO: -0.28867794 };
const T3000 = { a: 9.54149883, e: 0.05550825, i: 2.49424102, L: 50.07571329, wbar: 92.86136063, O: 113.63998702,
                da: -0.00003065, de: -0.00032044, di: 0.00451969, dL: 1222.11494724, dwbar: 0.54179478, dO: -0.25015002 };

for (const [label, d] of [["J2000", new Date(Date.UTC(2000, 0, 1, 12))], ["2026", new Date(Date.UTC(2026, 9, 3, 12))]]) {
  const t = P.daysFromUTC(d);
  const T = t / 36525;
  const t1800 = lonlat(keplerPos(T1800, T));
  const t3000 = lonlat(keplerPos(T3000, T));
  const hv = A.HelioVector(A.Body.Saturn, d);
  const eps = 23.4392911 * Math.PI / 180, c = Math.cos(eps), s = Math.sin(eps);
  const ecl = lonlat({ x: hv.x, y: hv.y * c + hv.z * s, z: -hv.y * s + hv.z * c });
  const ours = lonlat(P.planetPosition("saturn", t));
  console.log(label);
  console.log("  1800-2050 table (ours):", t1800.lon.toFixed(4), t1800.lat.toFixed(4), t1800.rr.toFixed(5));
  console.log("  3000BC-3000AD table   :", t3000.lon.toFixed(4), t3000.lat.toFixed(4), t3000.rr.toFixed(5));
  console.log("  engine VSOP87 (ECL)   :", ecl.lon.toFixed(4), ecl.lat.toFixed(4), ecl.rr.toFixed(5));
  console.log("  physics.js (ours)     :", ours.lon.toFixed(4), ours.lat.toFixed(4), ours.rr.toFixed(5));
}
