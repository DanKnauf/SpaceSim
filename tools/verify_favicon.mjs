// Decode favicon.png (no deps) and sample key pixels to verify the badge,
// rocket body, nose, banding, flame, and transparency.
import fs from "fs";
import path from "path";
import zlib from "zlib";

const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))), "..");
const buf = fs.readFileSync(path.join(ROOT, "favicon.png"));

// parse chunks
let off = 8, w = 0, h = 0, idat = [];
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.slice(off + 4, off + 8).toString("ascii");
  const data = buf.slice(off + 8, off + 8 + len);
  if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
  if (type === "IDAT") idat.push(data);
  off += 12 + len;
}
const raw = zlib.inflateSync(Buffer.concat(idat));
const px = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
  const row = y * (w * 4 + 1), f = raw[row];
  if (f !== 0) throw new Error("unsupported filter " + f + " (encoder only writes 0)");
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, s = row + 1 + x * 4;
    px[i] = raw[s]; px[i + 1] = raw[s + 1]; px[i + 2] = raw[s + 2]; px[i + 3] = raw[s + 3];
  }
}
console.log(`PNG ${w}x${h}`);
const at = (x, y) => { const i = (y * w + x) * 4; return `rgba(${px[i]},${px[i + 1]},${px[i + 2]},${(px[i + 3] / 255).toFixed(2)})`; };
console.log("corner (2,2)   [expect transparent]:", at(2, 2));
console.log("badge  (40,128)[expect dark navy]   :", at(40, 128));
console.log("nose   (128,60)[expect red]         :", at(128, 60));
console.log("body   (128,100)[expect white]      :", at(128, 100));
console.log("USA stripe (128,123)[expect blue]   :", at(128, 123));
console.log("band L (115,175)[expect dark]       :", at(115, 175));
console.log("band R (140,175)[expect light]      :", at(140, 175));
console.log("fin    (100,190)[expect gray]       :", at(100, 190));
console.log("flame  (128,210)[expect orange/cream]:", at(128, 210));
console.log("bottom (128,244)[expect transparent]:", at(128, 244));
