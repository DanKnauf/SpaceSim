# SpaceSim — Heliocentric Mission Planner

A fully local, browser-based 3D solar-system simulator and rocket mission planner.
No server, no network, no build step: **open `index.html` in Chrome and fly.**

## Run

```
index.html        (double-click, or open in Chrome)
```

All assets are local: `lib/three.min.js` (vendored Three.js + OrbitControls),
`js/physics.js` (pure-JS orbital mechanics core), `js/app.js` (UI + 3D scene),
`textures/` (planetary maps), `css/style.css`.

## Features

- Full solar system: Sun, 8 planets, major moons (incl. Earth's Moon),
  asteroid + Kuiper belts, 3,500-star skybox with milky-way band.
- Planets orbit the Sun and spin on their axes in scaled real time; moons
  orbit their parents. Orbits drawn as thin white lines (toggleable).
- **Mission planner**: pick any destination in the searchable box; the app
  solves a heliocentric Lambert transfer (min-ΔV over both short and long arc
  families) and animates the rocket along the trajectory.
  - Stats panel: velocity, time to target, range, flight time, arrival date,
    departure ΔV (flagged ⚠ when over the 6 km/s "modern rocket" budget),
    transfer-orbit eccentricity.
  - Dotted trajectory line, toggleable. The rocket **coasts past** the target
    — there is no landing mode.
  - Earth→Moon uses a co-orbital ballistic model (3 km/s cruise).
- Camera: drag to orbit, wheel to zoom, right-drag to pan, click any body to
  focus/follow, "FOLLOW ROCKET" / "RESET VIEW" buttons, F key to follow.
- Time warp: pause + slider + presets from 1 h/s up to 10 y/s (Space = pause).
- Toggles: trajectory, orbit lines, labels, asteroid belt.

## Physics

`js/physics.js` — units: AU / days / AU·day⁻¹, heliocentric ecliptic J2000.

- Planetary ephemerides: JPL Keplerian elements (Standish, valid 1800–2050).
- Moon: analytic ephemeris (ELP2000-approximation terms), verified within
  75,000 km of a reference ephemeris.
- Transfers: conic-parameter Lambert solver (elliptic / parabolic / hyperbolic,
  short + long arc), TOF fixed-point iteration against the moving destination,
  min-ΔV scan (log grid + golden-section polish).
- Verification: `node test/test_physics.js` (54 checks, incl. positions vs
  astronomy-engine and Lambert round-trips).

## Display scaling (what is real, what is stretched)

- **Orbits are to scale** (1 AU = 10 scene units).
- **Body sizes are exaggerated** (√-scaled from real radii) so planets are
  visible; at true scale they'd be sub-pixel. Moon orbit radius is exaggerated
  similarly (~36×) so it doesn't hide inside Earth's sprite.
- Velocities, flight times, ΔV, arrival dates are real.

## Testing

```
node test\test_physics.js        # physics unit tests (Node)
node tools\cdp_test.js system    # browser E2E: system view (needs Chrome)
node tools\cdp_test.js jupiter   # E2E: Jupiter mission flight
node tools\cdp_test.js neptune   # E2E: Neptune mission (over-budget ΔV)
node tools\cdp_test.js moon      # E2E: Moon ballistic + moon geometry
```

`cdp_test.js` drives a headless Chrome via the DevTools Protocol; it samples
the rendered canvas pixels (labels, planets, belts, trajectory) and asserts on
the mission plan. Screenshots land in `tools/shots/`.

Other tools: `tools/probe_moon.js` (moon screen-position probe),
`tools/verify_neptune.js` (dV-vs-TOF envelope scan).

## Known simplifications

- Two-body heliocentric model (no planetary gravity assists, no thrust
  profiles — a single departure impulse per transfer).
- Moon ephemeris is analytic, not full ELP2000.
- Element sets are valid 1800–2050; long warps extrapolate Keplerian orbits.
