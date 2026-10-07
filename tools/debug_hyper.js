const P = require("../js/physics.js");
const V = P.V;

const mu = P.MU_SUN;
console.log("MU_SUN =", mu, "AU^3/day^2");

// Test 1: direct Kepler hyperbolic solver check.
// f(H) = H - e sinhH - M must be ~0.
function rawSolve(M, e) {
  // reference: bisection over H in [-60, 60] (f monotone decreasing in H)
  let lo = -60, hi = 60;
  const f = (H) => H - e * Math.sinh(H) - M;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
// physics.js solver is not exported; replicate via conic round-trip instead.

// Test 2: the actual test case.
const r0 = V(1.0, 0, 0), v0 = V(0.001, 0.03, 0);
const orb = P.conicFromState(r0, v0);
console.log("orbit:", { a: orb.a, e: orb.e, type: orb.type, n: orb.n, M0: orb.M0 });
const e0 = 0.5 * P.dot(v0, v0) - mu / P.len(r0);
const h0 = P.cross(r0, v0);
console.log("E0 =", e0, "h0 =", P.len(h0));

let maxDE = 0, maxDH = 0, worst = null;
for (let t = 0.01; t <= 100; t += 0.7) {
  const s = P.conicPropagate(orb, t);
  const r = P.len(s.pos);
  const e = 0.5 * P.dot(s.vel, s.vel) - mu / r;
  const h = P.cross(s.pos, s.vel);
  const dE = Math.abs(e - e0) / Math.abs(e0);
  const dH = P.len(P.sub(h, h0)) / P.len(h0);
  if (dE > maxDE) { maxDE = dE; worst = { t, e, dE, pos: s.pos, r }; }
  maxDH = Math.max(maxDH, dH);
}
console.log("max dE =", maxDE, "max dh =", maxDH, "worst at", worst);

// Test 3: where is periapsis? r_p = a(1-e) (a<0) -> a(1-e) > 0? a(1-e), a<0, (1-e)<0 -> positive.
const rp = orb.a * (1 - orb.e);
console.log("pericenter distance =", rp, "AU;  r0 =", P.len(r0));

// Test 4: check the state at several times against a brute-force RK4 integration.
function rk4(r, v, dt) {
  const acc = (rr) => P.scl(rr, -mu / (P.len(rr) ** 3));
  const k1r = v, k1v = acc(r);
  const r2 = P.add(r, P.scl(v, dt / 2)), v2 = P.add(v, P.scl(k1v, dt / 2));
  const k2r = v2, k2v = acc(r2);
  const r3 = P.add(r, P.scl(k2r, dt / 2)), v3 = P.add(v, P.scl(k2v, dt / 2));
  const k3r = v3, k3v = acc(r3);
  const r4 = P.add(r, P.scl(k3r, dt)), v4 = P.add(v, P.scl(k3v, dt));
  const k4r = v4, k4v = acc(r4);
  return {
    r: P.add(r, P.scl(P.add(P.add(k1r, P.scl(P.add(k2r, k3r), 2)), k4r), dt / 6)),
    v: P.add(v, P.scl(P.add(P.add(k1v, P.scl(P.add(k2v, k3v), 2)), k4v), dt / 6))
  };
}
let rr = r0, vv = v0;
const h = 0.001;
const N = Math.ceil(20 / h);
for (let i = 0; i < N; i++) { const nx = rk4(rr, vv, h); rr = nx.r; vv = nx.v; }
const s20 = P.conicPropagate(orb, 20);
console.log("RK4 @20d  pos =", rr, "vel =", vv);
console.log("conic @20d pos =", s20.pos, "vel =", s20.vel);
console.log("diff =", P.len(P.sub(rr, s20.pos)));
