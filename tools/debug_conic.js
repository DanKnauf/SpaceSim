// Debug: conicFromState / conicPropagate invariants + Lambert round trip
const P = require("../js/physics.js");
const mu = P.MU_SUN;

function rep(name, cond, extra) {
  console.log((cond ? "  PASS " : "  FAIL ") + name + (extra ? "   -> " + extra : ""));
}

// 1. dt = 0 must reproduce the initial state exactly
{
  const r0 = P.V(0.7, 0.2, 0), v0 = P.V(0.002, 0.0165, 0.0005);
  const orb = P.conicFromState(r0, v0);
  const s = P.conicPropagate(orb, 0);
  const dr = P.len(P.sub(s.pos, r0)), dv = P.len(P.sub(s.vel, v0));
  rep("dt=0 reproduces r0,v0", dr < 1e-12 && dv < 1e-12,
    `dr=${dr.toExponential(2)} dv=${dv.toExponential(2)} a=${orb.a} e=${orb.e} type=${orb.type} M0=${orb.M0}`);
  // also check the perifocal coords
  const X0 = P.dot(r0, orb.P), Y0 = P.dot(r0, orb.Q);
  console.log(`    X0=${X0} Y0=${Y0} | from E: X=${orb.a * (Math.cos(orb.M0) - 0)} `);
  // energy
  const e0 = 0.5 * P.dot(v0, v0) - mu / P.len(r0);
  console.log(`    a(energy)=${(1 / (2 / P.len(r0) - P.dot(v0, v0) / mu)).toFixed(6)} E=${e0.toExponential(4)}`);
  for (const dt of [0.5, 2, 10, 50, 100, 150, 200]) {
    const st = P.conicPropagate(orb, dt);
    const e = 0.5 * P.dot(st.vel, st.vel) - mu / P.len(st.pos);
    const h = P.cross(st.pos, st.vel);
    const h0 = P.cross(r0, v0);
    rep(`dt=${dt} energy/h conserved`,
      Math.abs(e - e0) / Math.abs(e0) < 1e-8 && P.len(P.sub(h, h0)) / P.len(h0) < 1e-8,
      `dE=${(Math.abs(e - e0) / Math.abs(e0)).toExponential(2)} dh=${(P.len(P.sub(h, h0)) / P.len(h0)).toExponential(2)} M=${(orb.M0 + orb.n * dt).toFixed(3)}`);
  }
}

// 2. simple circular orbit in tilted plane
{
  const r0 = P.V(0.5, -0.3, 0.2);
  const n = P.unit(P.V(0.3, 0.5, 1));
  const v0 = P.scl(P.cross(n, r0), Math.sqrt(mu / 0.5));
  const orb = P.conicFromState(r0, v0);
  const period = 2 * Math.PI / orb.n;
  const back = P.conicPropagate(orb, period);
  rep("tilted circle period round trip", P.len(P.sub(back.pos, r0)) < 1e-9,
    `d=${P.len(P.sub(back.pos, r0)).toExponential(2)} e=${orb.e.toExponential(2)}`);
}

// 3. hyperbolic from state
{
  const r0 = P.V(1, 0, 0), v0 = P.V(0.001, 0.03, 0);
  const orb = P.conicFromState(r0, v0);
  const a = 1 / (2 / P.len(r0) - P.dot(v0, v0) / mu);
  rep("hyperbolic classification", orb.type === "hyperbola" || orb.type === "ellipse",
    `a=${a} (energy says ${a > 0 ? "ellipse" : "hyperbola"}) got=${orb.type} e=${orb.e}`);
  const e0 = 0.5 * P.dot(v0, v0) - mu / P.len(r0);
  const h0 = P.cross(r0, v0);
  let ok = true, worst = 0;
  for (let t = 0.01; t <= 100; t += 0.7) {
    const s = P.conicPropagate(orb, t);
    const e = 0.5 * P.dot(s.vel, s.vel) - mu / P.len(s.pos);
    const h = P.cross(s.pos, s.vel);
    worst = Math.max(worst, Math.abs(e - e0) / Math.abs(e0));
    if (Math.abs(e - e0) / Math.abs(e0) > 1e-8) ok = false;
  }
  rep("hyperbolic invariants", ok, `worst dE=${worst.toExponential(2)}`);
}

// 4. Lambert round trip on a known-good geometry, print intermediates
{
  const p0 = P.V(1, 0.2, 0.05), p1 = P.V(-0.8, 0.5, 0.03);
  const rA = P.len(p0), rB = P.len(p1);
  const tHoh = Math.PI * Math.sqrt(Math.pow((rA + rB) / 2, 3) / mu);
  const TOF = tHoh;
  const lam = P.lambert(p0, p1, TOF);
  console.log(`    TOF=${TOF.toFixed(4)} TOFcalc=${lam.TOFcalc.toFixed(6)} e=${lam.e} p=${lam.p}`);
  // check v0 geometry: does the conic through (p0, v0) pass p1 at TOF?
  const orb = P.conicFromState(p0, lam.v0);
  const s = P.conicPropagate(orb, lam.TOFcalc);
  console.log(`    p1=${JSON.stringify(p1)}`);
  console.log(`    pos@TOF=${JSON.stringify(s.pos)} err=${P.len(P.sub(s.pos, p1)).toExponential(3)}`);
  // what velocity WOULD hit p1? sanity: compare with v from energy
  const v1c = P.len(lam.v1);
  console.log(`    |v0|=${P.len(lam.v0).toFixed(6)} |v1|=${v1c.toFixed(6)}`);
}
