const P = require("../js/physics.js");
const A = require("astronomy-engine");
const V = P.V;

const EPS_J2000 = 23.4392911 * Math.PI / 180;
function eqjToEcl(v) {
  const c = Math.cos(EPS_J2000), s = Math.sin(EPS_J2000);
  return V(v.x, v.y * c + v.z * s, -v.y * s + v.z * c);
}
function fmt(v){ return `(${v.x.toFixed(6)}, ${v.y.toFixed(6)}, ${v.z.toFixed(6)})`; }
function diffAng(a, b) {
  const c = (a.x*b.x + a.y*b.y + a.z*b.z)/(P.len(a)*P.len(b));
  return Math.acos(Math.max(-1,Math.min(1,c))) * 180 / Math.PI;
}

const d = new Date(Date.UTC(2026, 9, 3, 12));
const t = P.daysFromUTC(d);
const mine  = P.planetPosition("earth", t);
const hv    = A.HelioVector(A.Body.EMB, d);          // EQJ
const eclJ  = eqjToEcl(hv);                          // J2000 mean ecliptic (ECL)
const ect   = A.Ecliptic(hv, d).vec;                 // true ecliptic of date (ECT)

console.log("t =", t, "days");
console.log("mine (our ephemeris)   :", fmt(mine));
console.log("hv   (EQJ, J2000 eq)   :", fmt(hv));
console.log("eclJ (ECL, J2000 ecl)  :", fmt(eclJ));
console.log("ect  (ECT, true ecl dt):", fmt(ect));
console.log("");
console.log("mine vs eclJ (J2000 ecl):", diffAng(mine, eclJ).toExponential(3), "deg");
console.log("mine vs ect  (ecl date) :", diffAng(mine, ect).toExponential(3), "deg");
console.log("eclJ vs ect             :", diffAng(eclJ, ect).toExponential(3), "deg (should be ~precession 0.37deg)");
