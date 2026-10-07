// Generate favicon.ico (16/32/48/64/128/256, PNG-in-ICO) + favicon.png preview.
// Draws a Saturn V rocket on a dark space badge — zero dependencies:
// a tiny scanline polygon rasterizer + a minimal PNG encoder (zlib deflate).
import fs from "fs";
import path from "path";
import zlib from "zlib";

const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))), "..");
const S = 256;

// ------------------------------------------------------------------
// Pixel buffer + rasterizer
// ------------------------------------------------------------------
const px = new Float64Array(S * S * 4); // RGBA premultiplied-ish, alpha 0..1

function blend(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return;
  const i = (y * S + x) * 4;
  const ia = 1 - a;
  px[i] = px[i] * ia + r * a;
  px[i + 1] = px[i + 1] * ia + g * a;
  px[i + 2] = px[i + 2] * ia + b * a;
  px[i + 3] = Math.min(1, px[i + 3] + a * (1 - px[i + 3]));
}

function fillPoly(pts, color) {
  // even-odd scanline fill; color = [r,g,b,a] in 0..1
  let ymin = 1e9, ymax = -1e9;
  for (const p of pts) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
  const y0 = Math.max(0, Math.floor(ymin)), y1 = Math.min(S - 1, Math.ceil(ymax));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
        xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(S - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) blend(x, y, color[0], color[1], color[2], color[3]);
    }
  }
}

function fillCircle(cx, cy, r, color) {
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(S - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(S - 1, Math.ceil(cx + r)); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) blend(x, y, color[0], color[1], color[2], color[3]);
    }
  }
}

function downsample(src, f) {
  // box filter src (size S) by factor f -> Float64Array size S/f
  const n = S / f, out = new Float64Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const i = ((y * f + dy) * S + (x * f + dx)) * 4;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; a += px[i + 3];
        }
      }
      const c = f * f, o = (y * n + x) * 4;
      out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c; out[o + 3] = a / c;
    }
  }
  return out;
}

function toRGBA(arr, n) {
  const out = Buffer.alloc(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const a = arr[i * 4 + 3];
    // un-premultiply
    out[i * 4] = Math.max(0, Math.min(255, Math.round((a > 0 ? arr[i * 4] / a : 0) * 255)));
    out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round((a > 0 ? arr[i * 4 + 1] / a : 0) * 255)));
    out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round((a > 0 ? arr[i * 4 + 2] / a : 0) * 255)));
    out[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
  }
  return out;
}

// ------------------------------------------------------------------
// Minimal PNG encoder (RGBA8, filter 0)
// ------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(n, rgba) {
  const raw = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++) {
    raw[y * (n * 4 + 1)] = 0;
    rgba.copy(raw, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

// ------------------------------------------------------------------
// Draw the badge (256x256)
// ------------------------------------------------------------------
// Deep-space navy circle with a soft top-left light, a few stars,
// and a vertical Saturn V: red nose, white body, 8-segment tail
// banding, fins, F-1 plume.
const C = (hex, a = 1) => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255, a];
};

// badge background: layered circles for a subtle radial gradient
const cx = 128;
for (let r = 122; r >= 96; r--) {
  const t = (r - 96) / 26; // 1 at edge, 0 at inner
  fillCircle(cx, cx - 2, r, C("#0d1430", 1).map((v, i) => i === 3 ? 1 : v * (1 - t * 0.55)));
}
// clip everything to the badge circle
{
  const mask = new Float64Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - (cx - 2);
    mask[y * S + x] = (dx * dx + dy * dy <= 122 * 122) ? 1 : 0;
  }
  for (let i = 0; i < S * S; i++) { px[i * 4 + 3] *= mask[i]; px[i * 4] *= mask[i]; px[i * 4 + 1] *= mask[i]; px[i * 4 + 2] *= mask[i]; }
}

// stars
[[52, 74, 1.6], [204, 60, 1.2], [196, 190, 1.7], [58, 178, 1.2], [160, 40, 1.0], [96, 44, 0.9]].forEach(([x, y, r]) => {
  fillCircle(x, y, r + 1, C("#ffffff", 0.18));
  fillCircle(x, y, r, C("#ffffff", 0.9));
});

// --- rocket geometry (centered x=128) ---
const RX0 = 111, RX1 = 145;            // body half-width 17
const NOSE_Y = 50, BODY_TOP = 82;      // nose cone
const BAND_Y0 = 152, TAIL_Y = 198;     // banding region / tail

// flame (drawn first, behind rocket)
fillPoly([[119, TAIL_Y], [137, TAIL_Y], [128, 226]], C("#ff8c2e", 0.85));
fillPoly([[123, TAIL_Y], [133, TAIL_Y], [128, 214]], C("#ffd98a", 0.9));
fillPoly([[126, TAIL_Y], [130, TAIL_Y], [128, 206]], C("#fff6e0", 0.95));

// fins
fillPoly([[RX0, 166], [RX0 - 13, TAIL_Y], [RX0, TAIL_Y - 4]], C("#8d939f", 1));
fillPoly([[RX1, 166], [RX1 + 13, TAIL_Y], [RX1, TAIL_Y - 4]], C("#6f7580", 1));

// nose cone (red)
fillPoly([[128, NOSE_Y], [RX0, BODY_TOP], [RX1, BODY_TOP]], C("#c8402e", 1));
fillPoly([[128, NOSE_Y], [RX0, BODY_TOP], [128, BODY_TOP]], C("#e05a40", 1)); // lit side

// upper body (white, lit from left)
fillPoly([[RX0, BODY_TOP], [RX1, BODY_TOP], [RX1, BAND_Y0], [RX0, BAND_Y0]], C("#e9eaee", 1));
fillPoly([[RX0, BODY_TOP], [RX0 + 10, BODY_TOP], [RX0 + 10, BAND_Y0], [RX0, BAND_Y0]], C("#f6f7f9", 1));
fillPoly([[RX1 - 8, BODY_TOP], [RX1, BODY_TOP], [RX1, BAND_Y0], [RX1 - 8, BAND_Y0]], C("#c3c7d1", 1));

// "USA" band stripe (blue) mid-body
fillPoly([[RX0, 118], [RX1, 118], [RX1, 128], [RX0, 128]], C("#1d4f91", 1));
// crude USA letters in white on the stripe (3 small blocks each)
function block(x, y, w, h) { fillPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], C("#ffffff", 0.95)); }
// U
block(114, 120, 2, 6); block(118, 120, 2, 6); block(114, 124, 6, 2);
// S
block(124, 120, 6, 2); block(124, 122, 2, 2); block(126, 122, 4, 2); block(128, 124, 2, 2); block(124, 124, 2, 2);
// A
block(134, 120, 2, 6); block(138, 120, 2, 6); block(134, 123, 6, 2);

// tail banding: 8 alternating segments
const segW = (RX1 - RX0) / 8;
for (let i = 0; i < 8; i++) {
  const x0 = RX0 + i * segW, x1 = x0 + segW;
  const dark = i % 2 === 0;
  fillPoly([[x0, BAND_Y0], [x1, BAND_Y0], [x1, TAIL_Y], [x0, TAIL_Y]],
    dark ? C("#14161c", 1) : C("#e9eaee", 1));
}
// subtle cylinder shading over banding
fillPoly([[RX0, BAND_Y0], [RX0 + 7, BAND_Y0], [RX0 + 7, TAIL_Y], [RX0, TAIL_Y]], C("#ffffff", 0.20));
fillPoly([[RX1 - 6, BAND_Y0], [RX1, BAND_Y0], [RX1, TAIL_Y], [RX1 - 6, TAIL_Y]], C("#000000", 0.30));

// ------------------------------------------------------------------
// Export sizes
// ------------------------------------------------------------------
const sizes = [16, 32, 48, 64, 128, 256];
const pngs = [];
for (const n of sizes) {
  const f = S / n;
  const arr = n === S ? px : downsample(px, f);
  pngs.push({ n, buf: encodePNG(n, toRGBA(arr, n)) });
}

// favicon.png (256) + preview
fs.writeFileSync(path.join(ROOT, "favicon.png"), pngs[5].buf);
fs.writeFileSync(path.join(ROOT, "tools", "favicon_preview.png"), pngs[5].buf);

// favicon.ico (PNG-in-ICO, 32bpp)
const entries = [];
let offset = 6 + sizes.length * 16;
for (const p of pngs) {
  const e = Buffer.alloc(16);
  e[0] = p.n >= 256 ? 0 : p.n;          // width (0 == 256)
  e[1] = p.n >= 256 ? 0 : p.n;          // height
  e[2] = 0;                              // palette
  e[3] = 0;                              // reserved
  e.writeUInt16LE(1, 4);                 // planes
  e.writeUInt16LE(32, 6);                // bpp
  e.writeUInt32LE(p.buf.length, 8);      // data size
  e.writeUInt32LE(offset, 12);           // data offset
  offset += p.buf.length;
  entries.push([e, p.buf]);
}
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
// ICO layout: header + ALL directory entries (contiguous) + ALL image data.
const dirBufs = entries.map(([e, d]) => e);
const dataBufs = entries.map(([e, d]) => d);
fs.writeFileSync(path.join(ROOT, "favicon.ico"), Buffer.concat([header, ...dirBufs, ...dataBufs]));

console.log("favicon.ico:", fs.statSync(path.join(ROOT, "favicon.ico")).size, "bytes");
console.log("favicon.png:", fs.statSync(path.join(ROOT, "favicon.png")).size, "bytes");
