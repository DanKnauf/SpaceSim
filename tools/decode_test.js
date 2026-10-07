/* Decode every texture in headless Chrome and report: decode ok?, natural dims,
 * mean color + color variance (a grey placeholder shows ~0 variance).
 * Usage: node tools/decode_test.js
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Users\\dknauf\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = path.resolve(__dirname, "..");
const PORT = 9346;
const OUT = path.join(ROOT, "tools", "shots");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (url) => (await fetch(url)).json();

const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
window.__results = {};
window.__decodeAll = function (files) {
  return new Promise(function (resolve) {
    let done = 0;
    files.forEach(function (f) {
      const img = new Image();
      img.onload = function () {
        try {
          const c = document.createElement("canvas");
          const S = 64;
          c.width = S; c.height = S;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, S, S);
          const d = ctx.getImageData(0, 0, S, S).data;
          let sr = 0, sg = 0, sb = 0;
          for (let i = 0; i < d.length; i += 4) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; }
          const n = d.length / 4;
          const mr = sr / n, mg = sg / n, mb = sb / n;
          let vr = 0, vg = 0, vb = 0;
          for (let i = 0; i < d.length; i += 4) {
            vr += (d[i] - mr) * (d[i] - mr);
            vg += (d[i + 1] - mg) * (d[i + 1] - mg);
            vb += (d[i + 2] - mb) * (d[i + 2] - mb);
          }
          const variance = Math.sqrt((vr + vg + vb) / (3 * n));
          window.__results[f] = { ok: true, w: img.naturalWidth, h: img.naturalHeight,
            mean: [Math.round(mr), Math.round(mg), Math.round(mb)], variance: Math.round(variance) };
        } catch (e) {
          window.__results[f] = { ok: true, w: img.naturalWidth, h: img.naturalHeight, err: e.message };
        }
        if (++done === files.length) resolve(window.__results);
      };
      img.onerror = function () {
        window.__results[f] = { ok: false, w: 0, h: 0 };
        if (++done === files.length) resolve(window.__results);
      };
      img.src = "textures/" + f;
    });
  });
};
</script></body></html>`;

const pagePath = path.join(OUT, "decode_page.html");
fs.writeFileSync(pagePath, html);

async function main() {
  const userData = path.join(OUT, "decode-profile-" + Date.now());
  const args = [
    "--headless=new", "--disable-gpu", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`,
    "--window-size=800,600",
    `file:///${pagePath.replace(/\\/g, "/")}`
  ];
  const chrome = spawn(CHROME, args, { windowsHide: true });
  let killed = false;
  const kill = () => { if (!killed) { killed = true; try { chrome.kill(); } catch (e) {} } };
  process.on("exit", kill);

  let target = null;
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    try {
      const list = await getJson(`http://127.0.0.1:${PORT}/json`);
      target = list.find((t) => t.type === "page" && t.url.includes("decode_page"));
      if (target) break;
    } catch (e) {}
  }
  if (!target) { console.error("FAIL: no target"); kill(); process.exit(2); }

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
  await send("Runtime.enable");

  const files = fs.readdirSync(path.join(ROOT, "textures")).sort();
  const r = await send("Runtime.evaluate", {
    expression: "window.__decodeAll(" + JSON.stringify(files) + ")",
    awaitPromise: true, returnByValue: true, timeout: 120000
  });
  const results = r.result.value;
  for (const f of files) {
    const v = results[f] || { ok: false };
    if (v.ok) {
      console.log(f.padEnd(22), (v.w + "x" + v.h).padEnd(14), "mean=" + JSON.stringify(v.mean), "variance=" + (v.variance !== undefined ? v.variance : v.err));
    } else {
      console.log(f.padEnd(22), "DECODE FAILED");
    }
  }
  ws.close();
  kill();
  await sleep(400);
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
