const A = require("astronomy-engine");
const P = require("../js/physics.js");

const AU = 149597870.7;
// NASA Horizons, Saturn (699), heliocentric, Ecliptic of J2000.0, 2020-12-21 18:30 TDB
const HZ = {
  saturn: { x: 8.148562579176720e8 / AU, y: -1.399784277698072e9 / AU, z: -1.064246187434798e7 / AU },
};
const d = new Date(Date.UTC(2020, 11, 21, 18, 30, 0));
const t = P.daysFromUTC(d);

const eps = 23.4392911 * Math.PI / 180, c = Math.cos(eps), s = Math.sin(eps);
const hv = A.HelioVector(A.Body.Saturn, d);
const eng = { x: hv.x, y: hv.y * c + hv.z * s, z: -hv.y * s + hv.z * c };
const ours = P.planetPosition("saturn", t);

function show(tag, v) {
  const r = Math.hypot(v.x, v.y, v.z);
  const lon = Math.atan2(v.y, v.x) * 180 / Math.PI;
  const lat = Math.asin(v.z / r) * 180 / Math.PI;
  const dhz = Math.hypot(v.x - HZ.saturn.x, v.y - HZ.saturn.y, v.z - HZ.saturn.z);
  console.log(`${tag}: r=${r.toFixed(6)} AU  lon=${lon.toFixed(5)}  lat=${lat.toFixed(5)}  d(Horizons)=${(dhz * AU / 1000).toFixed(1)} km`);
}
show("Horizons", HZ.saturn);
show("Engine  ", eng);
show("Ours    ", ours);
