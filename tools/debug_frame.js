const P = require("../js/physics.js");
const A = require("../tools/node_modules/astronomy-engine");
const V = P.V;

const date = new Date(Date.UTC(2026, 9, 3, 12));
const t = P.daysFromUTC(date);
console.log("t =", t, "days since J2000");

const mine = P.planetPosition("earth", t); // ecliptic of DATE (JPL elements, no precession)
const hv = A.HelioVector(A.Body.EMB, date); // frame? check README says equatorial, equinox of date

function ang(a, b) {
  const d = P.len(P.sub(a, b));
  return Math.asin(Math.min(1, d / (P.len(a) + P.len(b)) / 1e0)) ; // rough
}
function diffAng(a, b) {
  const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (P.len(a) * P.len(b));
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}

console.log("mine (ecl date)      :", mine);
console.log("hv   (raw engine)    :", hv);
console.log("angle mine vs hv     :", diffAng(mine, hv).toExponential(4), "deg");

// Step the test performs:
const ec = A.Ecliptic(hv, date); // ecliptic of date
console.log("ec = Ecliptic(hv)    :", ec.vec);
console.log("angle mine vs ec     :", diffAng(mine, ec.vec).toExponential(4), "deg");

// Now the p rotation (test's J2000 reduction):
const T = t / 36525;
const pArc = 5028.7961955 * T - 62.569310 * T * T + 6.226787 * T * T * T
         - 0.654230 * Math.pow(T, 4) - 0.059468 * Math.pow(T, 5)
         + 0.005789 * Math.pow(T, 6);
const p = pArc / 3600 * Math.PI / 180;
const c = Math.cos(p), s = Math.sin(p);
const ref = V(ec.vec.x * c - ec.vec.y * s, ec.vec.x * s + ec.vec.y * c, ec.vec.z);
console.log("p rotation angle     :", p * 180 / Math.PI, "deg (pArc =", pArc, "arcsec)");
console.log("angle mine vs ref    :", diffAng(mine, ref).toExponential(4), "deg");
console.log("|mine - ref| =", P.len(P.sub(mine, ref)), "AU");

// What if we DON'T apply the p rotation? (i.e. compare both in ecliptic of date)
console.log("angle mine vs ec (no p):", diffAng(mine, ec.vec).toExponential(4), "deg");

// Probe: does the engine's HelioVector agree with VSOP in the DATE frame?
// Compare Earth at J2000 (no precession):
const d0 = new Date(Date.UTC(2000, 0, 1, 12));
const t0 = 0;
const m0 = P.planetPosition("earth", t0);
const hv0 = A.HelioVector(A.Body.EMB, d0);
const ec0 = A.Ecliptic(hv0, d0);
console.log("--- at J2000 ---");
console.log("angle mine vs ecliptic(hv):", diffAng(m0, ec0.vec).toExponential(4), "deg");
console.log("angle mine vs hv raw      :", diffAng(m0, hv0).toExponential(4), "deg");

// Probe what frame the engine returns: Earth equatorial vector at 2026.
// The vernal equinox direction in equinox-of-date frame is always (1,0,0).
// If engine returned J2000 equatorial, the ecliptic pole would be offset.
// Simplest: compare |hv| and its ecliptic latitude at two dates, plus the
// ecliptic longitude rate of Earth (should be 35999.37 deg/century in date frame).
const dA = new Date(Date.UTC(2026, 9, 3, 12));
const dB = new Date(Date.UTC(2026, 9, 4, 12));
const lA = A.Ecliptic(A.HelioVector(A.Body.EMB, dA), dA).elon;
const lB = A.Ecliptic(A.HelioVector(A.Body.EMB, dB), dB).elon;
let dl = lB - lA; if (dl < -180) dl += 360;
console.log("Earth ecliptic lon rate (engine, date frame):", dl, "deg/day (expect ~0.985647)");
