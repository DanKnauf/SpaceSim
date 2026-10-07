// Independent check: dV vs TOF envelope for an Earth->Neptune transfer
// from the current epoch, using the same solver the app uses.
const P = require("../js/physics.js");

const t0 = 9773.6; // ~2026-10-03, matches app boot
const r0 = P.planetPosition("earth", t0);
const v0 = P.planetVelocity("earth", t0);
const dest = (t) => P.planetPosition("neptune", t);

const rB0 = dest(t0);
const rAm = Math.hypot(r0.x, r0.y, r0.z);
const rBm = Math.hypot(rB0.x, rB0.y, rB0.z);
const aH = 0.5 * (rAm + rBm);
const tHoh = Math.PI * Math.sqrt((aH * aH * aH) / P.MU_SUN);
const c = (r0.x * rB0.x + r0.y * rB0.y + r0.z * rB0.z) / (rAm * rBm);
const theta = Math.acos(Math.max(-1, Math.min(1, c)));

console.log(`t0=${t0}  rAm=${rAm.toFixed(4)} AU  rBm=${rBm.toFixed(4)} AU  sep=${theta.toFixed(3)} rad (${(theta * 180 / Math.PI).toFixed(1)} deg)`);
console.log(`tHohmann=${tHoh.toFixed(0)} d (${(tHoh / 365.25).toFixed(1)} y)`);

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

console.log("\n TOF(y)     dV(km/s)   e        arc");
let min = null;
for (let f = 0.3; f <= 4.6; f += 0.1) {
  const t = tHoh * f;
  const b = bestDv(t);
  if (!b) { console.log(`${(t / 365.25).toFixed(1).padStart(8)}    (unsolvable)`); continue; }
  const mark = (!min || b.dv < min.dv) ? (min = b, "*") : " ";
  console.log(`${(t / 365.25).toFixed(1).padStart(8)}    ${b.dv.toFixed(3).padStart(9)}  ${b.e.toFixed(3)}  fam${b.fam} ${mark}`);
}
if (min) {
  console.log(`\nmin: dV=${min.dv.toFixed(3)} km/s at TOF=${(min.tof / 365.25).toFixed(1)} y (e=${min.e.toFixed(3)})`);
}
const plan = P.planTransfer(t0, r0, v0, dest);
console.log(`planTransfer: TOF=${(plan.TOF / 365.25).toFixed(1)} y  dV=${plan.dV_kms.toFixed(3)} km/s  e=${plan.e.toFixed(3)}`);
