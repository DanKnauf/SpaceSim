const P = require("../js/physics.js");
const t0 = P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12)));
const r0 = P.planetPosition("earth", t0);
const v0 = P.planetVelocity("earth", t0);

function probe(id) {
  const dest = (t) => P.destinationPosition(id, t);
  const rB0 = dest(t0);
  const rAm = P.len(r0), rBm = P.len(rB0);
  const aH = 0.5 * (rAm + rBm);
  const tHoh = Math.PI * Math.sqrt(aH * aH * aH / P.MU_SUN);
  const ang0 = Math.acos(P.dot(r0, rB0) / (rAm * rBm)) * 180 / Math.PI;
  console.log(`\n=== ${id}: rA=${rAm.toFixed(3)} rB=${rBm.toFixed(3)} angle=${ang0.toFixed(1)}deg tHoh=${tHoh.toFixed(0)}d ===`);
  for (const f of [0.55, 0.75, 1.0, 1.25, 1.6, 2.2]) {
    const t = tHoh * f;
    const rB = dest(t0 + t);
    let out;
    try {
      const sol = P.solveTOFMatch(t0, r0, dest, t);
      if (!sol) out = "null";
      else {
        const dv = P.len(P.sub(sol.v0, v0)) * P.AU_DAY_KMS;
        out = `TOF=${sol.TOF.toFixed(1)} (want ${t.toFixed(0)}) dV=${dv.toFixed(2)} e=${sol.e.toFixed(3)}`;
      }
    } catch (e) { out = "throw: " + e.message; }
    console.log(`  f=${f} -> ${out}`);
  }
}
for (const id of ["mars", "venus", "jupiter", "saturn", "neptune"]) probe(id);
