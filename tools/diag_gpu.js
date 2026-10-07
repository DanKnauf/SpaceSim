/* Diagnostics: launch Chrome with the GPU (no --disable-gpu, no swiftshader),
 * load index.html, capture every console message + page exception, and report
 * whether the loading overlay ever dismisses. Mimics the user's real browser.
 * Usage: node tools/diag_gpu.js
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Users\\dknauf\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = path.resolve(__dirname, "..");
const PORT = 9344;
const OUT = path.join(ROOT, "tools", "shots");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (url) => (await fetch(url)).json();

async function main() {
  const userData = path.join(OUT, "diag-profile-" + Date.now());
  const args = [
    "--headless=new",
    // NOTE: deliberately NO --disable-gpu / --enable-unsafe-swiftshader,
    // so Chrome uses the real GPU path like the user's browser.
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`,
    "--window-size=1600,900", "--hide-scrollbars",
    `file:///${path.join(ROOT, "index.html").replace(/\\/g, "/")}`
  ];
  console.log("Launching Chrome with GPU:\n  " + args.join(" "));
  const chrome = spawn(CHROME, args, { windowsHide: true });
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
  const consoleMsgs = [];
  const exceptions = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
    } else if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params.args || []).map((a) => a.value !== undefined ? a.value : (a.description || a.unserializableValue || "")).join(" ");
      consoleMsgs.push(`[${msg.params.type}] ${text}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      const txt = d.exception && d.exception.description ? d.exception.description : (d.text + " " + JSON.stringify(d.exception || {}).slice(0, 400));
      exceptions.push(txt);
    }
  };
  await new Promise((res) => { ws.onopen = res; });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");

  // poll loader state for up to 20s
  let loaderDone = false, loaderStatus = "", webglOk = null, rendererInfo = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const r = await send("Runtime.evaluate", {
        expression: `(() => {
          const loading = document.getElementById("loading");
          const st = document.getElementById("loadstatus");
          const glc = document.querySelector("#viewport canvas");
          let webgl = null, info = null;
          try {
            const c = document.createElement("canvas");
            const g2 = c.getContext("webgl2") || c.getContext("webgl");
            webgl = g2 ? (g2.getParameter(g2.VERSION) + " | " + g2.getParameter(g2.RENDERER)) : "NO WEBGL CONTEXT";
            const dbg = g2 && g2.getExtension("WEBGL_debug_renderer_info");
            if (dbg) info = g2.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
          } catch (e) { webgl = "ERR " + e.message; }
          return {
            loaderDone: !!(loading && loading.classList.contains("done")),
            loaderStatus: st ? st.textContent : null,
            webgl: webgl,
            renderer: info,
            hasCanvas: !!glc,
            canvasSize: glc ? (glc.width + "x" + glc.height) : null
          };
        })()`,
        returnByValue: true
      });
      const v = r.result.value;
      loaderDone = v.loaderDone; loaderStatus = v.loaderStatus;
      webglOk = v.webgl; rendererInfo = v.renderer;
      if (v.hasCanvas) {
        const cs = v.canvasSize;
        console.log(`  t=${(i * 0.5).toFixed(1)}s loaderDone=${v.loaderDone} status="${v.loaderStatus}" canvas=${cs}`);
      } else {
        console.log(`  t=${(i * 0.5).toFixed(1)}s loaderDone=${v.loaderDone} status="${v.loaderStatus}" NO-CANVAS (renderer not created)`);
      }
      if (v.loaderDone) break;
    } catch (e) {
      console.log(`  t=${(i * 0.5).toFixed(1)}s eval error: ${e.message}`);
    }
  }

  // capture a screenshot of whatever state we're in
  try {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, "diag_gpu.png"), Buffer.from(shot.data, "base64"));
    console.log("  SHOT  diag_gpu.png");
  } catch (e) { console.log("  shot failed: " + e.message); }

  console.log("\n== WEBGL REPORT ==");
  console.log("  context: " + webglOk);
  console.log("  unmasked renderer: " + rendererInfo);
  console.log("  loader dismissed: " + loaderDone + "  (final status: " + loaderStatus + ")");

  console.log("\n== CONSOLE MESSAGES (" + consoleMsgs.length + ") ==");
  consoleMsgs.slice(0, 40).forEach((m) => console.log("  " + m));

  console.log("\n== PAGE EXCEPTIONS (" + exceptions.length + ") ==");
  exceptions.slice(0, 10).forEach((e) => console.log("  " + e.slice(0, 1000)));

  ws.close();
  kill();
  // give chrome a moment to flush, then remove the diag profile
  await sleep(500);
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
