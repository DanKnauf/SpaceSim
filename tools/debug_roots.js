globalThis.__LAMBERT_DEBUG__ = true;
const P = require("../js/physics.js");
const t0 = P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12)));
const r0 = P.planetPosition("earth", t0);
const dest = (t) => P.destinationPosition("saturn", t);
for (const t of [4788, 5200]) {
  console.log(`--- tGuess=${t} fam=1 ---`);
  const sol = P.solveTOFMatch(t0, r0, dest, t, 1);
  const v0 = P.planetVelocity("earth", t0);
  const dv = P.len(P.sub(sol.v0, v0)) * P.AU_DAY_KMS;
  console.log(`result TOF=${sol.TOF.toFixed(2)} dV=${dv.toFixed(2)}`);
}
