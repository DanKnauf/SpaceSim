// SpaceSim data fetcher:
//  1. Voyager 1 / 2 heliocentric state vectors from JPL Horizons (epoch 2026-10-03)
//  2. 4k planetary textures from solarsystemscope.com into textures/
// Run: node tools/fetch_data.mjs   (writes tools/data_fetch_report.json + textures/*)
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const TEX_DIR = path.join(ROOT, "textures");
const EPOCH = "2026-10-03";
const report = { epoch: EPOCH, voyagers: {}, textures: {} };
fs.mkdirSync(TEX_DIR, { recursive: true });

// ------------------------------------------------------------------
// 1) Horizons state vectors
// ------------------------------------------------------------------
const candidates = ["-31"];   // Horizons major-body IDs (Voyager 1)
const candidates2 = ["-32"];  // (Voyager 2)

async function fetchHorizons(label, ids) {
  for (const id of ids) {
    // State vector relative to the Sun (CENTER=10), ecliptic J2000, AU & AU/day
    const url =
      "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=" +
      encodeURIComponent("'" + id + "'") +
      "&OBJ_DATA=NO&MAKE_EPHEM=YES&EPHEM_TYPE=VECTORS" +
      "&CENTER=10&REF_PLANE=ECLIPTIC" +
      "&START_TIME=" + EPOCH + "&STOP_TIME=2026-10-04&STEP_SIZE=1" +
      "&OUT_UNITS=AU-D";
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const j = await res.json();
      const text = j.result || (Array.isArray(j) ? j[0].vtxt.join("\n") : "");
      if (!text || text.includes("No matches") || text.includes("match string")) { console.log(`  ${label} id='${id}': no data`); continue; }
      // state-vector table: header line with x(AU), then the data line
      const lines = text.split("\n");
      const hi = lines.findIndex(l => /x\(AU\)/.test(l));
      if (hi < 0) throw new Error("no x(AU) header in:\n" + text.slice(0, 400));
      const parts = (lines[hi + 1] || "").trim().split(/\s+/).slice(0, 6).map(Number);
      if (parts.length < 6 || parts.some(isNaN)) throw new Error("bad vector line: " + lines[hi + 1]);
      const num = parts;
      report.voyagers[label] = {
        id: id,
        x: num[0], y: num[1], z: num[2],
        vx: num[3], vy: num[4], vz: num[5],
        distAU: Math.hypot(num[0], num[1], num[2]),
        speedKms: Math.hypot(num[3], num[4], num[5]) * 1731.456727,
        raw: lines[hi + 1]
      };
      console.log(`  ${label} [${id}]: r=(${num[0].toFixed(3)}, ${num[1].toFixed(3)}, ${num[2].toFixed(3)}) AU, |r|=${report.voyagers[label].distAU.toFixed(2)} AU, v=${report.voyagers[label].speedKms.toFixed(2)} km/s`);
      return;
    } catch (e) {
      console.log(`  ${label} id='${id}': ${e.message}`);
    }
  }
  throw new Error("could not fetch " + label);
}

console.log("Horizons state vectors (epoch " + EPOCH + "):");
await fetchHorizons("voyager1", candidates);
await fetchHorizons("voyager2", candidates2);

// ------------------------------------------------------------------
// 2) Textures
// ------------------------------------------------------------------
const TEX_FILES = [
  "sun.jpg", "mercury.jpg", "venus.jpg", "earth.jpg", "earth_clouds.jpg",
  "earth_night.jpg", "moon.jpg", "mars.jpg", "jupiter.jpg", "saturn.jpg",
  "saturn_ring.png", "uranus.jpg", "neptune.jpg", "pluto.jpg", "stars_milky_way.jpg"
];

function isImage(buf) {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  return null;
}

const BASES = [
  "https://www.solarsystemscope.com/textures/download/4k/",
  "https://www.solarsystemscope.com/textures/download/2k/"
];

for (const f of TEX_FILES) {
  let done = false;
  for (const base of BASES) {
    const url = base + f;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!res.ok) { console.log(`  ${f} ${base} -> HTTP ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const kind = isImage(buf);
      if (!kind || buf.length < 50000) { console.log(`  ${f} ${base} -> not a valid image (${buf.length} bytes)`); continue; }
      fs.writeFileSync(path.join(TEX_DIR, f), buf);
      report.textures[f] = { url, bytes: buf.length, kind };
      console.log(`  ${f}: ${(buf.length / 1e6).toFixed(1)} MB (${kind})`);
      done = true;
      break;
    } catch (e) {
      console.log(`  ${f} ${base} -> ${e.message}`);
    }
  }
  if (!done) report.textures[f] = { error: "all sources failed" };
}

fs.writeFileSync(path.join(ROOT, "tools", "data_fetch_report.json"), JSON.stringify(report, null, 2));
console.log("Report -> tools/data_fetch_report.json");
