const P = require("../js/physics.js");
const mu = P.MU_SUN;

// Test's hyperbolic case
const r0 = P.V(1.0, 0, 0), v0 = P.V(0.001, 0.03, 0);
const orb = P.conicFromState(r0, v0);
console.log("orbit:", JSON.stringify({ a: orb.a, e: orb.e, type: orb.type, M0: orb.M0, n: orb.n }));
console.log("P:", orb.P, "Q:", orb.Q);

const e0 = 0.5 * P.dot(v0, v0) - mu / P.len(r0);
const h0 = P.cross(r0, v0);
for (const dt of [0.01, 0.1, 1, 10, 100]) {
  const s = P.conicPropagate(orb, dt);
  const e = 0.5 * P.dot(s.vel, s.vel) - mu / P.len(s.pos);
  const h = P.cross(s.pos, s.vel);
  // numerical derivative check: finite difference of position
  const s2 = P.conicPropagate(orb, dt + 1e-5);
  const vfd = P.scl(P.sub(s2.pos, s.pos), 1e-5);
  console.log(`dt=${dt}: pos=(${s.pos.x.toFixed(6)},${s.pos.y.toFixed(6)}) vel=(${s.vel.x.toFixed(6)},${s.vel.y.toFixed(6)}) dE=${((e - e0) / e0).toExponential(2)} dh=${(P.len(P.sub(h, h0)) / P.len(h0)).toExponential(2)} velFD=(${vfd.x.toFixed(6)},${vfd.y.toFixed(6)})`);
}
// initial velocity from propagate at dt->0
const s0 = P.conicPropagate(orb, 1e-8);
console.log("v(0) from propagate:", s0.vel, "expected v0:", v0);
