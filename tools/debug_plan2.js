const P = require("../js/physics.js");
const t0 = P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12)));
const r0 = P.planetPosition("earth", t0);
const v0 = P.planetVelocity("earth", t0);

for (const id of ["moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"]) {
  const dest = (t) => P.destinationPosition(id, t);
  const tStart = Date.now();
  const plan = P.planTransfer(t0, r0, v0, dest);
  const ms = Date.now() - tStart;
  if (!plan || plan.error) { console.log(`${id}: ERROR ${plan && plan.error}`); continue; }
  // verify arrival: propagate departure conic to TOF, compare to dest at tArrival
  const orb = P.conicFromState(r0, plan.v0);
  const s = P.conicPropagate(orb, plan.TOF);
  const target = dest(plan.tArrival);
  const miss = P.len(P.sub(s.pos, target));
  console.log(
    `${id}: TOF=${plan.TOF.toFixed(1)}d (${(plan.TOF / 365.25).toFixed(2)}y) dV=${plan.dV_kms.toFixed(2)} km/s e=${plan.e.toFixed(3)} miss=${(miss * P.AU_KM / 1e6).toFixed(2)} Mkm [${ms} ms]`
  );
}

// mid-space retarget Jupiter -> Saturn
const tJ = t0 + 800;
const rJ = P.planetPosition("jupiter", tJ);
const vJ = P.planetVelocity("jupiter", tJ);
const plan2 = P.planTransfer(tJ, rJ, vJ, (t) => P.destinationPosition("saturn", t));
if (plan2 && !plan2.error) {
  const orb = P.conicFromState(rJ, plan2.v0);
  const s = P.conicPropagate(orb, plan2.TOF);
  const miss = P.len(P.sub(s.pos, P.destinationPosition("saturn", plan2.tArrival)));
  console.log(`retarget Jupiter->Saturn: TOF=${plan2.TOF.toFixed(0)}d dV=${plan2.dV_kms.toFixed(2)} km/s miss=${(miss * P.AU_KM / 1e6).toFixed(2)} Mkm`);
} else {
  console.log("retarget Jupiter->Saturn: ERROR " + (plan2 && plan2.error));
}
