/* Temporary probe: dump moonScreenAt geometry after focus("earth") */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Users\\dknauf\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = path.resolve(__dirname, "..");
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (url) => (await fetch(url)).json();

async function main() {
  const userData = path.join(__dirname, "shots", "chrome-profile-probe-" + Date.now());
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
    } catch (e) {}
  }
  if (!target) { console.error("no target"); kill(); process.exit(2); }
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
    if (r.exceptionDetails) throw new Error("page exception: " + JSON.stringify(r.exceptionDetails).slice(0, 800));
    return r.result.value;
  };
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    const done = await evalJs(`!!(document.getElementById("loading") && document.getElementById("loading").classList.contains("done"))`).catch(() => false);
    if (done) break;
  }

  await evalJs(`window.__SPACESIM__.focus("earth"); "ok"`);
  await sleep(1600);

  const out = await evalJs(`(() => {
    const sim = window.__SPACESIM__;
    const vp = document.getElementById("viewport");
    const w = vp.clientWidth, h = vp.clientHeight;
    const ci = sim.camInfo();
    const res = [];
    for (let k = 0; k < 12; k++) {
      const t = sim.simDays + k * (27.32 / 12);
      const s = sim.moonScreenAt(t);
      res.push({ k: k, t: +t.toFixed(2), x: +s.x.toFixed(1), y: +s.y.toFixed(1), z: +s.z.toFixed(3) });
    }
    return { w: w, h: h, simDays: +sim.simDays.toFixed(2), ci: ci, res: res };
  })()`);
  console.log(JSON.stringify(out, null, 1));
  kill();
  ws.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
