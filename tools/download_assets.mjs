// Downloads all external assets for SpaceSim (Three.js r128 + planet textures).
// Run: node tools/download_assets.mjs
import { writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tex = join(root, "textures");
const lib = join(root, "lib");
mkdirSync(tex, { recursive: true });
mkdirSync(lib, { recursive: true });

async function download(url, dest) {
  if (existsSync(dest) && statSync(dest).size > 1000) {
    console.log(`SKIP (exists)  ${dest}`);
    return;
  }
  console.log("GET  " + url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`Response too small for ${url}: ${buf.length} bytes`);
  writeFileSync(dest, buf);
  console.log(`  -> ${buf.length} bytes`);
}

const base = "https://www.solarsystemscope.com/textures/download";

await download("https://unpkg.com/three@0.128.0/build/three.min.js", join(lib, "three.min.js"));
await download("https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js", join(lib, "OrbitControls.js"));
await download(`${base}/2k_sun.jpg`, join(tex, "sun.jpg"));
await download(`${base}/2k_mercury.jpg`, join(tex, "mercury.jpg"));
await download(`${base}/2k_venus_surface.jpg`, join(tex, "venus.jpg"));
await download(`${base}/2k_earth_daymap.jpg`, join(tex, "earth.jpg"));
await download(`${base}/2k_earth_nightmap.jpg`, join(tex, "earth_night.jpg"));
await download(`${base}/2k_earth_clouds.jpg`, join(tex, "earth_clouds.jpg"));
await download(`${base}/2k_moon.jpg`, join(tex, "moon.jpg"));
await download(`${base}/2k_mars.jpg`, join(tex, "mars.jpg"));
await download(`${base}/2k_jupiter.jpg`, join(tex, "jupiter.jpg"));
await download(`${base}/2k_saturn.jpg`, join(tex, "saturn.jpg"));
await download(`${base}/2k_saturn_ring_alpha.png`, join(tex, "saturn_ring.png"));
await download(`${base}/2k_uranus.jpg`, join(tex, "uranus.jpg"));
await download(`${base}/2k_neptune.jpg`, join(tex, "neptune.jpg"));
await download(`${base}/2k_stars_milky_way.jpg`, join(tex, "stars_milky_way.jpg"));

console.log("All assets ready.");
