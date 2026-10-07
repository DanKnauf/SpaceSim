// Sample TOF(lambda) for the long-arc family of a FIXED two-point geometry
// to check monotonicity of the family's TOF range.
const P = require("../js/physics.js");
const TAU = 2 * Math.PI;
const mu = P.MU_SUN;

const t0 = P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12)));
const r0v = P.planetPosition("earth", t0);
const r1v = P.destinationPosition("saturn", t0 + 5772); // frozen geometry
const r0 = P.len(r0v), r1 = P.len(r1v);

function geometry() {
  const c = P.cross(r0v, r1v);
  const cn = P.len(c);
  const theta = Math.acos(P.dot(r0v, r1v) / (r0 * r1));
  const u1 = P.scl(r0v, 1 / r0);
  const nAxis = P.scl(c, 1 / cn);
  const u2short = P.cross(nAxis, u1);
  return { u1, theta, u2short, r0, r1 };
}

function tofForLam(e, p, lam, phi) {
  if (e <= 0 || p <= 0) return null;
  const a = p / (1 - e * e);
  const n = Math.sqrt(mu / a);
  function EfromNuu(nu) {
    const cosE = (e + Math.cos(nu)) / (1 + e * Math.cos(nu));
    let E = Math.acos(Math.min(1, Math.max(-1, cosE)));
    if (Math.sin(nu) < 0) E = TAU - E;
    return E;
  }
  const E0 = EfromNuu(lam);
  const E1 = EfromNuu(lam + phi);
  let dE = E1 - E0;
  // single-rev: sweep in direction of motion
  if (dE < 0) dE += TAU;
  const M0 = E0 - e * Math.sin(E0);
  const M1 = E1 - e * Math.sin(E1);
  let dM = M1 - M0;
  if (dM < 0) dM += TAU;
  return dM / n;
}

const g = geometry();
console.log(`r0=${r0.toFixed(4)} r1=${r1.toFixed(4)} theta=${(g.theta * 180 / Math.PI).toFixed(2)}deg`);

for (const [name, phi, u2sign] of [["short", g.theta, 1], ["long", TAU - g.theta, -1]]) {
  console.log(`\n=== ${name} arc (phi=${(phi * 180 / Math.PI).toFixed(1)}deg) ===`);
  let prev = null, lastDir = 0;
  let mono = true, minT = Infinity, maxT = -Infinity, argMin = 0, argMax = 0;
  for (let i = 0; i <= 720; i++) {
    const lam = (i / 720) * TAU;
    const c0 = Math.cos(lam), c1 = Math.cos(lam + phi);
    const den = r0 * c0 - r1 * c1;
    if (Math.abs(den) < 1e-9) continue;
    const e = (r1 - r0) / den;
    const p = r0 * (1 + e * c0);
    if (e <= 0 || p <= 0 || Math.abs(e - 1) < 1e-6) continue;
    const T = tofForLam(e, p, lam, phi);
    if (T === null || !isFinite(T) || T <= 0) continue;
    minT = Math.min(minT, T); maxT = Math.max(maxT, T);
    if (T < minT) { minT = T; argMin = lam; }
    if (T > maxT) { maxT = T; argMax = lam; }
    if (prev !== null) {
      const d = T - prev;
      if (Math.abs(d) > 1e-6) {
        const dir = d > 0 ? 1 : -1;
        if (lastDir !== 0 && dir !== lastDir) mono = false;
        lastDir = dir;
      }
    }
    prev = T;
    if (i % 60 === 0) console.log(`lam=${(lam * 180 / Math.PI).toFixed(1)}deg e=${e.toFixed(4)} p=${p.toFixed(4)} TOF=${T.toFixed(2)}d`);
  }
  console.log(`range TOF [${minT.toFixed(1)}, ${maxT === -Infinity ? "n/a" : maxT.toFixed(1)}]d min at ${(argMin * 180 / Math.PI).toFixed(1)}deg max at ${(argMax * 180 / Math.PI).toFixed(1)}deg monotonic=${mono}`);
}
