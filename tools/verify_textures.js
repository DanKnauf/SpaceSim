/* One-off visual check: confirm the planets show real texture detail
 * (high on-disk color diversity) rather than flat fallback colors.
 * A flat base color under lighting yields only a brightness gradient of a
 * single hue; a real 8k map yields hundreds of distinct quantized colors.
 * Usage: node tools/verify_textures.js
 */
"use strict";
const { spawn } = require("child_process");
const path = require("path");

const CHROME = "C:\\Users\\dknauf\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = path.resolve(__dirname, "..");
const PORT = 9334;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (url) => (await fetch(url)).json();

async function main() {
  const userData = path.join(ROOT, "tools", "shots", "chrome-verify-" + Date.now());
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
    if (r.exceptionDetails) throw new Error("page exception: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  };

  for (let i = 0; i < 160; i++) {
    await sleep(250);
    const done = await evalJs(`!!(document.getElementById("loading") && document.getElementById("loading").classList.contains("done"))`).catch(() => false);
    if (done) break;
  }

  const boot = await evalJs(`({ status: document.getElementById("loadstatus").textContent, tex: window.__TEX_STATUS__ || null })`);
  console.log("  BOOT  " + boot.status + "  ok=" + Object.values(boot.tex).filter((v) => v === "ok").length + "/" + Object.keys(boot.tex).length);

  // hide labels so only planet pixels are sampled
  await evalJs(`(() => { const t = document.getElementById("tog-labels"); if (t) { t.checked = false; t.dispatchEvent(new Event("change")); } return true; })()`);
  await sleep(300);

  const center = await evalJs(`({ x: innerWidth / 2, y: innerHeight / 2 })`);

  // distinct quantized colors (4 bits/channel) + brightness stddev in a box
  // around the focused body
  const diversity = async () => evalJs(`(() => {
    const gl = document.querySelector("#viewport canvas");
    if (!window.__c2 || window.__c2.width !== gl.width || window.__c2.height !== gl.height) {
      window.__c2 = document.createElement("canvas");
      window.__c2.width = gl.width; window.__c2.height = gl.height;
      window.__ctx = window.__c2.getContext("2d", { willReadFrequently: true });
    }
    window.__ctx.drawImage(gl, 0, 0);
    const R = 46;
    const x = ${center.x} - R, y = ${center.y} - R;
    const d = window.__ctx.getImageData(x, y, R * 2, R * 2).data;
    const seen = new Set();
    let n = 0, s = 0, s2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const b = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (b < 8) continue; // skip space
      n++; s += b; s2 += b * b;
      seen.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4));
    }
    const mean = s / n;
    return { distinct: seen.size, lit: n, stddev: Math.sqrt(Math.max(0, s2 / n - mean * mean)).toFixed(1) };
  })()`);

  for (const id of ["jupiter", "earth", "saturn", "mars"]) {
    await evalJs(`window.__SPACESIM__.focus("${id}"); "ok"`);
    await sleep(1600);
    await sleep(300); // let the follow tween settle
    const dv = await diversity();
    // real texture: hundreds of distinct colors; flat fallback: a single
    // hue brightness gradient -> typically < 50 distinct quantized colors
    const ok = dv.distinct > 80;
    console.log("  " + (ok ? "PASS " : "FAIL ") + id + "  distinct=" + dv.distinct + "  litpx=" + dv.lit + "  brightnessStd=" + dv.stddev);
    await evalJs(`window.__SPACESIM__.resetView(); "ok"`);
    await sleep(1300);
  }

  ws.close();
  kill();
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
