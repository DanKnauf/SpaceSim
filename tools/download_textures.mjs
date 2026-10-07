// Download hi-res textures from solarsystemscope.com into textures/.
// Local filenames stay stable (app.js references them); source URLs are
// {res}_{name} style. 8k preferred (highest available), 2k fallback.
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))), "..");
const TEX_DIR = path.join(ROOT, "textures");
fs.mkdirSync(TEX_DIR, { recursive: true });

// local file -> [8k source, 2k source]
const MAP = {
  "sun.jpg":              ["8k_sun.jpg", "2k_sun.jpg"],
  "mercury.jpg":          ["8k_mercury.jpg", "2k_mercury.jpg"],
  "venus.jpg":            ["8k_venus_surface.jpg", "2k_venus_surface.jpg"],
  "earth.jpg":            ["8k_earth_daymap.jpg", "2k_earth_daymap.jpg"],
  "earth_night.jpg":      ["8k_earth_nightmap.jpg", "2k_earth_nightmap.jpg"],
  "earth_clouds.jpg":     ["8k_earth_clouds.jpg", "2k_earth_clouds.jpg"],
  "moon.jpg":             ["8k_moon.jpg", "2k_moon.jpg"],
  "mars.jpg":             ["8k_mars.jpg", "2k_mars.jpg"],
  "jupiter.jpg":          ["8k_jupiter.jpg", "2k_jupiter.jpg"],
  "saturn.jpg":           ["8k_saturn.jpg", "2k_saturn.jpg"],
  "saturn_ring.png":      ["8k_saturn_ring_alpha.png", "2k_saturn_ring_alpha.png"],
  "uranus.jpg":           ["8k_uranus.jpg", "2k_uranus.jpg"],
  "neptune.jpg":          [null, "2k_neptune.jpg"],
  "stars_milky_way.jpg":  ["8k_stars_milky_way.jpg", "2k_stars_milky_way.jpg"]
};

function isImage(buf) {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  return null;
}

// 2k files from this source are < 1.5 MB; if the local file is bigger it's
// already 8k — skip.
const summary = [];
for (const [local, sources] of Object.entries(MAP)) {
  const dest = path.join(TEX_DIR, local);
  const cur = fs.existsSync(dest) ? fs.statSync(dest).size : null;
  if (cur !== null && cur >= 1_500_000) {
    console.log(`skip ${local} (${(cur / 1048576).toFixed(1)} MB, already hi-res)`);
    summary.push(local + ":kept");
    continue;
  }
  const urls = sources.filter(Boolean).map(s => "https://www.solarsystemscope.com/textures/download/" + s);
  let done = false;
  for (const url of urls) {
    for (let attempt = 1; attempt <= 3 && !done; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(300000) });
        if (!res.ok) { console.log(`  ${local} <- ${url} HTTP ${res.status}`); continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        const kind = isImage(buf);
        if (!kind || buf.length < 50000) { console.log(`  ${local} <- ${url} invalid image (${buf.length} B)`); continue; }
        fs.writeFileSync(dest, buf);
        console.log(`OK ${local}: ${(buf.length / 1048576).toFixed(1)} MB (${kind}) from ${url.split("/").pop()}`);
        summary.push(local + ":ok");
        done = true;
      } catch (e) {
        console.log(`  ${local} attempt ${attempt}: ${e.message}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  if (!done) {
    console.log(`FAILED ${local} (kept existing ${cur ? (cur / 1048576).toFixed(1) + " MB" : "none"})`);
    summary.push(local + ":failed");
  }
}
console.log("\nSummary:", summary.join(" "));
