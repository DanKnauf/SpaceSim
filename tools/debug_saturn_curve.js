const P = require("../js/physics.js");
const t0 = P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12)));
const r0 = P.planetPosition("earth", t0);
const v0 = P.planetVelocity("earth", t0);
const dest = (t) => P.destinationPosition("saturn", t);

for (const t of [3482, 4290, 4788, 5200, 5500, 5700, 5772, 5900, 6200, 6600, 6963]) {
  for (const fam of [0, 1]) {
    let sol;
    try { sol = P.solveTOFMatch(t0, r0, dest, t, fam); } catch (e) { sol = null; }
    if (!sol) { console.log(`t=${t} fam=${fam}: null`); continue; }
    const dv = P.len(P.sub(sol.v0, v0)) * P.AU_DAY_KMS;
    // effective Lambert angle at arrival
    const rB = dest(t0 + sol.TOF);
    const th = Math.acos(P.dot(r0, rB) / (P.len(r0) * P.len(rB))) * 180 / Math.PI;
    console.log(`t=${t} fam=${fam}: TOF=${sol.TOF.toFixed(1)} dV=${dv.toFixed(2)} e=${sol.e.toFixed(3)} theta=${th.toFixed(1)}deg`);
  }
}
