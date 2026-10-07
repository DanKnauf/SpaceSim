// Recompute rates from saved derivedAtDates (all angles in degrees there)
// and compare with the stored elementsJ2000 rates.
const j = require("./comets_state.json");
const P = require("../js/physics.js");

const DATES = [
  { iso: "2010-03-03", t: P.daysFromUTC(new Date(Date.UTC(2010, 2, 3, 12, 0, 0))) },
  { iso: "2026-10-03", t: P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12, 0, 0))) },
  { iso: "2035-01-01", t: P.daysFromUTC(new Date(Date.UTC(2035, 0, 1, 12, 0, 0))) },
  { iso: "2050-06-15", t: P.daysFromUTC(new Date(Date.UTC(2050, 5, 15, 12, 0, 0))) }
];
const spanCen = (DATES[3].t - DATES[0].t) / 36525;
console.log("spanCen =", spanCen);

function angDiff(aDeg, bDeg) {
  let d = (aDeg - bDeg) % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

let allOk = true;
for (const [name, body] of Object.entries(j.bodies)) {
  const els = body.derivedAtDates;
  const wbar = el => (el.ODeg + el.wDeg) % 360; // degrees
  const recomputed = {
    da: (els[3].a - els[0].a) / spanCen,
    de: (els[3].e - els[0].e) / spanCen,
    di: angDiff(els[3].iDeg, els[0].iDeg) / spanCen,
    dO: angDiff(els[3].ODeg, els[0].ODeg) / spanCen,
    dwbar: angDiff(wbar(els[3]), wbar(els[0])) / spanCen
  };
  const stored = body.elementsJ2000;
  let ok = true;
  for (const k of ["da", "de", "di", "dO", "dwbar"]) {
    const good = Math.abs(recomputed[k] - stored[k]) < 1e-9;
    ok = ok && good;
    if (!good) console.log(`  ${name} ${k}: recomputed=${recomputed[k]} stored=${stored[k]}  MISMATCH`);
  }
  // also verify J2000 back-transform
  const T0 = DATES[1].t / 36525;
  const dL = stored.dL;
  const L2026 = (wbar(els[1]) + els[1].M0Deg) % 360;
  const Lj = (L2026 - dL * T0 + 360) % 360;
  if (Math.abs(angDiff(Lj, stored.L)) > 1e-6) { ok = false; console.log(`  ${name} L: recomputed=${Lj} stored=${stored.L} MISMATCH`); }
  allOk = allOk && ok;
}
console.log(allOk ? "ALL RATES CONSISTENT" : "INCONSISTENCIES FOUND");
process.exit(allOk ? 0 : 1);
