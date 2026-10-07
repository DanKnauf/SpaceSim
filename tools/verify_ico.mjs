// Parse favicon.ico and verify each embedded PNG (signature + dimensions).
import fs from "fs";
import path from "path";
const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))), "..");
const buf = fs.readFileSync(path.join(ROOT, "favicon.ico"));
const count = buf.readUInt16LE(4);
console.log("images:", count);
for (let i = 0; i < count; i++) {
  const e = 6 + i * 16;
  const w = buf[e] || 256, h = buf[e + 1] || 256;
  const size = buf.readUInt32LE(e + 8), off = buf.readUInt32LE(e + 12);
  const sig = buf.slice(off, off + 8).toString("hex");
  const ok = sig === "89504e470d0a1a0a";
  const dw = buf.readUInt32BE(off + 16), dh = buf.readUInt32BE(off + 20);
  console.log(`${w}x${h} dir entry, png sig ${ok ? "OK" : "BAD"}, IHDR ${dw}x${dh}, ${size} B`);
}
