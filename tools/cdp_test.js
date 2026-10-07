/* CDP test driver: launches headless Chrome, drives the app over the DevTools
 * protocol, measures real-time FPS, and captures screenshots + pixel checks.
 * Usage: node tools/cdp_test.js [caseName]   (default: jupiter)
 *   cases: jupiter | moon | neptune | system
 *
 * The app is loaded via file:// exactly the way the user double-clicks
 * index.html. Textures are embedded as data-URIs (js/textures_data.js) so
 * they upload to WebGL fine from a file:// page.
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Users\\dknauf\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = path.resolve(__dirname, "..");
const PORT = 9333;
const CASE = process.argv[2] || "jupiter";
const OUT = path.join(ROOT, "tools", "shots");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (url) => (await fetch(url)).json();

let passCount = 0, failCount = 0;
function check(name, cond, detail) {
  if (cond) { passCount++; console.log("  PASS  " + name + (detail ? "  [" + detail + "]" : "")); }
  else { failCount++; console.log("  FAIL  " + name + (detail ? "  [" + detail + "]" : "")); }
}

async function main() {
  const userData = path.join(OUT, "chrome-profile-" + Date.now());
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`,
    "--window-size=1600,900", "--hide-scrollbars",
    `file:///${path.join(ROOT, "index.html").replace(/\\/g, "/")}`
  ], { windowsHide: true });
  let killed = false;
  const kill = () => { if (!killed) { killed = true; try { chrome.kill(); } catch (e) {} } };
  process.on("exit", kill);

  let target = null;
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    try {
      const list = await getJson(`http://127.0.0.1:${PORT}/json`);
      target = list.find((t) => t.type === "page" && t.url.includes("index.html"));
      if (target) break;
    } catch (e) { /* not up yet */ }
  }
  if (!target) { console.error("FAIL: chrome devtools never came up"); kill(); process.exit(2); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let idc = 0;
  const pending = new Map();
  const send = (method, params) => new Promise((res, rej) => {
    const id = ++idc;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
    }
  };
  await new Promise((res) => { ws.onopen = res; });
  await send("Page.enable");
  await send("Runtime.enable");

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: 60000 });
    if (r.exceptionDetails) throw new Error("page exception: " + JSON.stringify(r.exceptionDetails).slice(0, 500));
    return r.result.value;
  };

  // wait for boot. The embedded 107 MB textures_data.js parse + 14 JPEG
  // decodes take a while under the headless software GL, so allow 40 s.
  for (let i = 0; i < 160; i++) {
    await sleep(250);
    const done = await evalJs(`!!(document.getElementById("loading") && document.getElementById("loading").classList.contains("done"))`).catch(() => false);
    if (done) break;
  }

  // collect page errors + inject pixel-reading helpers
  await evalJs(`(() => {
    window.__errs = [];
    const oe = console.error;
    console.error = function () { window.__errs.push("console.error: " + Array.prototype.map.call(arguments, String).join(" ")); oe.apply(console, arguments); };
    window.addEventListener("error", (e) => window.__errs.push("error: " + String(e.message)));
    window.__px = {
      grab() {
        const gl = document.querySelector("#viewport canvas");
        if (!window.__c2 || window.__c2.width !== gl.width || window.__c2.height !== gl.height) {
          window.__c2 = document.createElement("canvas");
          window.__c2.width = gl.width; window.__c2.height = gl.height;
          window.__ctx = window.__c2.getContext("2d", { willReadFrequently: true });
        }
        window.__ctx.drawImage(gl, 0, 0);
        return window.__ctx;
      },
      // max brightness in a box around (x,y)
      boxMax(x, y, r) {
        const ctx = this.grab();
        const d = ctx.getImageData(Math.max(0, x - r), Math.max(0, y - r), r * 2 + 1, r * 2 + 1).data;
        let m = 0;
        for (let i = 0; i < d.length; i += 4) m = Math.max(m, d[i], d[i + 1], d[i + 2]);
        return m;
      },
      // count pixels matching a predicate over a grid sample of the whole canvas
      count(pred, step) {
        const ctx = this.grab();
        const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
        let n = 0;
        for (let i = 0; i < img.length; i += 4 * (step || 2)) if (pred(img[i], img[i + 1], img[i + 2])) n++;
        return n;
      },
      // screen-space position of a body label anchor (planet center), viewport-relative
      labelAnchor(text) {
        const els = Array.from(document.querySelectorAll(".body-label"));
        const el = els.find(e => e.textContent.trim().toUpperCase() === text.toUpperCase());
        if (!el || el.style.display === "none") return null;
        const vp = document.getElementById("viewport").getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - vp.left, y: r.bottom - vp.top + 10, visible: true };
      }
    };
    return true;
  })()`);

  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, Buffer.from(r.data, "base64"));
    console.log("  SHOT  " + file);
  };

  const S = (expr) => evalJs(`(() => { window.__errs = window.__errs || []; const m = ${expr}; return m; })()`);

  // ============================================================
  console.log("== SYSTEM VIEW CHECKS ==");
  const boot = await evalJs(`({
    simDays: window.__SPACESIM__ ? window.__SPACESIM__.simDays : null,
    status: document.getElementById("loadstatus").textContent,
    tex: window.__TEX_STATUS__ || null,
    probeErrs: window.__TEX_PROBE_ERRS__ || []
  })`);
  console.log("  BOOT  " + JSON.stringify(boot));
  check("textures loaded", /NOMINAL/.test(boot.status), boot.status + (boot.probeErrs.length ? "  probeErrs=" + JSON.stringify(boot.probeErrs) : ""));

  const nonBlack = await evalJs(`window.__px.count((r,g,b) => (r+g+b) > 30, 4)`);
  check("canvas renders scene (not black)", nonBlack > 500, "lit pixels sampled=" + nonBlack);

  const stars = await evalJs(`window.__px.count((r,g,b) => (r+g+b) > 25 && (r+g+b) < 400, 4)`);
  check("starfield visible", stars > 100, "star-like pixels=" + stars);

  // capture label anchors while labels are ON (label dot sits at the body center)
  const anchor = async (name) => evalJs(`window.__px.labelAnchor("${name}")`);
  const anchors = {};
  for (const name of ["SOL", "MERCURY", "VENUS", "EARTH", "MARS", "JUPITER", "SATURN", "URANUS", "NEPTUNE"]) {
    anchors[name] = await anchor(name);
    check(name + " label present in system view", !!anchors[name]);
  }

  // belt geometry: both belts must lie in the ecliptic plane (scene y =
  // height). The axis-mapping regression made the main belt a VERTICAL
  // flipping ring (max |y| ~ 3.4 AU); a flat disk stays well below 0.7.
  const beltY = await evalJs(`(() => ({ main: window.__SPACESIM__.beltYMax("main"), kuiper: window.__SPACESIM__.beltYMax("kuiper") }))()`);
  check("main belt lies in ecliptic plane", beltY.main < 0.7, "max |y|=" + beltY.main.toFixed(2) + " AU");
  check("kuiper belt lies in ecliptic plane", beltY.kuiper < 18, "max |y|=" + beltY.kuiper.toFixed(1) + " AU");
  // Pluto is a first-class destination now
  const hasPlutoDest = await evalJs(`Array.from(document.querySelectorAll("#destlist .dest-item")).some(e => /pluto/i.test(e.textContent))`);
  check("Pluto listed as destination", hasPlutoDest);

  const setLabels = (on) => evalJs(`(() => { const t = document.getElementById("tog-labels"); t.checked = ${on}; t.dispatchEvent(new Event("change")); return true; })()`);
  const vpCenter = async () => {
    const v = await evalJs(`(() => { const e = document.getElementById("viewport"); return { x: e.clientWidth / 2 | 0, y: e.clientHeight / 2 | 0 }; })()`);
    return v;
  };

  // sun: corona sprite spans ~9 scene units, so it is still visible in system view
  if (anchors.SOL) {
    const c = await vpCenter();
    const sunB = await evalJs(`window.__px.boxMax(${anchors.SOL.x | 0}, ${anchors.SOL.y | 0}, 12)`);
    // threshold 100: photosphere texture brightness varies with sun rotation (sunspots/granulation)
    check("sun bright at SOL anchor", sunB > 100, "max brightness=" + sunB);
  }
  // planets are sub-pixel in full-system view: verify rendering in closeup per body
  for (const [name, id] of [["MERCURY", "mercury"], ["EARTH", "earth"], ["JUPITER", "jupiter"], ["SATURN", "saturn"], ["NEPTUNE", "neptune"], ["PLUTO", "pluto"]]) {
    await evalJs(`window.__SPACESIM__.focus("${id}"); "ok"`);
    await sleep(1400);
    await setLabels(false);
    await sleep(200);
    const c = await vpCenter(); // focused body sits at viewport center
    const b = await evalJs(`window.__px.boxMax(${c.x}, ${c.y}, 10)`);
    await setLabels(true);
    check(name + " planet pixels in closeup", b > 45, "max brightness=" + b);
    await evalJs(`window.__SPACESIM__.resetView(); "ok"`);
    await sleep(1250);
  }

  // asteroid belt: count dim mid-tone pixels in a radial band, belt on vs off
  const beltOn = await evalJs(`window.__px.count((r,g,b) => (r+g+b) > 45 && (r+g+b) < 220, 2)`);
  await evalJs(`(() => { const t = document.getElementById("tog-belt"); t.checked = false; t.dispatchEvent(new Event("change")); return true; })()`);
  await sleep(300);
  const beltOff = await evalJs(`window.__px.count((r,g,b) => (r+g+b) > 45 && (r+g+b) < 220, 2)`);
  await evalJs(`(() => { const t = document.getElementById("tog-belt"); t.checked = true; t.dispatchEvent(new Event("change")); return true; })()`);
  await sleep(300);
  check("asteroid belt renders (on>off)", beltOn > beltOff, `on=${beltOn} off=${beltOff}`);

  // zoom slider: far end reaches ~400 AU, near end goes close-up, readout tracks
  const camDist = async () => evalJs(`(() => { const c = window.__SPACESIM__.camInfo(); const d = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]); return d(c.cam, c.target); })()`);
  await evalJs(`(() => { const s = document.getElementById("zoomslider"); s.value = 1000; s.dispatchEvent(new Event("input")); return true; })()`);
  await sleep(300);
  const distFar = await camDist();
  const readFar = await evalJs(`document.getElementById("zoomread").textContent`);
  check("zoom slider reaches 400 AU", distFar > 3000 && /400 AU/.test(readFar), `d=${distFar.toFixed(0)} read=${readFar}`);
  await evalJs(`(() => { const s = document.getElementById("zoomslider"); s.value = 0; s.dispatchEvent(new Event("input")); return true; })()`);
  await sleep(300);
  const distNear = await camDist();
  check("zoom slider close-up", distNear < 0.05, `d=${distNear}`);
  await evalJs(`window.__SPACESIM__.resetView(); "ok"`);
  await sleep(1300);

  await shot("01_system_view");

  const fpsBase = await evalJs(`new Promise(r => { const t0 = performance.now(); let n = 0; function f(){ n++; if (performance.now()-t0 < 3000) requestAnimationFrame(f); else r((n/3).toFixed(1)); } requestAnimationFrame(f); })`);
  console.log("  FPS   system view (software GL): " + fpsBase);

  // ============================================================
  if (CASE === "jupiter" || CASE === "system") {
    console.log("== JUPITER MISSION CHECKS ==");
    await evalJs(`window.__SPACESIM__.startMission("jupiter"); "ok"`);
    await sleep(500);
    const m = await evalJs(`(() => { const m = window.__SPACESIM__.mission; return m ? { dest: m.destName, tof: m.plan.TOF, dv: m.plan.dV_kms, e: m.plan.e, ballistic: m.isBallistic, arrival: document.getElementById("st-arrival").textContent } : null; })()`);
    console.log("  PLAN  " + JSON.stringify(m));
    check("mission planned", !!m && m.dest === "Jupiter");
    check("TOF plausible (2-4 y)", m && m.tof > 650 && m.tof < 1500, m && m.tof.toFixed(0) + " d");
    check("dV plausible (7-13 km/s)", m && m.dv > 7 && m.dv < 13, m && m.dv.toFixed(2));
    check("e plausible (0.5-0.8)", m && m.e > 0.5 && m.e < 0.8, m && m.e.toFixed(3));

    // scan for the cyan trajectory with labels hidden (label dots are also cyan-ish)
    await evalJs(`(() => { const t = document.getElementById("tog-labels"); t.checked = false; t.dispatchEvent(new Event("change")); return true; })()`);
    await sleep(300);
    const li = await evalJs(`window.__SPACESIM__.lineInfo()`);
    const ls = await evalJs(`window.__SPACESIM__.linePixelScore()`);
    console.log("  LINE  " + JSON.stringify(li) + "  score=" + JSON.stringify(ls));
    check("trajectory dotted line visible", ls && ls.matched > 40, "matched=" + (ls && ls.matched) + " maxB=" + (ls && ls.maxB));
    await evalJs(`(() => { const t = document.getElementById("tog-labels"); t.checked = true; t.dispatchEvent(new Event("change")); return true; })()`);
    await sleep(200);

    await evalJs(`(() => { const m = window.__SPACESIM__.mission; window.__SPACESIM__.seek(m.plan.tLaunch + m.plan.TOF * 0.35); return true; })()`);
    await sleep(400);
    const mid = await evalJs(`({ status: document.getElementById("st-status").textContent, vel: document.getElementById("st-vel").textContent, ttt: document.getElementById("st-ttt").textContent, range: document.getElementById("st-range").textContent })`);
    console.log("  MID   " + JSON.stringify(mid));
    check("status EN ROUTE", mid.status === "EN ROUTE");
    check("velocity non-trivial", parseFloat(mid.vel) > 5, mid.vel);
    await shot("02_jupiter_midflight");

    // follow destination is a toggle: engage, then release
    await evalJs(`document.getElementById("btn-follow-dest").click(); "ok"`);
    await sleep(1600);
    const fOn = await evalJs(`window.__SPACESIM__.camInfo().follow`);
    check("follow destination engages", fOn === "jupiter", "follow=" + fOn);
    await evalJs(`document.getElementById("btn-follow-dest").click(); "ok"`);
    await sleep(400);
    const fOff = await evalJs(`window.__SPACESIM__.camInfo().follow`);
    check("follow destination releases (toggle)", fOff === null, "follow=" + fOff);

    // (re)follow the rocket for the sprite check and shot
    await evalJs(`window.__SPACESIM__.followRocket(true); "ok"`);
    await sleep(1600);
    const rl = await evalJs(`window.__px.labelAnchor("ROCKET")`);
    if (rl) {
      await evalJs(`(() => { const t = document.getElementById("tog-labels"); t.checked = false; t.dispatchEvent(new Event("change")); return true; })()`);
      await sleep(200);
      const rb = await evalJs(`window.__px.boxMax(${rl.x | 0}, ${rl.y | 0}, 5)`);
      await evalJs(`(() => { const t = document.getElementById("tog-labels"); t.checked = true; t.dispatchEvent(new Event("change")); return true; })()`);
      check("rocket sprite visible", rb > 100, "brightness=" + rb);
    } else check("rocket label visible", false);

    await shot("04_follow_rocket");
    const fpsFollow = await evalJs(`new Promise(r => { const t0 = performance.now(); let n = 0; function f(){ n++; if (performance.now()-t0 < 3000) requestAnimationFrame(f); else r((n/3).toFixed(1)); } requestAnimationFrame(f); })`);
    console.log("  FPS   follow rocket @1 d/s: " + fpsFollow);
    await evalJs(`window.__SPACESIM__.setWarp(365); "ok"`);
    await sleep(400);
    const fpsWarp = await evalJs(`new Promise(r => { const t0 = performance.now(); let n = 0; function f(){ n++; if (performance.now()-t0 < 3000) requestAnimationFrame(f); else r((n/3).toFixed(1)); } requestAnimationFrame(f); })`);
    console.log("  FPS   follow rocket @365 d/s: " + fpsWarp);

    await evalJs(`window.__SPACESIM__.seek(window.__SPACESIM__.mission.plan.tArrival + 60); "ok"`);
    await sleep(400);
    const post = await evalJs(`document.getElementById("st-status").textContent`);
    check("coasting after arrival", post.indexOf("COASTING") === 0, post);
  }

  // ============================================================
  if (CASE === "system") {
    console.log("== PROBE CHECKS (Voyagers + Earth probes) ==");
    // focus each probe: camera flies to it, label becomes visible, model renders
    for (const [label, id] of [
      ["VOYAGER 1", "voyager1"], ["VOYAGER 2", "voyager2"],
      ["HUBBLE SPACE TELESCOPE", "hubble"], ["JAMES WEBB SPACE TELESCOPE", "jwst"],
    ]) {
      await evalJs(`window.__SPACESIM__.focus("${id}"); "ok"`);
      await sleep(1400);
      const a = await anchor(label);
      check(label + " label visible on focus", !!a);
      if (a) {
        await setLabels(false);
        await sleep(200);
        const b = await evalJs(`window.__px.boxMax(${a.x | 0}, ${a.y | 0}, 8)`);
        await setLabels(true);
        check(label + " renders", b > 25, "max brightness=" + b);
      }
      await evalJs(`window.__SPACESIM__.resetView(); "ok"`);
      await sleep(1250);
    }
    // planner: co-orbital ballistic transfers to the Earth probes.
    // The jupiter FPS check left the rate at 365 d/s — restore 1 d/s, then
    // seek back before the Jupiter mission's launch so startMission plans
    // from Earth (otherwise it retargets from the rocket's mid-space state).
    await evalJs(`window.__SPACESIM__.setWarp(1); "ok"`);
    const pre = await evalJs(`JSON.stringify({ sim: +window.__SPACESIM__.simDays.toFixed(2), dest: window.__SPACESIM__.mission ? window.__SPACESIM__.mission.destId : null, tLaunch: window.__SPACESIM__.mission ? +window.__SPACESIM__.mission.tLaunch.toFixed(2) : null })`);
    console.log("  PRE-SEEK  " + pre);
    await evalJs(`window.__SPACESIM__.seek(window.__SPACESIM__.mission.plan.tLaunch - 1); "ok"`);
    await sleep(400);
    const post = await evalJs(`+window.__SPACESIM__.simDays.toFixed(3)`);
    console.log("  POST-SEEK simDays=" + post);
    await evalJs(`window.__SPACESIM__.startMission("hubble"); "ok"`);
    await sleep(700);
    const mh = await evalJs(`(() => { const m = window.__SPACESIM__.mission; return m ? { dest: m.destName, tof: m.plan.TOF, dv: m.plan.dV_kms, ballistic: m.isBallistic, tLaunch: +m.tLaunch.toFixed(2), r0: [m.r0.x, m.r0.y, m.r0.z].map(v => +v.toExponential(3)) } : null; })()`);
    console.log("  PLAN  " + JSON.stringify(mh));
    check("hubble mission planned (ballistic)", mh && mh.ballistic === true, mh && mh.dest);
    check("hubble TOF 0.3-2 d", mh && mh.tof > 0.3 && mh.tof < 2, mh && mh.tof.toFixed(2) + " d");
    check("hubble dV < 1 km/s", mh && mh.dv < 1, mh && mh.dv.toFixed(2));
    await evalJs(`window.__SPACESIM__.startMission("jwst"); "ok"`);
    await sleep(700);
    const mj = await evalJs(`(() => { const m = window.__SPACESIM__.mission; return m ? { dest: m.destName, tof: m.plan.TOF, dv: m.plan.dV_kms, ballistic: m.isBallistic } : null; })()`);
    console.log("  PLAN  " + JSON.stringify(mj));
    check("jwst mission planned (ballistic)", mj && mj.ballistic === true, mj && mj.dest);
    check("jwst TOF 2-12 d", mj && mj.tof > 2 && mj.tof < 12, mj && mj.tof.toFixed(1) + " d");
    check("jwst dV < 5.5 km/s", mj && mj.dv < 5.5, mj && mj.dv.toFixed(2));

    // Pluto: full outer-system transfer (planner smoke test)
    await evalJs(`window.__SPACESIM__.startMission("pluto"); "ok"`);
    await sleep(1500);
    const mp = await evalJs(`(() => { const m = window.__SPACESIM__.mission; return m ? { dest: m.destName, tof: m.plan.TOF, dv: m.plan.dV_kms, e: m.plan.e } : null; })()`);
    console.log("  PLAN  " + JSON.stringify(mp));
    check("pluto mission planned", mp && mp.dest === "Pluto", mp && mp.dest);
    check("pluto TOF 5-330 y", mp && mp.tof > 1800 && mp.tof < 120000, mp && (mp.tof / 365.25).toFixed(0) + " y");
    check("pluto dV far over 6 km/s budget", mp && mp.dv > 8, mp && mp.dv.toFixed(2) + " km/s");
  }

  // ============================================================
  if (CASE === "moon") {
    console.log("== MOON MISSION CHECKS ==");
    await evalJs(`window.__SPACESIM__.startMission("moon"); "ok"`);
    await sleep(500);
    const m = await evalJs(`(() => { const m = window.__SPACESIM__.mission; return m ? { dest: m.destName, tof: m.plan.TOF, dv: m.plan.dV_kms, ballistic: m.isBallistic, orbit: document.getElementById("st-orbit").textContent } : null; })()`);
    console.log("  PLAN  " + JSON.stringify(m));
    check("moon mission ballistic", m && m.ballistic === true);
    check("orbit shows BALLISTIC", m && /BALLISTIC/.test(m.orbit), m && m.orbit);
    check("TOF ~1.5-2 days (3 km/s)", m && m.tof > 1.2 && m.tof < 2.2, m && m.tof.toFixed(2) + " d");
    await evalJs(`window.__SPACESIM__.focus("earth"); "ok"`);
    await sleep(1500);
    const ci = await evalJs(`window.__SPACESIM__.camInfo()`);
    console.log("  CAM   " + JSON.stringify(ci));
    check("camera near earth after focus", ci && ci.earthDist !== null && ci.earthDist < 1.0, "dist=" + (ci && ci.earthDist));
    // earth disk brightness (focus now biases toward the sun, so the lit face is toward us)
    const ea = await evalJs(`window.__px.labelAnchor("EARTH")`);
    if (ea) {
      await evalJs(`(() => { const t = document.getElementById("tog-labels"); t.checked = false; t.dispatchEvent(new Event("change")); return true; })()`);
      await sleep(200);
      const earthB = await evalJs(`window.__px.boxMax(${ea.x | 0}, ${ea.y | 0}, 8)`);
      await evalJs(`(() => { const t = document.getElementById("tog-labels"); t.checked = true; t.dispatchEvent(new Event("change")); return true; })()`);
      check("earth renders lit in closeup", earthB > 60, "brightness=" + earthB);
    } else check("earth anchor found", false);
    // the moon's orbital phase decides if it is in-frame; scan 12 phases (a full lunar orbit)
    // and seek to the first time where the moon projects on-screen
    const moonT = await evalJs(`(() => {
      const sim = window.__SPACESIM__;
      const w = document.getElementById("viewport").clientWidth, h = document.getElementById("viewport").clientHeight;
      for (let k = 0; k < 12; k++) {
        const t = sim.simDays + k * (27.32 / 12);
        const s = sim.moonScreenAt(t);
        if (s.z < 1 && Math.abs(s.x - w / 2) < w / 2.4 && Math.abs(s.y - h / 2) < h / 2.4) return t;
      }
      return null;
    })()`);
    if (moonT === null) {
      check("moon on-screen at some orbital phase", false);
    } else {
      await evalJs(`window.__SPACESIM__.seek(${moonT}); "ok"`);
      await sleep(300);
      const moonVis = await evalJs(`!!(window.__px.labelAnchor("MOON") && true)`);
      check("moon label visible in Earth closeup", moonVis);
    }
    await evalJs(`(() => { const m = window.__SPACESIM__.mission; window.__SPACESIM__.seek(m.plan.tLaunch + m.plan.TOF * 0.6); return true; })()`);
    await sleep(300);
    await shot("05_moon_transfer");
  }

  // ============================================================
  if (CASE === "neptune") {
    console.log("== NEPTUNE MISSION CHECKS ==");
    await evalJs(`window.__SPACESIM__.startMission("neptune"); "ok"`);
    await sleep(700);
    const m = await evalJs(`(() => { const m = window.__SPACESIM__.mission; return m ? { dest: m.destName, tof: m.plan.TOF, dv: m.plan.dV_kms, e: m.plan.e } : null; })()`);
    console.log("  PLAN  " + JSON.stringify(m));
    // min-dV single-impulse transfer to Neptune is ~12.4 km/s on the long arc
    // with TOF ~90-105 y (geometry-dependent; Neptune synodic period ~165 y)
    check("neptune TOF ~85-115 y", m && m.tof > 31000 && m.tof < 42000, m && (m.tof / 365.25).toFixed(0) + " y");
    check("dV far over 6 km/s budget", m && m.dv > 11.5, m && m.dv.toFixed(2) + " km/s");
    const dvEl = await evalJs(`(() => { const e = document.getElementById("st-dv"); return e.textContent + "|" + e.className; })()`);
    check("stats flag over-budget dV (warn style)", /⚠/.test(dvEl) && /warn/.test(dvEl), dvEl);
    await evalJs(`(() => { const t = document.getElementById("tog-labels"); t.checked = false; t.dispatchEvent(new Event("change")); return true; })()`);
    await sleep(300);
    const ls = await evalJs(`window.__SPACESIM__.linePixelScore()`);
    await evalJs(`(() => { const t = document.getElementById("tog-labels"); t.checked = true; t.dispatchEvent(new Event("change")); return true; })()`);
    check("long trajectory visible", ls && ls.matched > 40, "matched=" + (ls && ls.matched) + " maxB=" + (ls && ls.maxB));
    await shot("06_neptune_trajectory");
  }

  const errs = await evalJs(`(window.__errs || [])`);
  const pageErrs = errs.filter((e) => typeof e === "string");
  check("no page errors", pageErrs.length === 0, pageErrs.slice(0, 3).join(" | "));

  ws.close();
  kill();
  console.log(`\nRESULT: ${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
