const A = require("astronomy-engine");
const d = new Date(Date.UTC(2026, 9, 3, 12));
const hv = A.HelioVector(A.Body.EMB, d);
function apply(M, v) {
  return [
    M[0][0] * v.x + M[0][1] * v.y + M[0][2] * v.z,
    M[1][0] * v.x + M[1][1] * v.y + M[1][2] * v.z,
    M[2][0] * v.x + M[2][1] * v.y + M[2][2] * v.z
  ];
}
function ang(a, b) {
  const dd = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b));
  return Math.acos(Math.max(-1, Math.min(1, dd))) * 180 / Math.PI;
}
const fEcl = A.Ecliptic(hv, d).vec;
const Mect = A.Rotation_EQJ_ECT(d).rot;
const Mecl = A.Rotation_EQJ_ECL(d).rot;
const ect = apply(Mect, hv), ecl = apply(Mecl, hv);
console.log("Ecliptic(hv)      :", fEcl);
console.log("Rot_EQJ_ECT . hv  :", ect);
console.log("Rot_EQJ_ECL . hv  :", ecl);
console.log("ang Ecliptic vs ECT:", ang(fEcl, ect).toExponential(3), "deg");
console.log("ang Ecliptic vs ECL:", ang(fEcl, ecl).toExponential(3), "deg");
console.log("ang ECT vs ECL     :", ang(ect, ecl).toExponential(3), "deg");
