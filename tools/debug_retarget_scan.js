const P = require("../js/physics.js");
const t0 = P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12)));
const tJ = t0 + 800;
const rJ = P.planetPosition("jupiter", tJ);
const vJ = P.planetVelocity("jupiter", tJ);
const dest = (t) => P.destinationPosition("saturn", t);
for (const t of [9000, 10500, 12208, 13500, 14800, 15288, 16000, 18000, 21000, 25000]) {
  let best = null;
  for (let fam = 0; fam < 2; fam++) {
    const s = P.solveTOFMatch(tJ, rJ, dest, t, fam);
    if (!s) continue;
    const dv = P.len(P.sub(s.v0, vJ)) * P.AU_DAY_KMS;
    if (!best || dv < best.dv) best = { dv, e: s.e };
  }
  console.log(`t=${t}d  ${best ? `dV=${best.dv.toFixed(2)} e=${best.e.toFixed(3)}` : "unsolvable"}`);
}
