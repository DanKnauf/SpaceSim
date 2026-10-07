const A = require("astronomy-engine");
const P = require("../js/physics.js");

function sepDeg(a, b) {
  const c = (a.x*b.x + a.y*b.y + a.z*b.z) / (Math.hypot(a.x,a.y,a.z) * Math.hypot(b.x,b.y,b.z));
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}

// Scan 2020-12-18 .. 2020-12-25, find min geocentric separation (engine).
let minE = 1e9, minT = null;
for (let ms = Date.UTC(2020, 11, 18); ms <= Date.UTC(2020, 11, 25); ms += 15 * 60000) {
  const d = new Date(ms);
  const s = sepDeg(A.GeoVector(A.Body.Jupiter, d, true), A.GeoVector(A.Body.Saturn, d, true));
  if (s < minE) { minE = s; minT = new Date(ms); }
}
console.log("ENGINE min separation:", (minE * 60).toFixed(3), "arcmin at", minT.toISOString());

// Same scan with our ephemeris.
let minO = 1e9, minTO = null;
for (let ms = Date.UTC(2020, 11, 18); ms <= Date.UTC(2020, 11, 25); ms += 15 * 60000) {
  const d = new Date(ms);
  const t = P.daysFromUTC(d);
  const j = P.sub(P.planetPosition("jupiter", t), P.planetPosition("earth", t));
  const s2 = P.sub(P.planetPosition("saturn", t), P.planetPosition("earth", t));
  const s = sepDeg(j, s2);
  if (s < minO) { minO = s; minTO = new Date(ms); }
}
console.log("OURS   min separation:", (minO * 60).toFixed(3), "arcmin at", minTO.toISOString());
