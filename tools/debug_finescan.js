const P = require("../js/physics.js");
const t0 = P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12)));
const r0 = P.planetPosition("earth", t0);
const v0 = P.planetVelocity("earth", t0);

function fineScan(id) {
  const dest = (t) => P.destinationPosition(id, t);
  const rB0 = dest(t0);
  const rAm = P.len(r0), rBm = P.len(rB0);
  const aH = 0.5 * (rAm + rBm);
  const tHoh = Math.PI * Math.sqrt(aH * aH * aH / P.MU_SUN);

  const plan = P.planTransfer(t0, r0, v0, dest);
  let fine = null;
  const lo = tHoh * 0.4, hi = tHoh * 4;
  for (let t = lo; t <= hi; t = hi <= 600 ? t + 4 : t * 1.03) {
    for (const fam of [0, 1]) {
      let sol;
      try { sol = P.solveTOFMatch(t0, r0, dest, t, fam); } catch (e) { continue; }
      if (!sol) continue;
      const dv = P.len(P.sub(sol.v0, v0)) * P.AU_DAY_KMS;
      if (!fine || dv < fine.dv) fine = { dv, TOF: sol.TOF, fam };
    }
  }
  console.log(
    `${id}: planner TOF=${plan.TOF.toFixed(1)}d dV=${plan.dV_kms.toFixed(2)} | fine TOF=${fine.TOF.toFixed(1)}d dV=${fine.dv.toFixed(2)} fam=${fine.fam} | gap=${((plan.dV_kms - fine.dv) / fine.dv * 100).toFixed(1)}%`
  );
}
for (const id of ["mercury", "venus", "mars", "jupiter", "saturn", "neptune"]) fineScan(id);
