const P = require("../js/physics.js");
const A = require("../tools/node_modules/astronomy-engine");
const V = P.V;

function diffAng(a, b) {
  const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (P.len(a) * P.len(b));
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}

for (const d of [new Date(Date.UTC(2010, 2, 3)), new Date(Date.UTC(2026, 9, 3)), new Date(Date.UTC(2050, 5, 15))]) {
  const t = P.daysFromUTC(d);
  const mine = P.planetPosition("earth", t);
  const hv = A.HelioVector(A.Body.EMB, d); // EQJ (J2000 equatorial)

  // Direct EQJ -> ECL (J2000 mean ecliptic) via engine rotation matrix.
  const M = A.Rotation_EQJ_ECL(d).rot; // 3x3 (array of 3 rows of 3)
  const eclJ = V(
    M[0][0] * hv.x + M[0][1] * hv.y + M[0][2] * hv.z,
    M[1][0] * hv.x + M[1][1] * hv.y + M[1][2] * hv.z,
    M[2][0] * hv.x + M[2][1] * hv.y + M[2][2] * hv.z
  );
  // EQJ -> ECT (true ecliptic of date)
  const M2 = A.Rotation_EQJ_ECT(d).rot;
  const ect = V(
    M2[0][0] * hv.x + M2[0][1] * hv.y + M2[0][2] * hv.z,
    M2[1][0] * hv.x + M2[1][1] * hv.y + M2[1][2] * hv.z,
    M2[2][0] * hv.x + M2[2][1] * hv.y + M2[2][2] * hv.z
  );
  console.log(d.toISOString());
  console.log("  mine vs ECL (J2000 ecliptic):", diffAng(mine, eclJ).toFixed(5), "deg =", (diffAng(mine, eclJ) * 3600).toFixed(1), "arcsec");
  console.log("  mine vs ECT (true ecl date) :", diffAng(mine, ect).toFixed(5), "deg =", (diffAng(mine, ect) * 3600).toFixed(1), "arcsec");
  console.log("  ECL vs ECT                  :", diffAng(eclJ, ect).toFixed(5), "deg =", (diffAng(eclJ, ect) * 3600).toFixed(1), "arcsec");
}
