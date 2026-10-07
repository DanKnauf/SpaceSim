// Fine scan around the long-arc minimum, at the t0 the app actually uses.
const P = require("../js/physics.js");

function scanAt(t0) {
  const r0 = P.planetPosition("earth", t0);
  const v0 = P.planetVelocity("earth", t0);
  const dest = (t) => P.planetPosition("neptune", t);
  const rAm = Math.hypot(r0.x, r0.y, r0.z);
  const rBm = Math.hypot(dest(t0).x, dest(t0).y, dest(t0).z);
  const aH = 0.5 * (rAm + rBm);
  const tHoh = Math.PI * Math.sqrt((aH * aH * aH) / P.MU_SUN);

  function bestDv(t) {
    let best = null;
    for (let fam = 0; fam < 2; fam++) {
      let sol;
      try { sol = P.solveTOFMatch(t0, r0, dest, t, fam); } catch (e) { continue; }
      if (!sol) continue;
      const dv = Math.hypot(sol.v0.x - v0.x, sol.v0.y - v0.y, sol.v0.z - v0.z) * P.AU_DAY_KMS;
      if (!best || dv < best.dv) best = { dv, tof: sol.TOF, e: sol.e, fam };
    }
    return best;
  }
  let min = null;
  console.log(`\n--- t0=${t0}  (tHoh=${(tHoh / 365.25).toFixed(1)} y) ---`);
  for (let y = 85; y <= 115.001; y += 0.5) {
    const b = bestDv(y * 365.25);
    if (!b) { console.log(`${y.toFixed(1)}y  unsolvable`); continue; }
    if (!min || b.dv < min.dv) min = b;
    console.log(`${y.toFixed(1)}y  dV=${b.dv.toFixed(3)}  e=${b.e.toFixed(4)}  fam${b.fam}  TOFcalc=${(b.tof / 365.25).toFixed(2)}y`);
  }
  if (min) console.log(`min: dV=${min.dv.toFixed(3)} km/s at ${(min.tof / 365.25).toFixed(2)} y (e=${min.e.toFixed(4)})`);
  const plan = P.planTransfer(t0, r0, v0, dest);
  console.log(`planTransfer: TOF=${(plan.TOF / 365.25).toFixed(2)} y  dV=${plan.dV_kms.toFixed(3)} km/s  e=${plan.e.toFixed(4)}`);
  return plan;
}

scanAt(9774.3);
scanAt(9775.2);
