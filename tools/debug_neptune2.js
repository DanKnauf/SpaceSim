const A = require("astronomy-engine");
const P = require("../js/physics.js");

const AU = 149597870.7;
// NASA Horizons, Neptune (899), heliocentric, Ecliptic of J2000.0, 2000-01-01 12:00 TDB
const HZ = { x: 2.515046523944309e9 / AU, y: -3.738714567646374e9 / AU, z: 1.903221685677218e7 / AU };

const d = new Date(Date.UTC(2000, 0, 1, 12));
const t = P.daysFromUTC(d);
const EPS = 23.4392911 * Math.PI / 180, C = Math.cos(EPS), S = Math.sin(EPS);
const eng = (v => ({ x: v.x, y: v.y * C + v.z * S, z: -v.y * S + v.z * C }))(A.HelioVector(A.Body.Neptune, d));
const ours = P.planetPosition("neptune", t);

function ang(a, b) {
  const c = (a.x*b.x + a.y*b.y + a.z*b.z) / (Math.hypot(a.x,a.y,a.z) * Math.hypot(b.x,b.y,b.z));
  return Math.acos(Math.max(-1, Math.min(1, c))) * 206264.806;
}
function show(tag, v) {
  const r = Math.hypot(v.x, v.y, v.z);
  console.log(`${tag.padEnd(12)} x=${v.x.toFixed(5)} y=${v.y.toFixed(5)} z=${v.z.toFixed(5)}  r=${r.toFixed(5)}  d(HZ)=${ang(v, HZ).toFixed(2)}"`);
}
show("Horizons", HZ);
show("Engine", eng);
show("Ours", ours);
console.log("d(eng,ours) =", ang(eng, ours).toFixed(2), "arcsec");
