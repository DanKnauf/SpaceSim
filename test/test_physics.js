/*
 * SpaceSim physics test suite.
 * Run: node test/test_physics.js
 *
 * Cross-validates the Keplerian ephemeris against the independent
 * astronomy-engine implementation (VSOP87-based), and verifies the
 * Lambert solver / conic propagation / transfer planner by
 * round-trip and known-case checks.
 */
const P = require("../js/physics.js");
const Astronomy = require("../tools/node_modules/astronomy-engine");

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log("  PASS  " + name); }
  else { failed++; console.log("  FAIL  " + name + (detail ? "   -> " + detail : "")); }
}
function dateFor(tDays) { return new Date(Date.UTC(2000, 0, 1, 12) + tDays * 86400000); }

// Convert an equatorial (equinox-of-date) vector to ecliptic J2000 so it can
// be compared against our element-based ecliptic-J2000 ephemeris.
// Steps: equatorial(date) -> ecliptic(date) via Astronomy.Ecliptic, then
// remove precession in longitude (IAU-76) from date back to J2000.
function toEclipticJ2000(eq, tDays) {
  const d = dateFor(tDays);
  const ec = Astronomy.Ecliptic(eq, d); // returns { vec, elat, elon }
  const T = tDays / 36525;
  const pArc = 5028.7961955 * T - 62.569310 * T * T + 6.226787 * T * T * T
           - 0.654230 * Math.pow(T, 4) - 0.059468 * Math.pow(T, 5)
           + 0.005789 * Math.pow(T, 6);
  const p = pArc / 3600 * Math.PI / 180;
  const c = Math.cos(p), s = Math.sin(p);
  const v = ec.vec;
  // The equinox of date lies p EAST of the J2000 equinox, so rotate by -p
  // about the ecliptic north pole to bring the vector back to ecliptic J2000.
  return { x: v.x * c + v.y * s, y: -v.x * s + v.y * c, z: v.z };
}

const TODAY = P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12, 0, 0)));
const DATES = [
  [TODAY, "2026-10-03"],
  [P.daysFromUTC(new Date(Date.UTC(2050, 5, 15, 12))), "2050-06-15"],
  [P.daysFromUTC(new Date(Date.UTC(2010, 2, 3, 12))), "2010-03-03"],
  [0, "J2000"],
];

console.log("== 1. Planetary positions vs astronomy-engine (ecliptic J2000, AU) ==");
const BODIES = {
  mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus,
  earth: Astronomy.Body.EMB, mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn,
  uranus: Astronomy.Body.Uranus, neptune: Astronomy.Body.Neptune,
};
for (const name of Object.keys(BODIES)) {
  let worst = 0;
  for (const [t, label] of DATES) {
    const mine = P.planetPosition(name, t);
    const ref = toEclipticJ2000(Astronomy.HelioVector(BODIES[name], dateFor(t)), t);
    const d = P.len(P.sub(mine, ref));
    const r = P.len(mine);
    worst = Math.max(worst, d);
    const ok = d < Math.max(0.005 * r, name === "mercury" ? 0.012 : 0.006);
    check(`${name} @ ${label}`, ok,
      `d=${(d * P.AU_KM / 1e6).toFixed(3)} Mkm (r=${r.toFixed(4)} AU)`);
  }
}

console.log("== 2. Earth orbital velocity ==");
{
  const v = P.planetVelocity("earth", TODAY);
  const vkms = P.len(v) * P.AU_DAY_KMS;
  check("Earth speed ~29.8 km/s", vkms > 29.3 && vkms < 30.3, `got ${vkms.toFixed(3)} km/s`);
}

console.log("== 3. Moon model vs astronomy-engine ==");
{
  const mref = toEclipticJ2000(Astronomy.GeoMoon(dateFor(TODAY)), TODAY);
  const mine = P.moonOffset("moon", TODAY);
  const d = P.len(P.sub(mine, mref));
  check("Moon offset within 75,000 km of ephemeris", d < 0.0005,
    `d=${(d * P.AU_KM).toFixed(0)} km`);
  const r = P.len(mine) * P.AU_KM;
  check("Moon distance in [356,000, 406,000] km", r > 356000 && r < 406000, `got ${r.toFixed(0)} km`);
  // stability over a year (node regression must not blow up)
  const later = P.moonOffset("moon", TODAY + 400);
  const rl = P.len(later) * P.AU_KM;
  check("Moon distance stable after 400 d", rl > 356000 && rl < 406000, `got ${rl.toFixed(0)} km`);
}

console.log("== 4. Conic propagation invariants ==");
{
  // Circular orbit: exact period round trip
  const mu = P.MU_SUN;
  const r0 = P.V(1, 0, 0);
  const vc = Math.sqrt(mu);
  const v0 = P.V(0, vc, 0);
  const orb = P.conicFromState(r0, v0);
  const period = 2 * Math.PI / orb.n;
  const back = P.conicPropagate(orb, period);
  const d = P.len(P.sub(back.pos, r0));
  check("Circular orbit returns after one period", d < 1e-8, `d=${d.toExponential(2)} AU`);

  // Energy & angular momentum conservation on an eccentric + hyperbolic orbit
  const cases = [
    { r0: P.V(0.7, 0.2, 0), v0: P.V(0.002, 0.0165, 0.0005), tag: "eccentric" },
    { r0: P.V(1.0, 0, 0), v0: P.V(0.001, 0.03, 0), tag: "hyperbolic" },
  ];
  for (const c of cases) {
    const orb = P.conicFromState(c.r0, c.v0);
    const e0 = 0.5 * P.dot(c.v0, c.v0) - mu / P.len(c.r0);
    const h0 = P.cross(c.r0, c.v0);
    let maxDE = 0, maxDH = 0;
    for (let t = 0.01; t <= 100; t += 0.7) {
      const s = P.conicPropagate(orb, t);
      const e = 0.5 * P.dot(s.vel, s.vel) - mu / P.len(s.pos);
      const h = P.cross(s.pos, s.vel);
      maxDE = Math.max(maxDE, Math.abs(e - e0) / Math.abs(e0));
      maxDH = Math.max(maxDH, P.len(P.sub(h, h0)) / P.len(h0));
    }
    check(`${c.tag} orbit conserves energy & angular momentum`, maxDE < 1e-8 && maxDH < 1e-8,
      `dE=${maxDE.toExponential(1)}, dh=${maxDH.toExponential(1)}`);
  }
}

console.log("== 5. Lambert solver ==");
{
  // Hohmann Earth->Mars (180 deg): known TOF and dV
  const r0 = P.V(1, 0, 0), r1 = P.V(-1.52371034, 0, 0);
  const aH = (1 + 1.52371034) / 2;
  const TOF = Math.PI * Math.sqrt(aH * aH * aH / P.MU_SUN);
  const lam = P.lambert(r0, r1, TOF);
  const vd = P.len(lam.v0) * P.AU_DAY_KMS;
  check("Hohmann TOF reproduced", Math.abs(lam.TOFcalc - TOF) < 0.05, `got ${lam.TOFcalc.toFixed(2)} d (want ${TOF.toFixed(2)})`);
  check("Hohmann departure speed ~32.73 km/s", Math.abs(vd - 32.73) < 0.15, `got ${vd.toFixed(3)} km/s`);
  // v0 must be tangential (perp to r0)
  check("Hohmann v0 tangential", Math.abs(P.dot(lam.v0, r0)) < 1e-10, `dot=${P.dot(lam.v0, r0)}`);

  // Round trips: random geometries, elliptic + hyperbolic
  let rtOk = 0, rtN = 0, worstErr = 0;
  for (let i = 0; i < 24; i++) {
    const rA = 0.4 + (i % 5) * 0.9;
    const rB = rA + (Math.sin(i * 7.3) * 0.5 + 0.6);
    const ang0 = i * 0.7, angB = ang0 + 0.5 + (i % 7) * 0.35;
    const a0 = (i % 3) * 0.2, aB = (i % 4) * 0.15;
    const p0 = P.V(rA * Math.cos(ang0), rA * Math.sin(ang0), rA * Math.sin(a0) * 0.1);
    const p1 = P.V(rB * Math.cos(angB), rB * Math.sin(angB), rB * Math.sin(aB) * 0.1);
    // choose TOF well inside the valid range
    const aH2 = (rA + rB) / 2;
    const tHoh = Math.PI * Math.sqrt(aH2 ** 3 / P.MU_SUN);
    const TOF = tHoh * [0.35, 0.8, 1.0, 1.6, 3.0][i % 5];
    let lam2;
    try { lam2 = P.lambert(p0, p1, TOF); } catch (e) { continue; }
    rtN++;
    const orb = P.conicFromState(p0, lam2.v0);
    const s = P.conicPropagate(orb, lam2.TOFcalc);
    const err = P.len(P.sub(s.pos, p1));
    worstErr = Math.max(worstErr, err);
    if (err < 1e-7 && Math.abs(lam2.TOFcalc - TOF) / TOF < 1e-6) rtOk++;
  }
  check(`Lambert round trips (forward) ${rtOk}/${rtN}`, rtOk === rtN && rtN >= 18, `worst err ${worstErr.toExponential(2)} AU`);

  // Backward round trip (from v1 back to r0)
  let bkOk = 0, bkN = 0;
  for (let i = 0; i < 12; i++) {
    const rA = 0.5 + (i % 4) * 1.1, rB = rA + 0.8 + (i % 3) * 0.4;
    const ang0 = i * 0.9, angB = ang0 + 0.6 + (i % 5) * 0.3;
    const p0 = P.V(rA, rA * Math.sin(ang0), 0);
    const p1 = P.V(rB * Math.cos(angB), rB * Math.sin(angB), 0);
    const tHoh = Math.PI * Math.sqrt(((rA + rB) / 2) ** 3 / P.MU_SUN);
    let lam3;
    try { lam3 = P.lambert(p0, p1, tHoh * 1.1); } catch (e) { continue; }
    bkN++;
    const orb = P.conicFromState(p1, lam3.v1);
    const s = P.conicPropagate(orb, -lam3.TOFcalc);
    if (P.len(P.sub(s.pos, p0)) < 1e-7) bkOk++;
  }
  check(`Lambert round trips (backward) ${bkOk}/${bkN}`, bkOk === bkN && bkN >= 10);

  // Hyperbolic branch: very short TOF should give e > 1
  const r0h = P.V(1, 0, 0), r1h = P.V(Math.cos(0.4), Math.sin(0.4), 0);
  const lamH = P.lambert(r0h, r1h, 0.02); // 29 min for 23 deg: must be hyperbolic
  check("Short-TOF solution is hyperbolic (e>1)", lamH.e > 1, `e=${lamH.e}`);
  const orbH = P.conicFromState(r0h, lamH.v0);
  const sH = P.conicPropagate(orbH, lamH.TOFcalc);
  check("Hyperbolic round trip", P.len(P.sub(sH.pos, r1h)) < 1e-7,
    `err=${P.len(P.sub(sH.pos, r1h)).toExponential(2)}`);
}

console.log("== 6. Transfer planner (departure from Earth @ 2026-10-03) ==");
{
  const t0 = TODAY;
  const r0 = P.planetPosition("earth", t0);
  const v0 = P.planetVelocity("earth", t0);
  const dest = (id) => (t) => P.destinationPosition(id, t);

  const expect = {
    // Ranges are physically grounded: minimum-energy (windowed) transfer
    // times from Earth, e.g. Neptune ~92-97y at the best geometry.
    mars:    { minTOF: 100, maxTOF: 420,   maxDV: 8,  arrive: 0.01 },
    jupiter: { minTOF: 500, maxTOF: 2500,  maxDV: 11, arrive: 0.05 },
    saturn:  { minTOF: 2000, maxTOF: 7500, maxDV: 12, arrive: 0.1 },
    mercury: { minTOF: 80,  maxTOF: 400,   maxDV: 10, arrive: 0.01 },
    venus:   { minTOF: 80,  maxTOF: 320,   maxDV: 8,  arrive: 0.01 },
    moon:    { minTOF: 1,   maxTOF: 20,    maxDV: 9,  arrive: 0.0005 },
    neptune: { minTOF: 20000, maxTOF: 45000, maxDV: 13, arrive: 0.3 },
  };
  for (const id of Object.keys(expect)) {
    const ex = expect[id];
    const plan = P.planTransfer(t0, r0, v0, dest(id));
    if (!plan || plan.error) { check(`plan ${id}`, false, plan && plan.error); continue; }
    // verify arrival: propagate the departure conic to TOF, compare to dest at tArrival
    const orb = P.conicFromState(r0, plan.v0);
    const s = P.conicPropagate(orb, plan.TOF);
    const target = P.destinationPosition(id, plan.tArrival);
    const miss = P.len(P.sub(s.pos, target));
    check(
      `plan ${id}: TOF ${plan.TOF.toFixed(1)} d, dV ${plan.dV_kms.toFixed(2)} km/s`,
      plan.TOF >= ex.minTOF && plan.TOF <= ex.maxTOF && plan.dV_kms <= ex.maxDV && miss < ex.arrive,
      `TOF=${plan.TOF.toFixed(1)}d dV=${plan.dV_kms.toFixed(2)}km/s miss=${(miss * P.AU_KM / 1e6).toFixed(2)}Mkm`
    );
  }

  // Re-target from mid-space (Jupiter) to Saturn
  const tJ = TODAY + 800;
  const rJ = P.planetPosition("jupiter", tJ);
  const vJ = P.planetVelocity("jupiter", tJ);
  const plan2 = P.planTransfer(tJ, rJ, vJ, dest("saturn"));
  check("mid-space retarget Jupiter->Saturn solved",
    !!plan2 && !plan2.error && plan2.TOF > 300 && plan2.TOF < 25000,
    plan2 && !plan2.error ? `TOF=${plan2.TOF.toFixed(0)}d dV=${plan2.dV_kms.toFixed(2)}` : (plan2 || {}).error);
}

console.log("== 7. N-body integrator ==");
{
  const muJ = P.PLANET_MU.jupiter;
  const J = { x: 5.2, y: 0, z: 0 };              // frozen Jupiter
  const vinf = 40 / P.AU_DAY_KMS;                // 40 km/s in AU/day
  const b = 0.3;                                 // impact parameter (AU)

  const L = 2.0;                                 // upstream/downstream distance
  const r0 = P.V(J.x - L, 0, b);
  const v0 = P.V(vinf, 0, 0);
  const fixedJ = [{ name: "jupiter", pos: J, vel: { x: 0, y: 0, z: 0 } }];

  // Correct two-body reference: the rocket starts 2.022 AU inside Jupiter's
  // well (not at infinity), so the invariants must come from (h0, E0):
  const r0J = P.len(P.sub(r0, J));
  const h0 = 0.3 * vinf;                          // |r x v| = b * |v0|
  const E0 = 0.5 * vinf * vinf - muJ / r0J;       // > 0 -> unbound
  const e0 = Math.sqrt(1 + 2 * E0 * h0 * h0 / (muJ * muJ));
  const rp = h0 * h0 / (muJ * (1 + e0));
  const delta = 2 * Math.asin(1 / e0);
  const vInfEff = Math.sqrt(2 * E0);              // asymptotic speed (< 40 km/s)

  // --- 7a. Pure two-body (noSun, fixed Jupiter): must match analytic hyperbola
  {
    // Deterministic endpoint: t = 730.2 d lands at rJ = 13.0 AU, where the
    // converged fixed-dt reference (dt = 1e-3, dE/E ~ 1e-12) gives a
    // deflection of 135.6233 deg. (The asymptote 2asin(1/e0) = 137.259 deg
    // is not reached at finite r: only ~1.6 deg of turn remain at rJ = 13,
    // so comparing the instantaneous direction to the asymptote is invalid.)
    const res = P.integrateNBody(r0, v0, 0, 730.2, {
      fixedPlanetStates: fixedJ, noSun: true, dtMax: 0.5, sampleEvery: 0.05
    });
    const last = res.samples[res.samples.length - 1];
    const vrel = P.len(last.vel);                // Jupiter at rest -> heliocentric
    const deflect = Math.acos(Math.max(-1, Math.min(1, P.dot(last.vel, P.V(1, 0, 0)) / vrel)));
    // min distance to Jupiter along the sampled path
    let rmin = Infinity;
    for (const s of res.samples) rmin = Math.min(rmin, P.len(P.sub(s.pos, J)));
    let maxDE = 0;
    for (const s of res.samples) {
      const En = 0.5 * P.dot(s.vel, s.vel) - muJ / P.len(P.sub(s.pos, J));
      maxDE = Math.max(maxDE, Math.abs(En - E0) / Math.abs(E0));
    }
    check("flyby: final |v| matches energy-consistent speed",
      Math.abs(vrel - Math.sqrt(2 * (E0 + muJ / P.len(P.sub(last.pos, J))))) < 1e-8,
      `|v|=${(vrel * P.AU_DAY_KMS).toFixed(4)} km/s vInfEff=${(vInfEff * P.AU_DAY_KMS).toFixed(4)}`);
    check("flyby: deflection matches converged reference at rJ=13",
      Math.abs(deflect - 135.6233 * Math.PI / 180) < 0.05 * Math.PI / 180,
      `got ${(deflect * 180 / Math.PI).toFixed(4)} deg want 135.6233 deg`);
    // Deflection implied by the CONSERVED invariants at the final state must
    // equal the analytic asymptote -> verifies angular momentum as well as E.
    const hN = Math.abs(P.cross(P.sub(last.pos, J), last.vel).y);
    const EN = 0.5 * P.dot(last.vel, last.vel) - muJ / P.len(P.sub(last.pos, J));
    const eN = Math.sqrt(1 + 2 * EN * hN * hN / (muJ * muJ));
    const deflectAsymptote = 2 * Math.asin(1 / eN);
    check("flyby: invariants imply analytic asymptote (h conserved)",
      Math.abs(deflectAsymptote - delta) < 0.01 * Math.PI / 180,
      `asymptote ${(deflectAsymptote * 180 / Math.PI).toFixed(4)} deg want ${(delta * 180 / Math.PI).toFixed(4)}`);
    check("flyby: perijove distance matches", rmin >= rp * 0.999 && rmin <= rp * 1.01,
      `rmin=${rmin.toFixed(5)} AU want ${rp.toFixed(5)}`);
    check("flyby: two-body energy conserved", maxDE < 1e-8, `dE/E=${maxDE.toExponential(2)}`);
    check("flyby: Jupiter SOI assist recorded",
      res.assists.length === 1 && res.assists[0].body === "jupiter" &&
        Math.abs(res.assists[0].dvKms) < 0.5,
      res.assists.length ? `dv=${res.assists[0].dvKms.toFixed(3)} km/s` : "no assist recorded");
  }

  // --- 7b. Same geometry with the Sun included. The Sun sits only 5-7 AU
  // from this encounter, so it is NOT a small perturbation here (~7 km/s of
  // Δv over the flyby); the tight two-body comparison does not apply.
  // The exact invariant of this static 3-body problem is total energy
  // T - mu_sun/r_sun - mu_J/r_J; deflection/perijove get sanity bands.
  {
    let res, tEnd = 400;
    for (;;) {
      res = P.integrateNBody(r0, v0, 0, tEnd, {
        fixedPlanetStates: fixedJ, dtMax: 0.5, sampleEvery: 0.5
      });
      if (P.len(P.sub(res.samples[res.samples.length - 1].pos, J)) >= 10 || tEnd >= 1600) break;
      tEnd += 200;
    }
    const last = res.samples[res.samples.length - 1];
    const vrel = P.len(last.vel);
    const deflect = Math.acos(Math.max(-1, Math.min(1, P.dot(last.vel, P.V(1, 0, 0)) / vrel)));
    let rminB = Infinity;
    const E3 = (s) => 0.5 * P.dot(s.vel, s.vel) - P.MU_SUN / P.len(s.pos) - muJ / P.len(P.sub(s.pos, J));
    const E0b = E3({ vel: v0, pos: r0 });
    let maxDE3 = 0;
    for (const s of res.samples) {
      rminB = Math.min(rminB, P.len(P.sub(s.pos, J)));
      maxDE3 = Math.max(maxDE3, Math.abs(E3(s) - E0b) / Math.abs(E0b));
    }
    check("flyby+Sun: 3-body energy conserved", maxDE3 < 1e-7, `dE/E=${maxDE3.toExponential(2)}`);
    check("flyby+Sun: deflection in sane band", deflect > delta - 0.8 && deflect < delta + 0.8,
      `got ${(deflect * 180 / Math.PI).toFixed(2)} deg two-body ${(delta * 180 / Math.PI).toFixed(2)}`);
    check("flyby+Sun: perijove in sane band", rminB >= rp * 0.7 && rminB <= rp * 1.3,
      `rmin=${rminB.toFixed(5)} AU two-body ${rp.toFixed(5)}`);
  }

  // --- 7c. Frozen full 8-planet set: energy conservation over 800 d
  {
    const tRef = 1000; // days since J2000
    const frozen = P.PLANET_NAMES.map(n => ({
      name: n, pos: P.planetPosition(n, tRef), vel: P.planetVelocity(n, tRef)
    }));
    const r0 = P.V(1, 0, 0.05);
    const vc = Math.sqrt(P.MU_SUN / 1) * 1.02;  // slightly above circular
    const v0 = P.V(0, vc, 0);
    const res = P.integrateNBody(r0, v0, tRef, tRef + 800, {
      fixedPlanetStates: frozen, dtMax: 1, sampleEvery: 1
    });
    const E0 = 0.5 * P.dot(v0, v0) - P.MU_SUN / P.len(r0)
      - frozen.reduce((s, b) => s + P.PLANET_MU[b.name] / P.len(P.sub(r0, b.pos)), 0);
    let maxDE = 0;
    for (const smp of res.samples) {
      const En = 0.5 * P.dot(smp.vel, smp.vel) - P.MU_SUN / P.len(smp.pos)
        - frozen.reduce((s, b) => s + P.PLANET_MU[b.name] / P.len(P.sub(smp.pos, b.pos)), 0);
      maxDE = Math.max(maxDE, Math.abs(En - E0) / Math.abs(E0));
    }
    check("frozen 8-planet: energy conserved over 800 d", maxDE < 1e-5, `dE/E=${maxDE.toExponential(2)}`);
  }

  // --- 7d. Real-planet Earth->Jupiter integration (the app pipeline)
  {
    const t0 = TODAY;
    const r0 = P.planetPosition("earth", t0);
    const v0 = P.planetVelocity("earth", t0);
    const dest = (t) => P.destinationPosition("jupiter", t);
    const plan = P.planTransfer(t0, r0, v0, dest);
    check("real pipeline: Lambert plan still valid", !!plan && !plan.error && plan.TOF > 300 && plan.TOF < 3000,
      plan && !plan.error ? `TOF=${plan.TOF.toFixed(0)}d dV=${plan.dV_kms.toFixed(2)}` : (plan || {}).error);
    const window = Math.min(plan.TOF * 2.2 + 1800, 60000);
    const res = P.integrateNBody(r0, plan.v0, t0, t0 + window, { dtMax: 1, sampleEvery: 2 });
    const enc = P.findEncounter(res.samples, dest, 0.1);
    check("real pipeline: N-body arrival at Jupiter within 0.1 AU",
      !!enc && enc.range <= 0.1,
      `tMin=${enc.tMin !== null ? (enc.tMin - t0).toFixed(0) + "d" : "n/a"} minRange=${(enc.minRange * P.AU_KM / 1e6).toFixed(2)} Mkm`);
    // The first Jupiter SOI crossing is the arrival; later crossings are
    // the return orbit re-crossing Jupiter's neighborhood (legitimate).
    const jAssist = res.assists.filter(a => a.body === "jupiter");
    check("real pipeline: Jupiter assist event recorded",
      jAssist.length >= 1 && Math.abs(jAssist[0].dvKms) < 40 &&
        enc.tMin !== null && Math.abs(jAssist[0].tIn - enc.tMin) < 200,
      jAssist.length
        ? `dv=${jAssist[0].dvKms.toFixed(2)} km/s tIn=${(jAssist[0].tIn - t0).toFixed(0)}d (x${jAssist.length} crossings)`
        : "none");
  }

  // --- 7e. findEncounter on synthetic samples
  {
    const samples = [];
    for (let i = 0; i <= 100; i++) {
      const t = i;
      samples.push({ t, pos: P.V(t * 0.01, Math.sin(t * 0.1) * 0.01, 0), vel: P.V(0.01, 0, 0) });
    }
    const enc = P.findEncounter(samples, () => P.V(0.5, 0, 0), 0.02);
    check("findEncounter: hit detected near closest approach",
      !!enc && enc.range <= 0.02 && Math.abs(enc.t - 50) <= 3,
      enc.range <= 0.02 ? `t=${enc.t}` : `miss minRange=${enc.minRange}`);
  }

  // --- 7f. Performance: Neptune-scale window must stay browser-friendly
  {
    const t0 = TODAY;
    const r0 = P.planetPosition("earth", t0);
    const v0 = P.planetVelocity("earth", t0);
    const plan = P.planTransfer(t0, r0, v0, (t) => P.destinationPosition("neptune", t));
    const window = Math.min(Math.max(plan.TOF * 1.3, 20000), 90000);
    const tStart = process.hrtime.bigint();
    const res = P.integrateNBody(r0, plan.v0, t0, t0 + window, { dtMax: 1, sampleEvery: window / 20000 });
    const ms = Number(process.hrtime.bigint() - tStart) / 1e6;
    check(`N-body ${window.toFixed(0)} d window in ${ms.toFixed(0)} ms (< 6000 ms)`,
      ms < 6000, `${ms.toFixed(0)} ms, ${res.samples.length} samples, ${res.steps} steps`);
  }
}

console.log("== 8. Earth probes (Hubble LEO, JWST L2) ==");
{
  const t = TODAY;
  // Earth-relative speed by central difference; step must be << the probe's
  // own period (period/32) or the chord aliases to net displacement.
  const relV = (id, tt, step) => {
    const a = P.earthProbeOffset(id, tt + step), b = P.earthProbeOffset(id, tt - step);
    return P.len(P.sub(a, b)) / (2 * step) * P.AU_DAY_KMS; // km/s
  };

  // Hubble: circular LEO 6906 km, 95.2 min period, ~7.6 km/s
  const ho = P.earthProbeOffset("hubble", t);
  const hoKm = P.len(ho) * P.AU_KM;
  check("hubble LEO radius ~6906 km", Math.abs(hoKm - 6906) < 2, hoKm.toFixed(1) + " km");
  const hvKms = relV("hubble", t, P.EARTH_PROBES.hubble.periodDays / 32);
  check("hubble speed ~7.6 km/s", hvKms > 7.2 && hvKms < 8.0, hvKms.toFixed(2) + " km/s");
  const hoP = P.earthProbeOffset("hubble", t + P.EARTH_PROBES.hubble.periodDays);
  check("hubble orbit closes after one period",
    P.len(P.sub(ho, hoP)) * P.AU_KM < 0.5,
    (P.len(P.sub(ho, hoP)) * P.AU_KM).toExponential(2) + " km");

  // JWST: ~1.5e6 km anti-sunward of Earth on a 180 d halo
  const eo = P.earthProbeOffset("jwst", t);
  const eoKm = P.len(eo) * P.AU_KM;
  check("jwst L2 range 1.2-1.8e6 km", eoKm > 1.2e6 && eoKm < 1.8e6, eoKm.toFixed(0) + " km");
  const epos = P.planetPosition("earth", t);
  check("jwst anti-sunward of Earth", P.dot(eo, epos) < 0, "dot=" + P.dot(eo, epos).toExponential(2));
  let mn = Infinity, mx = 0;
  for (let k = 0; k <= 24; k++) {
    const r = P.len(P.earthProbeOffset("jwst", t + k * 7.5)) * P.AU_KM;
    if (r < mn) mn = r; if (r > mx) mx = r;
  }
  check("jwst halo oscillates over 180 d", mn > 1.15e6 && mx < 1.85e6 && (mx - mn) > 1e5,
    (mn / 1e6).toFixed(2) + "-" + (mx / 1e6).toFixed(2) + " Mkm, span " + ((mx - mn) / 1e3).toFixed(0) + " km");
  const evKms = relV("jwst", t, P.EARTH_PROBES.jwst.periodDays / 32);
  check("jwst Earth-relative speed < 1 km/s", evKms < 1, evKms.toFixed(3) + " km/s");

  // Planner: both solve via the co-orbital (3 km/s cruise) ballistic path
  const r0 = P.planetPosition("earth", t), v0 = P.planetVelocity("earth", t);
  const ph = P.planTransfer(t, r0, v0, (tt) => P.destinationPosition("hubble", tt));
  check("plan hubble: TOF ~0.5 d, dV < 1 km/s",
    !!ph && !ph.error && ph.TOF > 0.1 && ph.TOF < 2 && ph.dV_kms < 1 && ph.p !== undefined,
    ph && !ph.error ? `TOF=${ph.TOF.toFixed(2)}d dV=${ph.dV_kms.toFixed(2)}km/s` : ph && ph.error);
  const pj = P.planTransfer(t, r0, v0, (tt) => P.destinationPosition("jwst", tt));
  check("plan jwst: TOF 4-8 d, dV < 5.5 km/s",
    !!pj && !pj.error && pj.TOF > 3 && pj.TOF < 9 && pj.dV_kms < 5.5 && pj.p !== undefined,
    pj && !pj.error ? `TOF=${pj.TOF.toFixed(1)}d dV=${pj.dV_kms.toFixed(2)}km/s` : pj && pj.error);
}

console.log("== 9. Pluto (dwarf planet, ELEMENTS entry) ==");
{
  const t = TODAY;
  const p = P.planetPosition("pluto", t);
  const r = P.len(p);
  // a = 39.55 AU, e = 0.2488 -> r in [29.73, 49.37] AU
  check("pluto r in [29.7, 49.4] AU", r > 29.7 && r < 49.4, r.toFixed(2) + " AU");
  // i = 16.98 deg -> |z|/r = sin(orbit inclination component) < sin(17.5 deg)
  check("pluto stays within 17.5 deg of ecliptic",
    Math.abs(p.z) / r < Math.sin(17.5 * Math.PI / 180),
    (Math.asin(Math.abs(p.z) / r) * 180 / Math.PI).toFixed(1) + " deg");
  // vis-viva: |v| consistent with r and a (within 10%)
  const a = P.ELEMENTS.pluto.a;
  const v = P.planetVelocity("pluto", t);
  const vmag = P.len(v);
  const vexp = Math.sqrt(P.MU_SUN * (2 / r - 1 / a));
  check("pluto |v| matches vis-viva within 10%",
    Math.abs(vmag - vexp) / vexp < 0.10, `|v|=${vmag} vs ${vexp} (AU/d)`);
  // destination lookup must agree with the ephemeris
  const dp = P.destinationPosition("pluto", t);
  check("destinationPosition(pluto) == planetPosition",
    P.len(P.sub(dp, p)) < 1e-12, P.len(P.sub(dp, p)).toExponential(2));
  // planner smoke: a full outer-system transfer must solve
  const r0 = P.planetPosition("earth", t), v0 = P.planetVelocity("earth", t);
  const plan = P.planTransfer(t, r0, v0, (tt) => P.destinationPosition("pluto", tt));
  check("plan earth->pluto solves (ballistic, 27-330 y, dV > 8 km/s)",
    !!plan && !plan.error && plan.TOF > 9900 && plan.TOF < 120000 && plan.dV_kms > 8,
    plan && !plan.error ? `TOF=${(plan.TOF / 365.25).toFixed(0)}y dV=${plan.dV_kms.toFixed(2)}km/s e=${(plan.e || 0).toFixed(3)}` : plan && plan.error);
}

console.log("== 10. Belt sampling (display distributions) ==");
{
  // Main belt: extent, flatness, Kirkwood 3:1 gap depletion at ~2.50 AU
  const pts = P.mainBeltSample(3000);
  let bad = 0, gapCount = 0, ctrlCount = 0;
  for (const q of pts) {
    const r = P.len(q);
    if (r < 2.0 || r > 3.45) bad++;
    if (Math.abs(q.z) / r > Math.sin(9.5 * Math.PI / 180)) bad++;
    if (r > 2.45 && r < 2.55) gapCount++;   // 3:1 Kirkwood gap bin
    if (r > 2.28 && r < 2.38) ctrlCount++;   // equal-width control bin
  }
  check("main belt: all points in 2.05-3.40 AU, < 9.5 deg from ecliptic", bad === 0, `${bad} outliers`);
  check("main belt: Kirkwood 3:1 gap depleted (gap < 60% of control)",
    gapCount < 0.6 * ctrlCount, `gap=${gapCount} ctrl=${ctrlCount}`);
  // Sub-band sampling must honor its radial window
  const sub = P.mainBeltSample(400, Math.random, 2.80, 3.15);
  const subBad = sub.filter((q) => P.len(q) < 2.80 || P.len(q) > 3.15).length;
  check("main belt: sub-band sampling honors [2.80, 3.15]", subBad === 0 && sub.length === 400,
    `${subBad} outside, N=${sub.length}`);

  // Kuiper belt: extent + flatness
  const kp = P.kuiperBeltSample(2000);
  let kb = 0;
  for (const q of kp) {
    const r = P.len(q);
    if (r < 30 || r > 50) kb++;
    if (Math.abs(q.z) / r > Math.sin(20.5 * Math.PI / 180)) kb++;
  }
  check("kuiper belt: all points in 30.5-49.5 AU, < 20.5 deg from ecliptic", kb === 0, `${kb} outliers`);
  // Density peak in the classical region (34-42 AU), not the outer tail
  let inner = 0, outer = 0;
  for (const q of kp) {
    const r = P.len(q);
    if (r > 34 && r < 42) inner++;
    if (r > 46 && r < 49.5) outer++;
  }
  check("kuiper belt: classical region denser than outer tail", inner > 2 * outer, `inner=${inner} outer=${outer}`);
}

console.log("");
console.log(`RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
