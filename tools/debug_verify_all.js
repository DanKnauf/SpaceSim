const A = require("astronomy-engine");
const P = require("../js/physics.js");

const EPS = 23.4392911 * Math.PI / 180, C = Math.cos(EPS), S = Math.sin(EPS);
// engine EQJ -> J2000 mean ecliptic
function eqjToEcl(v) { return { x: v.x, y: v.y * C + v.z * S, z: -v.y * S + v.z * C }; }

const BODIES = {
  mercury: A.Body.Mercury, venus: A.Body.Venus, earth: A.Body.EMB, mars: A.Body.Mars,
  jupiter: A.Body.Jupiter, saturn: A.Body.Saturn, uranus: A.Body.Uranus, neptune: A.Body.Neptune,
};
// JPL stated nominal errors, 1800-2050 table (arcsec in longitude)
const JPL_LON = { mercury: 15, venus: 20, earth: 20, mars: 40, jupiter: 400, saturn: 600, uranus: 50, neptune: 10 };
const DATES = [
  ["J2000", new Date(Date.UTC(2000, 0, 1, 12))],
  ["2010-03-03", new Date(Date.UTC(2010, 2, 3, 12))],
  ["2026-10-03", new Date(Date.UTC(2026, 9, 3, 12))],
  ["2050-06-15", new Date(Date.UTC(2050, 5, 15, 12))],
];

function angBetween(a, b) {
  const c = (a.x*b.x + a.y*b.y + a.z*b.z) / (Math.hypot(a.x,a.y,a.z) * Math.hypot(b.x,b.y,b.z));
  return Math.acos(Math.max(-1, Math.min(1, c))) * 206264.806; // arcsec
}

console.log("planet      " + DATES.map(d => d[0].padEnd(11)).join(""));
for (const [name, body] of Object.entries(BODIES)) {
  const cells = DATES.map(([label, d]) => {
    const t = P.daysFromUTC(d);
    const mine = P.planetPosition(name, t);
    const ref = eqjToEcl(A.HelioVector(body, d));
    return angBetween(mine, ref).toFixed(1).padStart(8) + "s";
  });
  console.log(name.padEnd(11) + cells.join(" ") + `   (JPL max ${JPL_LON[name]}")`);
}
