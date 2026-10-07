import fs from "fs";
import path from "path";
const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))), "..");
const buf = fs.readFileSync(path.join(ROOT, "favicon.ico"));
console.log("total bytes:", buf.length);
console.log("header:", buf.slice(0, 6).toString("hex"));
for (let i = 0; i < 6; i++) {
  const e = 6 + i * 16;
  const entry = buf.slice(e, e + 16);
  const w = entry[0] || 256, h = entry[1] || 256;
  const size = entry.readUInt32LE(8), off = entry.readUInt32LE(12);
  const dataStart = buf.slice(off, off + 8).toString("hex");
  console.log(`entry ${i}: ${w}x${h} size=${size} off=${off} dataHead=${dataStart}`);
}
