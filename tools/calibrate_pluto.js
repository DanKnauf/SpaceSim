// Derive Pluto's osculating Keplerian elements (ecliptic J2000) from the
// astronomy-engine (VSOP87-based) ephemeris, so physics.js ELEMENTS.pluto
// matches the reference ephemeris at J2000. Also prints the worst position
// error between pure-Kepler propagation from a given element set and the
// ephemeris at the test suite's validation dates.
// Run: node tools/calibrate_pluto.js
const P = require("../js/physics.js");
const Astronomy = require("./node_modules/astronomy-engine");

const MU = P.MU_SUN;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const J2000 = P.daysFromUTC(new Date(Date.UTC(2000, 0, 1, 12)));
const TEST_DATES = [J2000,
  P.daysFromUTC(new Date(Date.UTC(2050, 5, 15, 12))),
  P.daysFromUTC(new Date(Date.UTC(2010, 2, 3, 12))),
  P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12)))];

// heliocentric ecliptic J2000 position at t (precession removed, as in the
// test suite's toEclipticJ2000)
function eclJ2000(tDays) {
  const d = new Date(Date.UTC(2000, 0, 1, 12) + tDays * 86400000);
  const eq = Astronomy.HelioVector(Astronomy.Body.Pluto, d); // EQJ vector (same as test suite)
  const ec = Astronomy.Ecliptic(eq);
  const T = tDays / 36525;
  const pArc = 5028.7961955 * T - 62.569310 * T * T + 6.226787 * T * T * T
           - 0.654230 * Math.pow(T, 4) - 0.059468 * Math.pow(T, 5)
           + 0.005789 * Math.pow(T, 6);
  const p = pArc / 3600 * D2R, c = Math.cos(p), s = Math.sin(p);
  const v = ec.vec;
  return { x: v.x * c + v.y * s, y: -v.x * s + v.y * c, z: v.z };
}

function stateAt(tDays) {
  const h = 1 / 86400; // 1 s step
  const a = eclJ2000(tDays - h), b = eclJ2000(tDays + h);
  return {
    r: { x: a.x, y: a.y, z: a.z },
    v: { x: (b.x - a.x) / (2 * h), y: (b.y - a.y) / (2 * h), z: (b.z - a.z) / (2 * h) }
  };
}

// classical osculating elements from a state vector (ecliptic J2000, Sun at origin)
function osculatingElements(rv) {
  const r = rv.r, v = rv.v;
  const rd = r.x * v.x + r.y * v.y + r.z * v.z;
  const rmag = Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z);
  const v2 = v.x * v.x + v.y * v.y + v.z * v.z;
  // h = r x v
  const hx = r.y * v.z - r.z * v.y, hy = r.z * v.x - r.x * v.z, hz = r.x * v.y - r.y * v.x;
  const hmag = Math.hypot(hx, hy, hz);
  // n = z x h  (node vector)
  const nx = hy, ny = -hx;
  // eccentricity vector
  const ex = ((v2 - MU / rmag) * r.x - rd * v.x) / MU;
  const ey = ((v2 - MU / rmag) * r.y - rd * v.y) / MU;
  const ez = ((v2 - MU / rmag) * r.z - rd * v.z) / MU;
  const emag = Math.hypot(ex, ey, ez);
  const a = 1 / (2 / rmag - v2 / MU);
  const i = Math.acos(hz / hmag) * R2D;
  const O = Math.atan2(nx, ny) * R2D;
  // omega: angle in the orbital plane from node to perihelion
  // (b e) with b = (h x n)/hmag projected: b.e = (h x e)/hmag
  const bxE = (hx * ey - hy * ez) / hmag;
  const w = Math.atan2(bxE, nx * ex + ny * ey) * R2D;
  // true anomaly
  let nu = Math.acos((r.x * ex + r.y * ey + r.z * ez) / (rmag * emag));
  if (rd < 0) nu = 2 * Math.PI - nu;
  let M = nu - emag * Math.sin(nu);
  while (M > Math.PI) M -= 2 * Math.PI;
  while (M < -Math.PI) M += 2 * Math.PI;
  return { a, e: emag, i, O, w, M: M * R2D, rmag, nu: nu * R2D };
}

const el = osculatingElements(stateAt(J2000));
console.log("Pluto osculating elements at J2000 (ecliptic J2000, from ephemeris):");
console.log(`  a     = ${el.a.toFixed(6)} AU`);
console.log(`  e     = ${el.e.toFixed(6)}`);
console.log(`  i     = ${el.i.toFixed(5)} deg`);
console.log(`  Omega = ${el.O.toFixed(5)} deg`);
console.log(`  w     = ${el.w.toFixed(5)} deg`);
console.log(`  M     = ${el.M.toFixed(5)} deg   (nu = ${el.nu.toFixed(5)} deg, r = ${el.rmag.toFixed(5)} AU)`);

// worst |Kepler - ephemeris| over the test dates for a given element set
function worstError(a, e, i, O, w, M0) {
  let worst = 0, at = 0;
  const n = Math.sqrt(MU / (a * a * a));
  for (const t of TEST_DATES) {
    const st = eclJ2000(t);
    let M = ((M0 * D2R + n * (t - J2000)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    let E = M;
    for (let k = 0; k < 100; k++) {
      const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-13) break;
    }
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    const rr = a * (1 - e * Math.cos(E));
    const ci = Math.cos(i * D2R), si = Math.sin(i * D2R);
    const cO = Math.cos(O * D2R), sO = Math.sin(O * D2R);
    const cw = Math.cos(w * D2R), sw = Math.sin(w * D2R);
    const x1 = rr * Math.cos(nu), y1 = rr * Math.sin(nu);
    const X = (cO * cw - sO * sw * ci) * x1 + (-cO * sw - sO * cw * ci) * y1;
    const Y = (sO * cw + cO * sw * ci) * x1 + (-sO * sw + cO * cw * ci) * y1;
    const Z = (sw * si) * x1 + (cw * si) * y1;
    const d = Math.hypot(st.x - X, st.y - Y, st.z - Z);
    if (d > worst) { worst = d; at = t; }
  }
  return { worst, at };
}

console.log(`\nworst error at test dates:`);
const fit = worstError(el.a, el.e, el.i, el.O, el.w, el.M);
console.log(`  fitted elements:   ${fit.worst.toFixed(5)} AU (at t=${fit.at.toFixed(1)})`);
const cur = worstError(39.55, 0.2488, 16.98, 110.29, 113.76, 23.63);
console.log(`  current table:     ${cur.worst.toFixed(5)} AU (at t=${cur.at.toFixed(1)})`);
