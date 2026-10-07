const P = require("../js/physics.js");
const t0 = P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12)));
const r0 = P.planetPosition("earth", t0);
const v0 = P.planetVelocity("earth", t0);
const dest = (t) => P.destinationPosition("venus", t);
const v0m = P.len(v0) * P.AU_DAY_KMS;

const rB0 = dest(t0);
const rAm = P.len(r0), rBm = P.len(rB0);
const aH = 0.5 * (rAm + rBm);
const tHoh = Math.PI * Math.sqrt(aH * aH * aH / P.MU_SUN);
const theta = Math.acos(P.dot(r0, rB0) / (rAm * rBm));
const tLong = 2 * tHoh * (1 - theta / (2 * Math.PI));
console.log(`tHoh=${tHoh.toFixed(1)} theta=${(theta * 180 / Math.PI).toFixed(2)}deg tLong=${tLong.toFixed(1)}`);

for (const t of [147, 200, tLong, 320, 400, 500]) {
  for (const fam of [0, 1]) {
    let out;
    try {
      const sol = P.solveTOFMatch(t0, r0, dest, t, fam);
      if (!sol) out = "null";
      else {
        const dv = P.len(P.sub(sol.v0, v0)) * P.AU_DAY_KMS;
        const v0k = P.len(sol.v0) * P.AU_DAY_KMS;
        // verify arrival
        const orb = P.conicFromState(r0, sol.v0);
        const s = P.conicPropagate(orb, sol.TOF);
        const miss = P.len(P.sub(s.pos, dest(t0 + sol.TOF)));
        out = `TOF=${sol.TOF.toFixed(1)} dV=${dv.toFixed(2)} |v0|=${v0k.toFixed(2)} e=${sol.e.toFixed(3)} miss=${(miss * P.AU_KM / 1e6).toFixed(2)}Mkm`;
      }
    } catch (e) { out = "throw: " + e.message; }
    console.log(`t=${t.toFixed(0)} fam=${fam}: ${out}`);
  }
}
console.log(`\nEarth speed ${v0m.toFixed(2)} km/s`);
