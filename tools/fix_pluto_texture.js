// Fix the Pluto texture: the NASA surface map leaves the southern region
// (below ~50 deg S) unmapped — pure black. The app renders it as a black
// band across the bottom of the globe. Replace the unmapped pixels with a
// muted ice-white tone.
//
// Safety: real Plutonian terrain never reads this black (it is a bright
// icy body; the darkest mapped terrain is a mid-brown). We fill:
//   - any pixel with max channel < 24 (pure void, anywhere), and
//   - in the southern half (y > 55% of height), pixels with max < 60
//     (void plus JPEG fringing around the mapped-region coast).
// Run: node tools/fix_pluto_texture.js   (idempotent — once fixed, no
// qualifying pixels remain).
const fs = require("fs");
const path = require("path");
const jpeg = require("jpeg-js");

const FILE = path.resolve(__dirname, "..", "textures", "pluto.jpg");
const raw = fs.readFileSync(FILE);
const img = jpeg.decode(raw, { useTArray: true });
const { width: w, height: h, data } = img;

// muted ice-white with a touch of blue, matching the bright plains
const BASE = [212, 216, 221];

let filled = 0, pure = 0, south = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b);
    const isSouth = y > h * 0.55;
    if (!(mx < 24 || (isSouth && mx < 60))) continue;
    // slight per-pixel noise so the fill is not a flat block
    const n = () => Math.round((Math.random() - 0.5) * 10);
    data[i] = Math.min(255, BASE[0] + n());
    data[i + 1] = Math.min(255, BASE[1] + n());
    data[i + 2] = Math.min(255, BASE[2] + n());
    filled++;
    if (mx < 24) pure++; else south++;
  }
}

if (filled === 0) {
  console.log("no unmapped pixels found — texture already fixed");
  process.exit(0);
}

fs.writeFileSync(FILE, jpeg.encode(img, 90).data);
console.log(`pluto.jpg ${w}x${h}: filled ${filled} unmapped px (${pure} pure-void, ${south} southern-fringe) -> ice white; wrote file`);
