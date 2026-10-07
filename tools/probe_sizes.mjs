// Probe content-length of the 8k texture set so we know the download cost.
const files = [
  "8k_sun.jpg", "8k_mercury.jpg", "8k_venus_surface.jpg", "8k_earth_daymap.jpg",
  "8k_earth_nightmap.jpg", "8k_earth_clouds.jpg", "8k_moon.jpg", "8k_mars.jpg",
  "8k_jupiter.jpg", "8k_saturn.jpg", "8k_saturn_ring_alpha.png", "8k_uranus.jpg",
  "8k_neptune.jpg", "8k_stars_milky_way.jpg"
];
let total = 0;
for (const f of files) {
  try {
    const r = await fetch("https://www.solarsystemscope.com/textures/download/" + f, { method: "HEAD", signal: AbortSignal.timeout(20000) });
    const len = parseInt(r.headers.get("content-length") || "0", 10);
    total += len;
    console.log(f, (len / 1048576).toFixed(1) + " MB", r.status);
  } catch (e) {
    console.log(f, "ERR", e.message);
  }
}
console.log("\nTOTAL 8k set:", (total / 1048576).toFixed(0) + " MB");
