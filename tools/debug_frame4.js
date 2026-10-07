const P = require("../js/physics.js");
const A = require("astronomy-engine");
const V = P.V;

// Properly apply a 3x3 rotation matrix {rot:[[..],[..],[..]]} to a vector.
function apply(M, v) {
  const R = M.rot;
  return V(
    R[0][0] * v.x + R[0][1] * v.y + R[0][2] * v.z,
    R[1][0] * v.x + R[1][1] * v.y + R[1][2] * v.z,
    R[2][0] * v.x + R[2][1] * v.y + R[2][2] * v.z
  );
}
function diffAng(a, b) {
  const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (P.len(a) * P.len(b));
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}
function diffKm(a, b) { return P.len(P.sub(a, b)) * P.AU_KM; }

for (const d of [new Date(Date.UTC(2010, 2, 3)), new Date(Date.UTC(2026, 9, 3)), new Date(Date.UTC(2050, 5, 15))]) {
  const t = P.daysFromUTC(d);
  const mine = P.planetPosition("earth", t); // JPL elements
  const hv = A.HelioVector(A.Body.EMB, d);  // EQJ (J2000 equatorial)

  // ECT = true ecliptic of date (what A.Ecliptic returns).
  const ect = A.Ecliptic(hv, d).vec;
  // ECL = J2000 mean ecliptic, via rotation matrix applied correctly.
  const ecl = apply(A.Rotation_EQJ_ECL(d), hv);

  console.log(d.toISOString().slice(0, 10));
  console.log("  mine vs ECT (ecl of date):", diffAng(mine, ect).toFixed(5), "deg =", diffKm(mine, ect).toFixed(0), "km");
  console.log("  mine vs ECL (J2000 ecl)  :", diffAng(mine, ecl).toFixed(5), "deg =", diffKm(mine, ecl).toFixed(0), "km");
}
