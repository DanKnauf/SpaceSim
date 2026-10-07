/* One-off debug: inspect the trajectory line state and pixels around it. */
"use strict";
const { spawn } = require("child_process");
const path = require("path");
const CHROME = "C:\\Users\\dknauf\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = path.resolve(__dirname, "..");
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (url) => (await fetch(url)).json();

async function main() {
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(__dirname, "shots", "dbg-profile")}`,
    "--window-size=1600,900",
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
  let idc = 0; const pending = new Map();
  const send = (method, params) => new Promise((res, rej) => {
    const id = ++idc; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
    }
  };
  await new Promise((res) => { ws.onopen = res; });
  await send("Runtime.enable");
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: 60000 });
    if (r.exceptionDetails) throw new Error("exc: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  };
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    if (await evalJs(`!!document.getElementById("loading").classList.contains("done")`).catch(() => false)) break;
  }

  await evalJs(`window.__SPACESIM__.startMission("jupiter"); "ok"`);
  await sleep(800);
  const info = await evalJs(`window.__SPACESIM__.lineInfo()`);
  console.log("LINE INFO:", JSON.stringify(info, null, 2));

  if (info && info.midScreen) {
    const x = Math.max(0, Math.round(info.midScreen.x) - 20);
    const y = Math.max(0, Math.round(info.midScreen.y) - 20);
    const px = await evalJs(`window.__SPACESIM__.rawPixels(${x}, ${y}, 40, 40)`);
    // print rows: for each row, list columns where brightness>40
    for (let row = 0; row < 40; row++) {
      let s = "";
      for (let col = 0; col < 40; col++) {
        const i = (row * 40 + col) * 4;
        const b = px[i] + px[i + 1] + px[i + 2];
        s += b > 120 ? "#" : b > 60 ? "+" : b > 30 ? "." : " ";
      }
      console.log(s);
    }
    // brightest pixel in the window
    let best = 0, bi = 0;
    for (let i = 0; i < px.length; i += 4) {
      const b = px[i] + px[i + 1] + px[i + 2];
      if (b > best) { best = b; bi = i; }
    }
    console.log("brightest in window:", px.slice(bi, bi + 4), "sum", best);
  }
  ws.close(); kill(); process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
