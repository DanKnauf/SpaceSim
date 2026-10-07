/*
 * SpaceSim physics core — pure JavaScript, zero dependencies.
 *
 * Units: distances in AU, times in days, velocities in AU/day
 *        (convert to km/s with AU_DAY_KMS when displaying).
 *
 * Reference frame: heliocentric ecliptic J2000 (x toward vernal equinox,
 * z toward ecliptic north). Planets propagated from JPL Keplerian elements
 * (Standish, valid 1800-2050). Transfer trajectories solved with a
 * conic-parameter Lambert formulation (elementary functions, robust for
 * elliptic / parabolic / hyperbolic solutions).
 *
 * Browser: window.SpacePhysics   |   Node: module.exports
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SpacePhysics = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ------------------------------------------------------------------
  // Constants
  // ------------------------------------------------------------------
  var AU_KM = 149597870.7;              // 1 AU in km
  var DAY_S = 86400;                    // seconds per day
  var MU_SUN = 2.959122082855911e-4;    // GM_sun in AU^3/day^2
  var AU_DAY_KMS = AU_KM / DAY_S;       // 1 AU/day in km/s (~1731.457)
  var J2000_JD = 2451545.0;
  var DEG = Math.PI / 180;
  var TAU = Math.PI * 2;

  // ------------------------------------------------------------------
  // Vector helpers (plain objects {x,y,z})
  // ------------------------------------------------------------------
  function V(x, y, z) { return { x: x, y: y, z: z || 0 }; }
  function add(a, b)  { return V(a.x + b.x, a.y + b.y, a.z + b.z); }
  function sub(a, b)  { return V(a.x - b.x, a.y - b.y, a.z - b.z); }
  function scl(a, s)  { return V(a.x * s, a.y * s, a.z * s); }
  function dot(a, b)  { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) {
    return V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  function len(a)  { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a) || 1; return scl(a, 1 / l); }

  // ------------------------------------------------------------------
  // Keplerian elements. Planets: JPL (Standish, "Keplerian Elements for
  // Approximate Positions of the Major Planets", 1800-2050 AD).
  // Pluto + comets: derived from JPL Horizons heliocentric ecliptic-J2000
  // state vectors (CENTER=500@10) at the 2026-10-03 sim epoch; a,e,i,O,wbar
  // rates fitted over 2010-2050 (osculating-element drift), dL is the
  // dynamical mean motion. Accurate ~2000-2060 (see physics_test.cjs,
  // which checks against independent Horizons vectors at 2010/2026/2035/2050).
  // Epoch J2000.0; rates per Julian century (36525 days).
  //   a  semi-major axis (AU)        e  eccentricity
  //   i  inclination (deg)           L  mean longitude (deg)
  //   wbar longitude of perihelion (deg)
  //   O  longitude of ascending node (deg)
  // ------------------------------------------------------------------
  var ELEMENTS = {
    mercury: { a: 0.38709927, e: 0.20563593, i: 7.00497902, L: 252.25032350, wbar: 77.45779628,  O: 48.33076593,
               da: 0.00000037, de: 0.00001906, di: -0.00594749, dL: 149472.67411175, dwbar: 0.16047689, dO: -0.12534081 },
    venus:   { a: 0.72333566, e: 0.00677672, i: 3.39467605, L: 181.97909950, wbar: 131.60246718, O: 76.67984255,
               da: 0.00000390, de: -0.00004107, di: -0.00078890, dL: 58517.81538729, dwbar: 0.00268329, dO: -0.27769418 },
    earth:   { a: 1.00000261, e: 0.01671123, i: -0.00001531, L: 100.46457166, wbar: 102.93768193, O: 0.0,
               da: 0.00000562, de: -0.00004392, di: -0.01294668, dL: 35999.37244981, dwbar: 0.32327364, dO: 0.0 },
    mars:    { a: 1.52371034, e: 0.09339410, i: 1.84969142, L: -4.55343205, wbar: -23.94362959, O: 49.55953891,
               da: 0.00001847, de: 0.00007882, di: -0.00813131, dL: 19140.30268499, dwbar: 0.44441088, dO: -0.29257343 },
    jupiter: { a: 5.20288700, e: 0.04838624, i: 1.30439695, L: 34.39644051, wbar: 14.72847983, O: 100.47390909,
               da: -0.00011607, de: -0.00013253, di: -0.00183714, dL: 3034.74612775, dwbar: 0.21252668, dO: 0.20469106 },
    saturn:  { a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, wbar: 92.59887831, O: 113.66242448,
               da: -0.00125060, de: -0.00050991, di: 0.00193609, dL: 1222.49362201, dwbar: -0.41897216, dO: -0.28867794 },
    uranus:  { a: 19.18916464, e: 0.04725744, i: 0.77263783, L: 313.23810451, wbar: 170.95427630, O: 74.01692503,
               da: -0.00196176, de: -0.00004397, di: -0.00242939, dL: 428.48202785, dwbar: 0.40805281, dO: 0.04240589 },
    neptune: { a: 30.06992276, e: 0.00859048, i: 1.77004347, L: -55.12002969, wbar: 44.96476227, O: 131.78422574,
               da: 0.00026291, de: 0.00005105, di: 0.00035372, dL: 218.45945325, dwbar: -0.32241464, dO: -0.00508664 },
    // ---- dwarf planet + comets (Horizons-derived, see header comment) ----
    pluto:   { a: 39.551622440, e: 0.24671818938, i: 16.981325218, L: 239.48912892, wbar: 224.59290049, O: 109.83448072,
               da: 0.63715584513, de: 0.0099044579743, di: 0.43168623783, dL: 143.79579300, dwbar: 3.3067104653, dO: 1.6158113773 },
    halley:  { a: 17.857646763, e: 0.96729617013, i: 162.20789444, L: 237.67662058, wbar: 171.27904512, O: 59.185064321,
               da: 0.0069284199144, de: 0.0027343820414, di: -0.065326615799, dL: 476.96920408, dwbar: 0.60946324942, dO: 0.32034663749 },
    encke:   { a: 2.2212180666, e: 0.84577158580, i: 11.690949367, L: -273.80267441, wbar: 161.07488205, O: 334.56852194,
               da: -0.013031592443, de: 0.0057779829216, di: -1.2827386896, dL: 10900.108822, dwbar: 0.86637204829, dO: -2.0540374346 },
    tuttle:  { a: 5.6559174455, e: 0.82005709179, i: 55.219976830, L: -94.293091337, wbar: 117.90998887, O: 270.40029874,
               da: 0.19024778508, de: 0.0025912330009, di: -0.93152354516, dL: 2640.6047143, dwbar: -0.90355934986, dO: -0.80749189578 },
    borrelly:{ a: 3.5996457997, e: 0.63134150700, i: 29.982340684, L: -13.655924715, wbar: 67.832476990, O: 75.088196628,
               da: 0.034899628740, de: 0.022785326102, di: -2.5439437287, dL: 5250.6981713, dwbar: -5.9792584530, dO: -3.2681038692 },
    churyumov:{ a: 3.4162247314, e: 0.65303529856, i: 6.1024933036, L: -83.573595652, wbar: 60.806431284, O: 45.745644549,
               da: 0.15987630548, de: -0.013266027566, di: -8.3590443097, dL: 5595.8844907, dwbar: -8.5252850067, dO: -35.350547538 },
    hartley2:{ a: 3.4866719102, e: 0.69188458558, i: 13.568285041, L: -199.39575275, wbar: 40.990121497, O: 219.81942983,
               da: -0.037517006931, de: 0.0043693924884, di: 0.11312941653, dL: 5553.3589299, dwbar: 0.40329371317, dO: -0.20488647001 }
  };

  var PLANET_NAMES = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];

  // ------------------------------------------------------------------
  // Time helpers. All times are days since J2000.0 (2000-01-01 12:00 TT).
  // ------------------------------------------------------------------
  function daysFromUTC(date) {
    return (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
                     date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()) / 86400000
            + 2440587.5) - J2000_JD;
  }
  function dateFromDays(tDays) {
    return new Date(Date.UTC(2000, 0, 1, 12) + tDays * 86400000);
  }

  // ------------------------------------------------------------------
  // Kepler equation (ellipse): M = E - e sinE
  // ------------------------------------------------------------------
  function solveKeplerEllipse(M, e) {
    M = M % TAU;
    var E = (e < 0.8) ? M : Math.PI;
    for (var k = 0; k < 40; k++) {
      var f = E - e * Math.sin(E) - M;
      var fp = 1 - e * Math.cos(E);
      var dE = f / fp;
      E -= dE;
      if (Math.abs(dE) < 1e-13) break;
    }
    return E;
  }

  // Hyperbolic Kepler: M = H - e sinhH   (dM/dH = 1 - e coshH < 0, so H and
  // M have opposite signs). Solve for h = |H| > 0: e sinh(h) - h = |M|, which
  // is monotonic and convex — Newton from asinh(|M|/e) converges reliably.
  function solveKeplerHyperbolic(M, e) {
    if (M === 0) return 0;
    var sgn = (M > 0 ? -1 : 1);
    var m = Math.abs(M);
    var h = Math.asinh(m / e);
    for (var k = 0; k < 60; k++) {
      var f = e * Math.sinh(h) - h - m;
      var fp = e * Math.cosh(h) - 1;
      var dh = f / fp;
      h -= dh;
      if (h < 0) h = 0;
      if (Math.abs(dh) < 1e-13) break;
    }
    return sgn * h;
  }

  // ------------------------------------------------------------------
  // Planetary ephemeris
  // ------------------------------------------------------------------
  function elementState(name, tDays) {
    var el = ELEMENTS[name];
    var T = tDays / 36525; // Julian centuries since J2000
    return {
      a: el.a + el.da * T,
      e: el.e + el.de * T,
      i: (el.i + el.di * T) * DEG,
      L: (el.L + el.dL * T) * DEG,
      wbar: (el.wbar + el.dwbar * T) * DEG,
      O: (el.O + el.dO * T) * DEG
    };
  }

  // Rotate in-plane coords (xp, yp) by (omega, i, O) to ecliptic coords.
  function rotateToEcliptic(xp, yp, omega, i, O) {
    var cw = Math.cos(omega), sw = Math.sin(omega);
    var cO = Math.cos(O),     sO = Math.sin(O);
    var ci = Math.cos(i),     si = Math.sin(i);
    return V(
      (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp,
      (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp,
      (sw * si) * xp + (cw * si) * yp
    );
  }

  // Heliocentric ecliptic position (AU) of a planet at tDays.
  function planetPosition(name, tDays) {
    var s = elementState(name, tDays);
    var M = s.L - s.wbar;
    var E = solveKeplerEllipse(M, s.e);
    var r = s.a * (1 - s.e * Math.cos(E));
    var xp = s.a * (Math.cos(E) - s.e);
    var yp = s.a * Math.sqrt(1 - s.e * s.e) * Math.sin(E);
    return rotateToEcliptic(xp, yp, s.wbar - s.O, s.i, s.O);
  }

  // Heliocentric ecliptic velocity (AU/day) via central difference.
  function planetVelocity(name, tDays) {
    var h = 0.02; // days
    var p1 = planetPosition(name, tDays - h);
    var p2 = planetPosition(name, tDays + h);
    return scl(sub(p2, p1), 1 / (2 * h));
  }

  // ------------------------------------------------------------------
  // Small-body belt sampling (display only).
  // Static distributions of main-belt / Kuiper-belt positions in the
  // heliocentric ecliptic frame (same convention as planetPosition:
  // x-y plane, z = height). The app splits each sample into a few
  // overlapping radial sub-bands that rotate rigidly about the ecliptic
  // normal at their own mid-radius period (differential rotation).
  // ------------------------------------------------------------------
  function gaussUnit(rand) {
    // Sum of 4 uniforms normalized to unit variance (light tails, fine
    // for display distributions).
    return (rand() + rand() + rand() + rand() - 2) * 1.7320508075688772;
  }
  function smoothstep01(t) {
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return t * t * (3 - 2 * t);
  }
  // One point on a circular orbit of radius r: true longitude nu measured
  // from the ascending node, inclination inc, node O.
  function beltPoint(r, nu, inc, O) {
    var cO = Math.cos(O), sO = Math.sin(O);
    var ci = Math.cos(inc), si = Math.sin(inc);
    var c = Math.cos(nu), s = Math.sin(nu);
    return V(
      r * (cO * c - sO * s * ci),
      r * (sO * c + cO * s * ci),
      r * (s * si)
    );
  }
  // Radial number-density shape of the main belt (2.05-3.40 AU): broad
  // peak with depletions at the Kirkwood gaps (Jupiter mean-motion
  // resonances 3:1, 5:2, 7:3, 2:1).
  var MAIN_BELT_GAPS = [
    [2.50, 0.75, 0.060], [2.82, 0.60, 0.050], [2.95, 0.60, 0.050], [3.27, 0.80, 0.070]
  ];
  function mainBeltProfile(r) {
    if (r < 2.05 || r > 3.40) return 0;
    var w = Math.exp(-Math.pow((r - 2.45) / 0.95, 2));
    for (var i = 0; i < MAIN_BELT_GAPS.length; i++) {
      var g = MAIN_BELT_GAPS[i];
      w *= 1 - g[1] * Math.exp(-Math.pow((r - g[0]) / g[2], 2));
    }
    return w;
  }
  // N main-belt positions, rejection-sampled from mainBeltProfile over
  // [rMin, rMax]; Gaussian inclinations (sigma ~ 3.2-4.4 deg, capped 9 deg)
  // at random nodes.
  function mainBeltSample(N, rand, rMin, rMax) {
    rand = rand || Math.random;
    rMin = rMin || 2.05; rMax = rMax || 3.40;
    var maxW = 0;
    for (var g = rMin; g <= rMax + 1e-9; g += 0.01) maxW = Math.max(maxW, mainBeltProfile(g));
    var pts = [];
    while (pts.length < N) {
      var r = rMin + rand() * (rMax - rMin);
      var w = mainBeltProfile(r);
      if (w <= 0 || rand() > w / maxW) continue;
      var inc = gaussUnit(rand) * (0.056 + 0.021 * (r - 2.05) / 1.35);
      if (Math.abs(inc) > 0.157) continue; // 9 deg cap
      pts.push(beltPoint(r, rand() * TAU, inc, rand() * TAU));
    }
    return pts;
  }
  // Radial shape of the Kuiper belt (30.5-49.5 AU): rises just beyond
  // Neptune, peaks in the ~34-42 AU classical region, sparser outer tail.
  function kuiperBeltProfile(r) {
    if (r < 30.5 || r > 49.5) return 0;
    var w = smoothstep01((r - 30.5) / 3.0);
    w *= 1 - 0.7 * smoothstep01((r - 44.0) / 5.5);
    return w;
  }
  // N Kuiper-belt positions, Gaussian inclinations (sigma ~ 8 deg, capped
  // 20 deg) at random nodes.
  function kuiperBeltSample(N, rand, rMin, rMax) {
    rand = rand || Math.random;
    rMin = rMin || 30.5; rMax = rMax || 49.5;
    var maxW = 0;
    for (var g = rMin; g <= rMax + 1e-9; g += 0.05) maxW = Math.max(maxW, kuiperBeltProfile(g));
    var pts = [];
    while (pts.length < N) {
      var r = rMin + rand() * (rMax - rMin);
      var w = kuiperBeltProfile(r);
      if (w <= 0 || rand() > w / maxW) continue;
      var inc = gaussUnit(rand) * 0.14;
      if (Math.abs(inc) > 0.35) continue; // 20 deg cap
      pts.push(beltPoint(r, rand() * TAU, inc, rand() * TAU));
    }
    return pts;
  }

  // ------------------------------------------------------------------
  // Moon system model.
  // The Moon uses a low-precision (Meeus) mean-element model with
  // regression of the node; other moons use fixed circular-ish Kepler
  // orbits (visually indistinguishable at sim scale).
  // ------------------------------------------------------------------
  // Moon: Keplerian model with Meeus mean elements — mean anomaly M,
  // argument of perigee w = varpi - Omega (both precessing), regressing node.
  // w0Deg/wreg in deg and deg/Julian-century; mreg is the mean-anomaly rate.
  var MOONS = {
    moon:     { parent: "earth",   aKm: 384400,  e: 0.0549,  periodDays: 27.5545, M0Deg: 134.9633964, w0Deg: -41.6912735, wreg: 6003.1500178, incDeg: 5.145,  ODeg: 125.0458, Oreg: -1934.1362891, mreg: 477198.8675055 },
    phobos:   { parent: "mars",    aKm: 9378,    e: 0.015,   periodDays: 0.31888,  M0Deg: 90,      wDeg: 0,     incDeg: 1.08,   ODeg: 150,    Oreg: 0, mreg: 0, u0Deg: 90 },
    deimos:   { parent: "mars",    aKm: 23463,   e: 0.001,   periodDays: 1.26244,  M0Deg: 200,     wDeg: 0,     incDeg: 1.78,   ODeg: 250,    Oreg: 0, mreg: 0, u0Deg: 200 },
    io:       { parent: "jupiter", aKm: 421700,  e: 0.004,   periodDays: 1.76914,  M0Deg: 40,      wDeg: 0,     incDeg: 0.04,   ODeg: 150,    Oreg: 0, mreg: 0, u0Deg: 40 },
    europa:   { parent: "jupiter", aKm: 671034,  e: 0.009,   periodDays: 3.55118,  M0Deg: 150,     wDeg: 0,     incDeg: 0.47,   ODeg: 150,    Oreg: 0, mreg: 0, u0Deg: 150 },
    ganymede: { parent: "jupiter", aKm: 1070412, e: 0.001,   periodDays: 7.15456,  M0Deg: 260,     wDeg: 0,     incDeg: 0.18,   ODeg: 150,    Oreg: 0, mreg: 0, u0Deg: 260 },
    callisto: { parent: "jupiter", aKm: 1882709, e: 0.007,   periodDays: 16.689,   M0Deg: 330,     wDeg: 0,     incDeg: 0.19,   ODeg: 150,    Oreg: 0, mreg: 0, u0Deg: 330 },
    titan:    { parent: "saturn",  aKm: 1221870, e: 0.029,   periodDays: 15.9454,  M0Deg: 110,     wDeg: 0,     incDeg: 0.35,   ODeg: 80,     Oreg: 0, mreg: 0, u0Deg: 110 },
    triton:   { parent: "neptune", aKm: 354759,  e: 0.000,   periodDays: 5.8769,   M0Deg: 25,      wDeg: 0,     incDeg: 156.8,  ODeg: 130,    Oreg: 0, mreg: 0, u0Deg: 25 }
  };

  // Position of a moon relative to its parent planet (AU).
  function moonOffset(moonId, tDays) {
    var m = MOONS[moonId];
    var T = tDays / 36525;
    var Mdeg = m.mreg ? (m.M0Deg + m.mreg * T)
                      : (m.M0Deg + 360 * (tDays / Math.abs(m.periodDays)));
    var E = solveKeplerEllipse((Mdeg * DEG) % TAU, m.e);
    var a = m.aKm / AU_KM;
    var r = a * (1 - m.e * Math.cos(E));
    var nu = Math.atan2(Math.sqrt(1 - m.e * m.e) * Math.sin(E), Math.cos(E) - m.e);
    // Argument of latitude (from ascending node) = argument of perigee +
    // true anomaly. The Moon's perigee precesses (Meeus w = varpi - Omega);
    // other moons use fixed elements.
    var wdeg = (m.w0Deg !== undefined) ? (m.w0Deg + (m.wreg || 0) * T) : (m.wDeg || 0);
    var u = wdeg * DEG + nu;
    var xp = r * Math.cos(u), yp = r * Math.sin(u);
    var O = (m.ODeg + m.Oreg * T) * DEG;
    var i = m.incDeg * DEG;
    return rotateToEcliptic(xp, yp, 0, i, O);
  }

  function moonHeliocentricPosition(moonId, tDays) {
    var m = MOONS[moonId];
    return add(planetPosition(m.parent, tDays), moonOffset(moonId, tDays));
  }

  function moonHeliocentricVelocity(moonId, tDays) {
    var h = 0.02;
    var p1 = moonHeliocentricPosition(moonId, tDays - h);
    var p2 = moonHeliocentricPosition(moonId, tDays + h);
    return scl(sub(p2, p1), 1 / (2 * h));
  }

  // ------------------------------------------------------------------
  // Interstellar probes — linear propagation from a JPL Horizons state
  // vector (they are far past their planet of origin; solar deceleration
  // is negligible at >5x local escape speed).
  // r in AU, v in AU/day, heliocentric ecliptic J2000.
  // Source: JPL Horizons SOE, 2026-10-03 (tools/voyagers_state.json).
  // ------------------------------------------------------------------
  var PROBES = {
    voyager1: {
      tEpoch: 9771.5,
      r: { x: -32.165404844491285, y: -136.84034688109682, z: 99.00659754173482 },
      v: { x: -0.001202777353157608, y: -0.007861183458651787, z: 0.0056780382111687915 }
    },
    voyager2: {
      tEpoch: 9771.5,
      r: { x: 39.89513633684802, y: -105.47516359072472, z: -89.71637641422127 },
      v: { x: 0.002420361922757512, y: -0.005394481877964527, z: -0.0065363547651629125 }
    }
  };

  // Earth-relative probes: Hubble in LEO, JWST on a Sun-Earth L2 halo orbit.
  // Both keep pace with Earth; position = Earth heliocentric + offset.
  var EARTH_PROBES = {
    hubble: {
      rKm: 6906,           // 6371 (Earth) + 535 km altitude
      periodDays: 0.06611, // 95.2 min circular orbit
      incDeg: 28.5,        // inclination to the ecliptic
      raanDeg: 90,         // node orientation (display flavor)
      phaseDeg: 20
    },
    jwst: {
      l2Km: 1500000,       // L2 ~1.5e6 km anti-sunward of Earth
      haloRadKm: 250000,   // halo amplitude, radial (anti-sunward)
      haloVertKm: 100000,  // halo amplitude, ecliptic-normal
      periodDays: 180,     // halo period
      phase: 0.9           // arbitrary launch phase
    }
  };

  function hubbleOffset(tDays) {
    var e = EARTH_PROBES.hubble;
    var r = e.rKm / AU_KM;
    var u = TAU * tDays / e.periodDays + DEG * e.phaseDeg;
    var inc = DEG * e.incDeg, raan = DEG * e.raanDeg;
    // circular orbit in the xy-plane, tilted about x by i, node rotated by Ω
    var x1 = r * Math.cos(u);
    var y1 = r * Math.sin(u) * Math.cos(inc);
    var z1 = r * Math.sin(u) * Math.sin(inc);
    return V(x1 * Math.cos(raan) - y1 * Math.sin(raan),
             x1 * Math.sin(raan) + y1 * Math.cos(raan),
             z1);
  }

  function jwstOffset(tDays) {
    var e = EARTH_PROBES.jwst;
    var earth = planetPosition("earth", tDays);
    var antiSun = scl(earth, -1 / len(earth));
    var u = TAU * tDays / e.periodDays + e.phase;
    var radial = (e.l2Km + e.haloRadKm * Math.cos(u)) / AU_KM;
    var vert = (e.haloVertKm * Math.sin(u)) / AU_KM;
    return add(scl(antiSun, radial), V(0, 0, vert));
  }

  function earthProbeOffset(id, tDays) {
    if (id === "hubble") return hubbleOffset(tDays);
    if (id === "jwst") return jwstOffset(tDays);
    throw new Error("Unknown earth probe: " + id);
  }
  function earthProbePosition(id, tDays) {
    return add(planetPosition("earth", tDays), earthProbeOffset(id, tDays));
  }

  function probePosition(id, tDays) {
    var p = PROBES[id];
    if (p) return add(p.r, scl(p.v, tDays - p.tEpoch));
    if (EARTH_PROBES[id]) return earthProbePosition(id, tDays);
    throw new Error("Unknown probe: " + id);
  }
  function probeVelocity(id, tDays) {
    var p = PROBES[id];
    if (p) return scl(p.v, 1);
    if (EARTH_PROBES[id]) {
      // central difference; step = period/32 so fast LEO motion isn't aliased
      var h = EARTH_PROBES[id].periodDays / 32;
      return scl(sub(earthProbePosition(id, tDays + h),
                     earthProbePosition(id, tDays - h)), 1 / (2 * h));
    }
    throw new Error("Unknown probe: " + id);
  }

  // Destination position lookup (planets + moons + probes) — used by the planner.
  function destinationPosition(destId, tDays) {
    if (ELEMENTS[destId]) return planetPosition(destId, tDays);
    if (MOONS[destId]) return moonHeliocentricPosition(destId, tDays);
    if (PROBES[destId]) return probePosition(destId, tDays);
    if (EARTH_PROBES[destId]) return earthProbePosition(destId, tDays);
    throw new Error("Unknown destination: " + destId);
  }

  // ------------------------------------------------------------------
  // General conic propagation (rocket trajectories)
  // ------------------------------------------------------------------
  // Build an orbit state from (r0, v0) in AU / AU-per-day.
  function conicFromState(r0, v0, mu) {
    mu = mu || MU_SUN;
    var r = len(r0), v2 = dot(v0, v0);
    var a = 1 / (2 / r - v2 / mu);
    var h = cross(r0, v0);
    var evec = sub(scl(cross(v0, h), 1 / mu), unit(r0));
    var e = len(evec);
    var P, Q, W, M0, type;
    if (e > 1e-10) {
      P = scl(evec, 1 / e);
    } else {
      P = unit(r0); // circular: periapsis undefined, use r0 direction
    }
    W = unit(h);
    Q = cross(W, P);
    var X0 = dot(r0, P), Y0 = dot(r0, Q);
    var rdotv = dot(r0, v0);
    var hlen = len(h);
    if (e < 1e-10) {
      type = "circle";
      M0 = Math.atan2(Y0, X0);
    } else if (a > 0) {
      type = "ellipse";
      // cosE = (1 - r/a)/e ;  sinE = (r.v) sqrt(1-e^2) / (e |h|)
      var cosE = (1 - r / a) / e;
      var sinE = rdotv * Math.sqrt(1 - e * e) / (e * hlen);
      var E0 = Math.atan2(sinE, cosE);
      M0 = E0 - e * Math.sin(E0);
    } else {
      type = "hyperbola";
      // r = a(1 - e coshH) with a < 0 ; Y = a sqrt(e^2-1) sinhH
      var sinhH = Y0 / (a * Math.sqrt(e * e - 1));
      var H0 = Math.asinh(sinhH);
      M0 = H0 - e * Math.sinh(H0);
    }
    var n = Math.sqrt(mu) / Math.pow(Math.abs(a), 1.5);
    return { a: a, e: e, h: h, P: P, Q: Q, M0: M0, n: n, type: type };
  }

  // Propagate a conic state by dt days. Returns {pos, vel} in AU, AU/day.
  function conicPropagate(orbit, dt, mu) {
    mu = mu || MU_SUN;
    var M = orbit.M0 + orbit.n * dt;
    var X, Y, vX, vY, e = orbit.e;
    if (orbit.type === "hyperbola") {
      // H - e sinhH = M ; r = a(1 - e coshH), a < 0
      var H = solveKeplerHyperbolic(M, e);
      X = orbit.a * (Math.cosh(H) - e);
      Y = orbit.a * Math.sqrt(e * e - 1) * Math.sinh(H);
      var Hp = orbit.n / (1 - e * Math.cosh(H));
      vX = orbit.a * Math.sinh(H) * Hp;
      vY = orbit.a * Math.sqrt(e * e - 1) * Math.cosh(H) * Hp;
    } else {
      // E - e sinE = M ; r = a(1 - e cosE), a > 0
      var E = solveKeplerEllipse(M, e);
      X = orbit.a * (Math.cos(E) - e);
      Y = orbit.a * Math.sqrt(1 - e * e) * Math.sin(E);
      var den = 1 - e * Math.cos(E);
      // dX/dt = -a sinE (dE/dt), dE/dt = n/den, a*n = sqrt(mu/a)
      var s = Math.sqrt(mu / orbit.a);
      vX = -s * Math.sin(E) / den;
      vY = s * Math.sqrt(1 - e * e) * Math.cos(E) / den;
    }
    return {
      pos: add(scl(orbit.P, X), scl(orbit.Q, Y)),
      vel: add(scl(orbit.P, vX), scl(orbit.Q, vY))
    };
  }

  // ------------------------------------------------------------------
  // Lambert's problem — conic-parameter formulation.
  //
  // Two single-revolution conic families exist through r0 and r1:
  //   Family 1 ("short arc"): traverses the angle theta between the
  //     radius vectors in the natural r0 -> r1 rotation direction.
  //   Family 2 ("long arc"):  goes the other way, 2pi - theta.
  // Each family is parameterized by the true anomaly lambda of r0:
  //   r(nu) = p / (1 + e cos nu),   nu1 = lambda + phi
  //   e = (r1 - r0) / (r0 cos lambda - r1 cos(lambda + phi))
  //   p = r0 (1 + e cos lambda)
  // TOF(lambda) is monotonic over the valid interval (T_min .. inf),
  // so a bracketing scan + bisection solves robustly for any TOF.
  // ------------------------------------------------------------------
  function lambert(r0v, r1v, TOF, mu, familyIdx) {
    mu = mu || MU_SUN;
    var r0 = len(r0v), r1 = len(r1v);
    if (r0 < 1e-12 || r1 < 1e-12) throw new Error("Lambert: zero radius");
    var u1 = unit(r0v);
    var c = cross(r0v, r1v);
    var cn = len(c);
    var theta = Math.acos(Math.min(1, Math.max(-1, dot(r0v, r1v) / (r0 * r1))));

    // Degenerate equal-radius geometry: e = (r1-r0)/den collapses to 0/0 at
    // the fast-family pole, so the scan above cannot see the hyperbolic
    // members. Solve the symmetric conic directly: pericenter midway between
    // the radius vectors (nu0 = -theta/2, nu1 = +theta/2), eccentricity free.
    if (Math.abs(r1 - r0) < 1e-10 * Math.max(r0, r1) && theta < Math.PI && theta > 1e-9) {
      var rEq = 0.5 * (r0 + r1);
      var n2 = cn < 1e-11
        ? ((Math.abs(u1.x) < 0.9) ? unit(cross(u1, V(1, 0, 0))) : unit(cross(u1, V(0, 1, 0))))
        : unit(cross(scl(c, 1 / cn), u1));
      var half = theta / 2;
      function eqTOF(e) {
        var p = rEq * (1 + e * Math.cos(half));
        if (Math.abs(e - 1) < 1e-6) {
          // Barker's equation (parabolic limit) avoids the 0/0 cancellation
          var u = Math.sqrt(p / rEq) * Math.SQRT2 * Math.sin(half / 2);
          return 2 * Math.sqrt(p * p * p / (2 * mu)) * u * (1 + u * u / 3);
        }
        if (e < 1) {
          var a = p / (1 - e * e);
          var sq = Math.sqrt(1 - e * e);
          var E1 = 2 * Math.atan(sq * Math.tan(half / 2) / Math.sqrt(1 + e));
          return Math.sqrt(a * a * a / mu) * (2 * E1 - 2 * e * Math.sin(E1));
        }
        var aabs = p / (e * e - 1);
        var k = Math.sqrt((e - 1) / (e + 1));
        var H1 = 2 * Math.atanh(k * Math.tan(half / 2));
        return Math.sqrt(aabs * aabs * aabs / mu) * (2 * e * Math.sinh(H1) - 2 * H1);
      }
      var tCirc = Math.sqrt(rEq * rEq * rEq / mu) * theta; // e -> 0 limit
      if (TOF >= tCirc) {
        var vc = Math.sqrt(mu / rEq);
        return {
          v0: scl(n2, vc),
          v1: add(scl(u1, -vc * Math.sin(half)), scl(n2, vc * Math.cos(half))),
          TOFcalc: tCirc, e: 0, p: rEq
        };
      }
      var eHi = 2;
      while (eqTOF(eHi) > TOF && eHi < 1e6) eHi *= 2;
      var eLo = 0;
      for (var it = 0; it < 200; it++) {
        var eMid = 0.5 * (eLo + eHi);
        if (eqTOF(eMid) > TOF) eLo = eMid; else eHi = eMid;
        if (eHi - eLo < 1e-13) break;
      }
      var eS = 0.5 * (eLo + eHi);
      var pS = rEq * (1 + eS * Math.cos(half));
      var sv = Math.sqrt(mu / pS);
      var vr0 = -sv * eS * Math.sin(half), vt = sv * (1 + eS * Math.cos(half));
      return {
        v0: add(scl(u1, vr0), scl(n2, vt)),
        v1: add(scl(u1, -vr0), scl(n2, vt)),
        TOFcalc: eqTOF(eS), e: eS, p: pS
      };
    }

    // Family definitions: in-plane basis (u1, u2) + arc angle phi.
    var families;
    if (cn < 1e-11) {
      if (dot(r0v, r1v) > 0) throw new Error("Lambert: co-directional geometry");
      // Collinear 180 deg (Hohmann geometry): arbitrary perpendicular;
      // the two families are mirror images, so one suffices.
      var perp = (Math.abs(u1.x) < 0.9) ? unit(cross(u1, V(1, 0, 0)))
                                        : unit(cross(u1, V(0, 1, 0)));
      families = [{ u2: perp, phi: Math.PI, lo: -Math.PI / 2, hi: Math.PI / 2 }];
    } else {
      var nAxis1 = scl(c, 1 / cn);
      var u2a = cross(nAxis1, u1);
      families = [
        { u2: u2a,           phi: theta,     lo: 0, hi: TAU }, // short arc
        { u2: scl(u2a, -1),  phi: TAU - theta, lo: 0, hi: TAU } // long arc
      ];
    }

    function scanFamily(fam) {
      var phi = fam.phi;
      function solveLambda(lam) {
        var c0 = Math.cos(lam), c1 = Math.cos(lam + phi);
        var den = r0 * c0 - r1 * c1;
        if (Math.abs(den) < 1e-12) return null;
        var e = (r1 - r0) / den;
        var p = r0 * (1 + e * c0);
        if (e < 0 || p <= 0 || Math.abs(e - 1) < 1e-9) return null;
        var a = p / (1 - e * e);
        return { lam: lam, e: e, p: p, a: a };
      }
      function tofFor(L) {
        var nu1 = L.lam + phi;
        if (L.e < 1) {
          var a = L.a; // > 0
          var sq = Math.sqrt(1 - L.e * L.e);
          var E0 = Math.atan2(sq * Math.sin(L.lam), Math.cos(L.lam) + L.e);
          var E1 = Math.atan2(sq * Math.sin(nu1), Math.cos(nu1) + L.e);
          var dE = E1 - E0;
          if (dE <= 0) dE += TAU;
          return Math.sqrt(a * a * a / mu) * (dE - L.e * (Math.sin(E1) - Math.sin(E0)));
        } else {
          // Hyperbola. H is the hyperbolic eccentric anomaly:
          //   tan(nu/2) = sqrt((e+1)/(e-1)) tanh(H/2)
          // which is valid exactly where 1 + e cos(nu) > 0; outside that
          // zone atanh returns NaN and the sample is filtered.
          var aabs = -L.a;
          var k = Math.sqrt((L.e - 1) / (L.e + 1));
          var t0 = k * Math.tan(L.lam / 2);
          var t1 = k * Math.tan(nu1 / 2);
          if (Math.abs(t0) >= 1 || Math.abs(t1) >= 1) return null;
          var H0 = 2 * Math.atanh(t0);
          var H1 = 2 * Math.atanh(t1);
          var dH = H1 - H0;
          if (dH <= 0) return null; // prograde arc must increase H
          return Math.sqrt(aabs * aabs * aabs / mu) * (L.e * (Math.sinh(H1) - Math.sinh(H0)) - dH);
        }
      }

      var N = 1440, pts = [];
      for (var i = 0; i < N; i++) {
        var L = solveLambda(fam.lo + (fam.hi - fam.lo) * i / N);
        if (!L) continue;
        var T = tofFor(L);
        if (T > 0 && isFinite(T)) pts.push({ lam: L.lam, T: T });
      }
      if (pts.length < 2) return null;

      // The valid set is one contiguous interval (mod 2pi) — find it as
      // the largest gap between consecutive valid samples (cyclic).
      var start = 0, bestGap = -1;
      for (i = 1; i < pts.length; i++) {
        var gap = pts[i].lam - pts[i - 1].lam;
        if (gap > bestGap) { bestGap = gap; start = i; }
      }
      var wrapGap = (pts[0].lam + TAU) - pts[pts.length - 1].lam;
      if (wrapGap > bestGap) start = 0;

      var run = [];
      for (i = 0; i < pts.length; i++) run.push(pts[(start + i) % pts.length]);
      var minT = run[0].T;
      for (i = 1; i < run.length; i++) if (run[i].T < minT) minT = run[i].T;
      return { solveLambda: solveLambda, tofFor: tofFor, run: run, minT: minT };
    }

    function bisectBracket(famScan, A, B, TOF) {
      var aU = A.lam, bU = B.lam;
      if (bU < aU) bU += TAU; // unwrap across 2pi
      var TA = A.T;
      for (var it = 0; it < 90; it++) {
        var midU = (aU + bU) / 2;
        var Lm = famScan.solveLambda(midU % TAU);
        var Tm = Lm ? famScan.tofFor(Lm) : null;
        if (Tm === null) return null; // shrank into an invalid sliver
        if ((Tm - TOF) * (TA - TOF) <= 0) bU = midU;
        else aU = midU;
        if (bU - aU < 1e-11) break;
      }
      return famScan.solveLambda(((aU + bU) / 2) % TAU);
    }

    function solveInFamily(famScan, fam, TOF) {
      var run = famScan.run;
      // TOF(lambda) is NOT monotonic on the valid interval: it has an
      // interior a->0+ spike (TOF -> infinity) with fast-limit ends, so a
      // low requested TOF can cross the curve twice — once on the
      // hyperbolic (high-energy, a<0) side and once on the elliptic
      // (low-energy, a>0) side. Collect every root and keep the
      // lowest-energy conic (largest semi-major axis).
      var roots = [];
      for (var i = 0; i < run.length; i++) {
        var A = run[i], B = run[(i + 1) % run.length];
        if (A.lam === B.lam) continue;
        if ((A.T - TOF) * (B.T - TOF) <= 0) {
          var Lr = bisectBracket(famScan, A, B, TOF);
          if (Lr) roots.push(Lr);
        }
      }
      var Lsol = null, bestA = -Infinity;
      for (i = 0; i < roots.length; i++) {
        if (roots[i].a > bestA) { bestA = roots[i].a; Lsol = roots[i]; }
      }
      if (!Lsol) {
        // Target outside the scanned range: clamp to the nearest extreme.
        var minS = run[0], maxS = run[0];
        for (i = 1; i < run.length; i++) {
          if (run[i].T < minS.T) minS = run[i];
          if (run[i].T > maxS.T) maxS = run[i];
        }
        var s = (TOF - minS.T < maxS.T - TOF) ? minS : maxS;
        Lsol = famScan.solveLambda(s.lam);
      }
      if (!Lsol) throw new Error("Lambert: solve failed");

      var s = Math.sqrt(mu / Lsol.p);
      // (u1, u2) frame: u1 = r0_hat, so the perifocal radial unit vector
      // sits at polar angle psi = nu - lambda (pericenter is at -lambda).
      function velAt(nu) {
        var vr = s * Lsol.e * Math.sin(nu);
        var vt = s * (1 + Lsol.e * Math.cos(nu));
        var psi = nu - Lsol.lam;
        var rx = Math.cos(psi), ry = Math.sin(psi);
        var tx = -Math.sin(psi), ty = Math.cos(psi);
        return { u1c: vr * rx + vt * tx, u2c: vr * ry + vt * ty };
      }
      var v0p = velAt(Lsol.lam), v1p = velAt(Lsol.lam + fam.phi);
      var v0 = add(scl(u1, v0p.u1c), scl(fam.u2, v0p.u2c));
      var v1 = add(scl(u1, v1p.u1c), scl(fam.u2, v1p.u2c));
      var TOFcalc = famScan.tofFor(Lsol);
      return { v0: v0, v1: v1, TOFcalc: TOFcalc, e: Lsol.e, p: Lsol.p };
    }

    var scanned = [];
    for (var f = 0; f < families.length; f++) {
      if (familyIdx != null && f !== familyIdx) continue;
      var fs = scanFamily(families[f]);
      if (fs) scanned.push({ scan: fs, fam: families[f] });
    }
    if (!scanned.length) throw new Error("Lambert: no single-rev solution");

    var pick = null;
    if (familyIdx != null) {
      // Explicit family request: use it even below its minimum TOF; the
      // planner's fixed-point iteration will push the TOF up to feasibility.
      pick = scanned[0];
    } else {
      for (f = 0; f < scanned.length; f++) {
        if (TOF >= scanned[f].scan.minT - 1e-9) { pick = scanned[f]; break; }
      }
      if (!pick) {
        // Below every family's minimum TOF: return the fastest available arc;
        // the planner's fixed-point iteration will push the TOF up to it.
        pick = scanned[0];
        for (f = 1; f < scanned.length; f++) {
          if (scanned[f].scan.minT < pick.scan.minT) pick = scanned[f];
        }
      }
    }
    return solveInFamily(pick.scan, pick.fam, TOF);
  }

  // ------------------------------------------------------------------
  // Transfer planner
  // ------------------------------------------------------------------
  var DV_BUDGET_KMS = 6.0; // heliocentric dV the "modern rocket" can provide

  // Solve the TOF fixed point: find t such that a Lambert arc from r0 to
  // dest(t0 + t) takes exactly t days.
  function solveTOFMatch(t0, r0, destFn, tGuess, familyIdx) {
    var t = Math.max(0.25, tGuess);
    var tCap = Math.max(60000, tGuess * 4);
    var last = null, lastErr = Infinity;
    for (var i = 0; i < 100; i++) {
      var rB = destFn(t0 + t);
      if (len(sub(rB, r0)) < 1e-5) return null;
      var lam;
      try { lam = lambert(r0, rB, t, MU_SUN, familyIdx); } catch (e) { return null; }
      var err = lam.TOFcalc - t;
      last = { lam: lam, t: t, rB: rB };
      if (Math.abs(err) < 1e-4) return { TOF: lam.TOFcalc, v0: lam.v0, v1: lam.v1, r1: rB, e: lam.e };
      lastErr = Math.abs(err);
      t += 0.7 * err;
      if (t < 0.25) t = 0.25;
      if (t > tCap) t = tCap;
    }
    // Damped iteration did not converge tightly — accept if reasonably close,
    // otherwise do a bisection on g(t) = TOFcalc(dest(t0+t)) - t.
    if (last && lastErr < 1.0) return { TOF: last.lam.TOFcalc, v0: last.lam.v0, v1: last.lam.v1, r1: last.rB, e: last.lam.e };
    var g = function (tt) {
      var rB = destFn(t0 + tt);
      if (len(sub(rB, r0)) < 1e-5) return NaN;
      try { return lambert(r0, rB, tt, MU_SUN, familyIdx).TOFcalc - tt; } catch (e) { return NaN; }
    };
    var loB = 0.25, hiB = Math.max(5000, tGuess * 2);
    var glo = g(loB), ghi = g(hiB);
    var guard = 0;
    while ((isNaN(glo) || glo > 0) && guard++ < 40) { loB = hiB; hiB *= 2; glo = ghi; ghi = g(hiB); }
    if (isNaN(glo) || isNaN(ghi)) return null;
    for (i = 0; i < 60; i++) {
      var mid = (loB + hiB) / 2;
      var gm = g(mid);
      if (isNaN(gm)) break;
      if (glo * gm <= 0) { hiB = mid; ghi = gm; } else { loB = mid; glo = gm; }
      if (hiB - loB < 1e-4) break;
    }
    var rt = (loB + hiB) / 2;
    var rBf = destFn(t0 + rt);
    var lamf;
    try { lamf = lambert(r0, rBf, rt, MU_SUN, familyIdx); } catch (e) { return null; }
    return { TOF: lamf.TOFcalc, v0: lamf.v0, v1: lamf.v1, r1: rBf, e: lamf.e };
  }

  /**
   * Plan a transfer from state (r0, v0) at time t0 to a moving destination.
   * destFn(t) -> heliocentric position at time t.
   * Returns { TOF, tLaunch, tArrival, r0, v0, r1, v1, dV_kms, destId... }
   * or { error: "..." }.
   */
  function planTransfer(t0, r0, v0, destFn) {
    var rB0 = destFn(t0);
    var sep0 = len(sub(rB0, r0));
    // 1e-5 AU ≈ 1500 km: below this the leg is degenerate (Earth -> Earth).
    // Hubble at ~6900 km (4.6e-5 AU) must still plan via the co-orbital path.
    if (sep0 < 1e-5) return { error: "already there" };

    var rAm = len(r0), rBm = len(rB0);
    var aH = 0.5 * (rAm + rBm);
    var tHoh = Math.PI * Math.sqrt(aH * aH * aH / MU_SUN);

    var isClose = sep0 < 0.05; // co-orbital (e.g. Moon from Earth)
    if (isClose) {
      // Co-orbital leg (e.g. Earth -> Moon): the heliocentric Lambert is
      // the wrong model (the destination orbits the same parent body).
      // Solve in the parent's frame: a straight ballistic flight from the
      // parent to the destination's lead position, at a 3 km/s cruise speed.
      var tCruise = Math.max(0.5, (sep0 * AU_KM) / 3.0 / 86400);
      var rBt = destFn(t0 + tCruise);
      // Inertial lead aim: reach rBt in tCruise, accounting for how far the
      // parent (and with it the destination) moves meanwhile.
      var vRel = scl(sub(sub(rBt, r0), scl(v0, tCruise)), 1 / tCruise);
      var v0c = add(v0, vRel);
      return {
        TOF: tCruise, tLaunch: t0, tArrival: t0 + tCruise,
        r0: r0, v0: v0c, v1: v0c, r1: rBt, e: 0, p: sep0,
        dV_kms: len(vRel) * AU_DAY_KMS,
        dV_over: false
      };
    }

    // Cheapest dV at time t over both arc families (null if unsolvable).
    function bestAt(t) {
      var b = null;
      for (var fam = 0; fam < 2; fam++) {
        var sol = solveTOFMatch(t0, r0, destFn, t, fam);
        if (!sol) continue;
        var dv = len(sub(sol.v0, v0)) * AU_DAY_KMS;
        if (!b || dv < b.dV) b = { sol: sol, dV: dv };
      }
      return b;
    }

    var factors = [0.55, 0.75, 1.0, 1.25, 1.6, 2.2, 3.2];
    var candidates = [];
    for (var i = 0; i < factors.length; i++) candidates.push(tHoh * factors[i]);
    // Long-arc minimum-energy estimate: near-conjunction geometries are
    // cheapest going the long way around (sweep ~ 2pi - theta).
    var c01 = Math.min(1, Math.max(-1, dot(r0, rB0) / (rAm * rBm)));
    var theta0 = Math.acos(c01);
    candidates.push(2 * tHoh * (1 - theta0 / TAU));

    var best = null;
    for (i = 0; i < candidates.length; i++) {
      var rc = bestAt(candidates[i]);
      if (rc && (!best || rc.dV < best.dV)) best = rc;
    }

    // Dense scan: the dV(t) lower envelope (min over arc families) is
    // non-unimodal — the cheap family switches from short arc to long arc
    // as the destination crosses opposition — so a coarse grid can sit on
    // a local minimum (e.g. Saturn: local min 15.8 at 11.8y, global min
    // 11.4 at 15.8y). Scan the whole reachable window and keep the global
    // minimum, then polish with golden section.
    var tLo = tHoh * 0.45, tHi = tHoh * 4.2;
    var N = 96;
    var gr = Math.pow(tHi / tLo, 1 / (N - 1));
    for (i = 0; i < N; i++) {
      var tf = tLo * Math.pow(gr, i);
      var rf = bestAt(tf);
      if (rf && (!best || rf.dV < best.dV)) best = rf;
    }
    if (!best) return { error: "transfer not solvable" };

    // Golden-section polish of dV(t) within one scan cell of the best t.
    var tStar = best.sol.TOF;
    var ga = Math.max(0.5, tStar / gr), gb = tStar * gr;
    var invPhi = (Math.sqrt(5) - 1) / 2;
    var x1 = gb - invPhi * (gb - ga), x2 = ga + invPhi * (gb - ga);
    var f1 = bestAt(x1), f2 = bestAt(x2);
    for (i = 0; i < 40 && (gb - ga) > 0.25; i++) {
      if (!f1 && !f2) break;
      if (f1 && (!f2 || f1.dV < f2.dV)) { gb = x2; x2 = x1; f2 = f1; x1 = gb - invPhi * (gb - ga); f1 = bestAt(x1); }
      else { ga = x1; x1 = x2; f1 = f2; x2 = ga + invPhi * (gb - ga); f2 = bestAt(x2); }
      if (f1 && (!best || f1.dV < best.dV)) best = f1;
      if (f2 && (!best || f2.dV < best.dV)) best = f2;
    }

    best = best.sol;
    best.tLaunch = t0;
    best.tArrival = t0 + best.TOF;
    best.dV_kms = len(sub(best.v0, v0)) * AU_DAY_KMS;
    best.dV_over = best.dV_kms > DV_BUDGET_KMS;
    return best;
  }

  // ------------------------------------------------------------------
  // N-body flight integrator (Sun + 8 planets)
  //
  // RK4 with adaptive timestep. The rocket is the only body that is
  // integrated; the planets ride their ephemerides (one evaluation per
  // step, shared by all four stages — planet displacement over dt <= 1 d
  // is negligible against RK4 error).
  //
  // Units: AU, days, AU/day.
  //
  // Planetary GM (AU^3/day^2) and sphere-of-influence radii (AU):
  //   R_SOI = a * (m / (3 M_sun))^(2/5)
  // ------------------------------------------------------------------
  var PLANET_MU = {
    mercury: 4.912e-11, venus: 7.243e-10, earth: 8.888e-10, mars: 9.550e-11,
    jupiter: 2.8247e-4, saturn: 8.457e-5, uranus: 1.2918e-5, neptune: 1.5243e-5
  };
  var PLANET_SOI = {
    mercury: 0.046, venus: 0.089, earth: 0.089, mars: 0.041,
    jupiter: 0.516, saturn: 0.934, uranus: 0.624, neptune: 0.496
  };

  function integrateNBody(pos0, vel0, t0, tEnd, opts) {
    opts = opts || {};
    var dtMax = opts.dtMax || 1.0;
    var dtMin = opts.dtMin || 1e-4;
    var sampleEvery = opts.sampleEvery || 0.5;
    var noSun = !!opts.noSun;
    // Fixed planet states (for tests): { name, pos, vel }[]
    var fixed = opts.fixedPlanetStates || null;

    var bodies = fixed || PLANET_NAMES.map(function (n) { return n; });
    var bodyNames = bodies.map(function (b) { return typeof b === "string" ? b : b.name; });
    function refreshPositions(t) {
      for (var i = 0; i < bodies.length; i++) {
        var b = bodies[i];
        var p = (typeof b === "string") ? planetPosition(b, t) : b.pos;
        pbCache[i].x = p.x; pbCache[i].y = p.y; pbCache[i].z = p.z;
      }
    }
    var pbCache = bodies.map(function () { return { x: 0, y: 0, z: 0 }; });

    // Acceleration at (px,py,pz) using cached planet positions into out.
    // Planet terms are Plummer-softened (eps = 1e-6 AU) so that starting
    // exactly on a planet's position yields a finite — and exactly zero at
    // zero separation — force instead of -Inf * 0 = NaN. Above ~3e-6 AU
    // (~450,000 km) the softening error is < 0.1%.
    var SOFT2 = 1e-12;
    function accel(px, py, pz, out) {
      var ax = 0, ay = 0, az = 0, dx, dy, dz, r2, r, f, i;
      if (!noSun) {
        r2 = px * px + py * py + pz * pz;
        r = Math.sqrt(r2);
        f = -MU_SUN / (r2 * r);
        ax += f * px; ay += f * py; az += f * pz;
      }
      for (i = 0; i < bodies.length; i++) {
        var pb = pbCache[i];
        dx = px - pb.x; dy = py - pb.y; dz = pz - pb.z;
        r2 = dx * dx + dy * dy + dz * dz + SOFT2;
        r = Math.sqrt(r2);
        f = -PLANET_MU[bodyNames[i]] / (r2 * r);
        ax += f * dx; ay += f * dy; az += f * dz;
      }
      out.x = ax; out.y = ay; out.z = az;
    }

    // Conservative timestep: min over bodies of (a) a fraction of the local
    // circular period and (b) a max swept angle of 0.2 deg about the body.
    function stepSize(px, py, pz) {
      var dt = dtMax, i, cand, dx, dy, dz, r2, r, hx, hy, hz, h;
      for (i = 0; i < bodies.length; i++) {
        var pb = pbCache[i];
        dx = px - pb.x; dy = py - pb.y; dz = pz - pb.z;
        r2 = dx * dx + dy * dy + dz * dz;
        r = Math.sqrt(r2);
        if (r > 0.0001) {
          cand = 0.01 * Math.sqrt(r2 * r / PLANET_MU[bodyNames[i]]);
          if (cand < dt) dt = cand;
          // angular-momentum-limited: dtheta/dt = h_b / r^2 <= 0.2 deg/step
          hx = s[4] * dz - s[5] * dy;
          hy = s[5] * dx - s[3] * dz;
          hz = s[3] * dy - s[4] * dx;
          h = Math.sqrt(hx * hx + hy * hy + hz * hz);
          if (h > 1e-12) {
            cand = 0.00349066 * r2 / h;
            if (cand < dt) dt = cand;
          }
        }
      }
      return dt < dtMin ? dtMin : dt;
    }

    // RK4 on state [x,y,z,vx,vy,vz]. Planet positions fixed during the step.
    var s = [pos0.x, pos0.y, pos0.z, vel0.x, vel0.y, vel0.z];
    var k1 = { x: 0, y: 0, z: 0 }, k2 = { x: 0, y: 0, z: 0 },
        k3 = { x: 0, y: 0, z: 0 }, k4 = { x: 0, y: 0, z: 0 };

    var samples = [];          // { t, pos, vel }
    var nextSample = t0;
    var t = t0;
    var steps = 0;
    // SOI bookkeeping for gravity-assist detection
    var inside = {};           // name -> { tIn, vIn }
    var assists = [];

    function soiUpdate(px, py, pz, vx, vy, vz, tNow) {
      var i, name, v2;
      v2 = vx * vx + vy * vy + vz * vz;
      for (i = 0; i < bodies.length; i++) {
        name = bodyNames[i];
        var soi = PLANET_SOI[name];
        var pb = pbCache[i];
        var dx = px - pb.x, dy = py - pb.y, dz = pz - pb.z;
        var r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (r < soi) {
          if (!inside[name]) inside[name] = { tIn: tNow, vIn: Math.sqrt(v2) };
        } else if (inside[name]) {
          assists.push({
            body: name,
            tIn: inside[name].tIn, tOut: tNow,
            vIn: inside[name].vIn, vOut: Math.sqrt(v2),
            dvKms: (Math.sqrt(v2) - inside[name].vIn) * AU_DAY_KMS
          });
          delete inside[name];
        }
      }
    }

    refreshPositions(t0);
    soiUpdate(pos0.x, pos0.y, pos0.z, vel0.x, vel0.y, vel0.z, t0);

    while (t < tEnd - 1e-9) {
      var h = Math.min(stepSize(s[0], s[1], s[2]), tEnd - t);
      refreshPositions(t);

      // k1
      accel(s[0], s[1], s[2], k1);
      var x1 = s[0] + 0.5 * h * s[3], y1 = s[1] + 0.5 * h * s[4], z1 = s[2] + 0.5 * h * s[5];
      var vx1 = s[3] + 0.5 * h * k1.x, vy1 = s[4] + 0.5 * h * k1.y, vz1 = s[5] + 0.5 * h * k1.z;
      // k2
      accel(x1, y1, z1, k2);
      var x2 = s[0] + 0.5 * h * vx1, y2 = s[1] + 0.5 * h * vy1, z2 = s[2] + 0.5 * h * vz1;
      var vx2 = s[3] + 0.5 * h * k2.x, vy2 = s[4] + 0.5 * h * k2.y, vz2 = s[5] + 0.5 * h * k2.z;
      // k3
      accel(x2, y2, z2, k3);
      var x3 = s[0] + h * vx2, y3 = s[1] + h * vy2, z3 = s[2] + h * vz2;
      var vx3 = s[3] + h * k3.x, vy3 = s[4] + h * k3.y, vz3 = s[5] + h * k3.z;
      // k4
      accel(x3, y3, z3, k4);
      s[0] += h / 6 * (s[3] + 2 * vx1 + 2 * vx2 + vx3);
      s[1] += h / 6 * (s[4] + 2 * vy1 + 2 * vy2 + vy3);
      s[2] += h / 6 * (s[5] + 2 * vz1 + 2 * vz2 + vz3);
      s[3] += h / 6 * (k1.x + 2 * k2.x + 2 * k3.x + k4.x);
      s[4] += h / 6 * (k1.y + 2 * k2.y + 2 * k3.y + k4.y);
      s[5] += h / 6 * (k1.z + 2 * k2.z + 2 * k3.z + k4.z);
      t += h;
      steps++;

      if (t >= nextSample - 1e-9) {
        samples.push({
          t: t,
          pos: V(s[0], s[1], s[2]),
          vel: V(s[3], s[4], s[5])
        });
        nextSample += sampleEvery;
        if (nextSample < t) nextSample = t + sampleEvery;
      }
      soiUpdate(s[0], s[1], s[2], s[3], s[4], s[5], t);
    }
    if (samples.length === 0 || samples[samples.length - 1].t < tEnd - 1e-9) {
      samples.push({ t: t, pos: V(s[0], s[1], s[2]), vel: V(s[3], s[4], s[5]) });
    }
    return { samples: samples, assists: assists, tEnd: t, steps: steps };
  }

  // Scan integrated samples for the first approach to destFn(t) within
  // `threshold` AU. Returns { t, pos, vel, range } or null if never that
  // close; also always reports the closest approach { tMin, minRange }.
  function findEncounter(samples, destFn, threshold) {
    var hit = null, tMin = null, minRange = Infinity;
    for (var i = 0; i < samples.length; i++) {
      var smp = samples[i];
      var d = sub(smp.pos, destFn(smp.t));
      var r = len(d);
      if (r < minRange) { minRange = r; tMin = smp.t; }
      if (r <= threshold && !hit) hit = { t: smp.t, pos: smp.pos, vel: smp.vel, range: r };
    }
    return hit ? Object.assign(hit, { tMin: tMin, minRange: minRange })
               : { hit: false, tMin: tMin, minRange: minRange };
  }

  // ------------------------------------------------------------------
  // Formatting helpers (display only)
  // ------------------------------------------------------------------
  function fmtDate(tDays) {
    var d = dateFromDays(tDays);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) +
           " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " UTC";
  }

  function fmtDuration(days) {
    if (!isFinite(days) || days < 0) return "--";
    var y = Math.floor(days / 365.25);
    var d = Math.floor(days - y * 365.25);
    var h = Math.floor((days - y * 365.25 - d) * 24);
    var m = Math.floor(((days - y * 365.25 - d) * 24 - h) * 60);
    if (y > 0) return y + "y " + d + "d";
    if (d > 0) return d + "d " + h + "h";
    if (h > 0) return h + "h " + m + "m";
    return m + "m";
  }

  function fmtDistance(au) {
    var km = au * AU_KM;
    if (km < 1e6) return Math.round(km).toLocaleString("en-US") + " km";
    if (km < 1e8) return (km / 1e6).toFixed(2) + " Mkm";
    return au.toFixed(3) + " AU";
  }

  return {
    AU_KM: AU_KM, MU_SUN: MU_SUN, AU_DAY_KMS: AU_DAY_KMS, J2000_JD: J2000_JD,
    DEG: DEG, TAU: TAU,
    V: V, add: add, sub: sub, scl: scl, dot: dot, cross: cross, len: len, unit: unit,
    ELEMENTS: ELEMENTS, PLANET_NAMES: PLANET_NAMES, MOONS: MOONS, PROBES: PROBES,
    EARTH_PROBES: EARTH_PROBES, earthProbeOffset: earthProbeOffset,
    earthProbePosition: earthProbePosition,
    daysFromUTC: daysFromUTC, dateFromDays: dateFromDays,
    elementState: elementState, planetPosition: planetPosition, planetVelocity: planetVelocity,
    mainBeltProfile: mainBeltProfile, kuiperBeltProfile: kuiperBeltProfile,
    mainBeltSample: mainBeltSample, kuiperBeltSample: kuiperBeltSample,
    moonOffset: moonOffset, moonHeliocentricPosition: moonHeliocentricPosition,
    moonHeliocentricVelocity: moonHeliocentricVelocity, destinationPosition: destinationPosition,
    probePosition: probePosition, probeVelocity: probeVelocity,
    conicFromState: conicFromState, conicPropagate: conicPropagate,
    lambert: lambert, planTransfer: planTransfer, solveTOFMatch: solveTOFMatch,
    integrateNBody: integrateNBody, findEncounter: findEncounter,
    PLANET_MU: PLANET_MU, PLANET_SOI: PLANET_SOI,
    DV_BUDGET_KMS: DV_BUDGET_KMS,
    fmtDate: fmtDate, fmtDuration: fmtDuration, fmtDistance: fmtDistance
  };
});
