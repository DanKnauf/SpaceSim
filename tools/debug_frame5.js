const P = require("../js/physics.js");
const A = require("astronomy-engine");
const V = P.V;

const EPS_J2000 = 23.4392911 * Math.PI / 180;

// EQJ (J2000 equatorial) -> ECL (J2000 mean ecliptic).
function eqjToEcl(v) {
  const c = Math.cos(EPS_J2000), s = Math.sin(EPS_J2000);
  return V(v.x, v.y * c + v.z * s, -v.y * s + v.z * c);
}
function diffAng(a, b) {
  const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (P.len(a) * P.len(b));
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}
function diffKm(a, b) { return P.len(P.sub(a, b)) * P.AU_KM; }

const BODIES = { mercury: A.Body.Mercury, venus: A.Body.Venus, earth: A.Body.EMB,
  mars: A.Body.Mars, jupiter: A.Body.Jupiter, saturn: A.Body.Saturn,
  uranus: A.Body.Uranus, neptune: A.Body.Neptune };
const DATES = [new Date(Date.UTC(2000, 0, 1, 12)), new Date(Date.UTC(2010, 2, 3)),
  new Date(Date.UTC(2026, 9, 3)), new Date(Date.UTC(2050, 5, 15))];

for (const d of DATES) {
  const t = P.daysFromUTC(d);
  const row = [d.toISOString().slice(0, 10)];
  for (const name in BODIES) {
    const mine = P.planetPosition(name, t);
    const ecl = eqjToEcl(A.HelioVector(BODIES[name], d));
    row.push(name.slice(0, 3) + ":" + diffKm(mine, ecl).toFixed(0));
  }
  console.log(row.join("  "));
}
console.log("(values in km: |our ephemeris - VSOP87 in J2000 mean ecliptic|)");
