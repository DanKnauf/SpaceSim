// Minimal PNG decoder (8-bit, non-interlaced, RGB/RGBA) + scene stats.
// Verifies a headless screenshot actually rendered content:
//  - not a black/blank frame
//  - color diversity (textures/geometry drawn)
//  - bright pixels present (sun glow / lit bodies)
import fs from "fs";
import zlib from "zlib";

const p = process.argv[2];
const buf = fs.readFileSync(p);
if (buf.readUInt32BE(0) !== 0x89504e47) { console.log("not a PNG"); process.exit(1); }

let off = 8;
let w = 0, h = 0, bitdepth = 0, colortype = 0;
const idat = [];
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString("ascii", off + 4, off + 8);
  const data = buf.slice(off + 8, off + 8 + len);
  if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitdepth = data[8]; colortype = data[9]; }
  else if (type === "IDAT") idat.push(data);
  off += 12 + len;
}
if (bitdepth !== 8 || colortype !== 2 && colortype !== 6) {
  console.log(`unsupported: bitdepth=${bitdepth} colortype=${colortype}`); process.exit(1);
}
const ch = colortype === 6 ? 4 : 3;
const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = w * ch;
const px = Buffer.alloc(w * h * ch);
const paeth = (a, b, c) => {
  const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
for (let y = 0; y < h; y++) {
  const f = raw[y * (stride + 1)];
  const row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
  const prev = y > 0 ? (y - 1) * w * ch : 0;
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < ch; c++) {
      const a = x > 0 ? px[(y * w + x - 1) * ch + c] : 0;
      const b = prev ? px[prev + x * ch + c] : 0;
      const cc = (x > 0 && prev) ? px[prev + (x - 1) * ch + c] : 0;
      const v = row[x * ch + c];
      let val;
      if (f === 0) val = v;
      else if (f === 1) val = (v + a) & 255;
      else if (f === 2) val = (v + b) & 255;
      else if (f === 3) val = (v + ((a + b) >> 1)) & 255;
      else val = (v + paeth(a, b, cc)) & 255;
      px[(y * w + x) * ch + c] = val;
    }
  }
}

// ---- stats ----
let nonBlack = 0, bright = 0, sum = 0, sumsq = 0;
const colors = new Set();
for (let i = 0; i < w * h; i++) {
  const r = px[i * ch], g = px[i * ch + 1], b = px[i * ch + 2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  sum += lum; sumsq += lum * lum;
  if (lum > 12) nonBlack++;
  if (lum > 200) bright++;
  colors.add((r >> 4) << 8 | (g >> 4) << 4 | (b >> 4)); // 4-bit quantized
}
const mean = sum / (w * h);
const sd = Math.sqrt(Math.max(0, sumsq / (w * h) - mean * mean));
console.log(`image: ${w}x${h}, channels=${ch}`);
console.log(`non-black pixels: ${(nonBlack / (w * h) * 100).toFixed(1)}%`);
console.log(`bright pixels (>200 lum): ${(bright / (w * h) * 100).toFixed(2)}%`);
console.log(`mean luminance: ${mean.toFixed(1)}, std: ${sd.toFixed(1)}`);
console.log(`unique quantized colors: ${colors.size}`);
console.log(colors.size > 500 && nonBlack > (w * h) * 0.1 ? "VERDICT: scene rendered with rich content" : "VERDICT: suspicious (flat/blank)");
