// Report width/height of every file in textures/ by parsing the header
// (PNG IHDR or JPEG SOF). Flags anything under 2048 px.
import fs from "fs";
import path from "path";
const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))), "..");
const dir = path.join(ROOT, "textures");

function jpegSize(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let off = 2;
  while (off < buf.length - 9) {
    if (buf[off] !== 0xFF) { off++; continue; }
    const marker = buf[off + 1];
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
    }
    const len = buf.readUInt16BE(off + 2);
    off += 2 + len;
  }
  return null;
}

for (const f of fs.readdirSync(dir).sort()) {
  const p = path.join(dir, f);
  const buf = fs.readFileSync(p);
  let dims = null, kind = "";
  if (buf[0] === 0x89 && buf[1] === 0x50) { kind = "PNG"; dims = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
  else if (buf[0] === 0xFF && buf[1] === 0xD8) { kind = "JPEG"; dims = jpegSize(buf); }
  else { kind = "??"; }
  const mb = (buf.length / 1048576).toFixed(1);
  const flag = dims && Math.min(dims.w, dims.h) < 2048 ? "  <-- SMALL" : "";
  console.log(f.padEnd(24), kind.padEnd(5), dims ? dims.w + "x" + dims.h : "UNPARSEABLE", mb + " MB" + flag);
}
