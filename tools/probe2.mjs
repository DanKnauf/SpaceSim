// Probe candidate URLs for better uranus/neptune/pluto textures (HEAD).
const cands = [
  "8k_neptune.jpg", "4k_neptune.jpg",
  "8k_uranus_surface.jpg", "8k_uranus_atmosphere.jpg", "4k_uranus.jpg",
  "8k_pluto.jpg", "4k_pluto.jpg", "2k_pluto.jpg",
  "8k_saturn_atmosphere.jpg", "8k_venus_atmosphere.jpg"
];
for (const f of cands) {
  try {
    const r = await fetch("https://www.solarsystemscope.com/textures/download/" + f, { method: "HEAD", signal: AbortSignal.timeout(15000) });
    console.log(r.status, f);
  } catch (e) { console.log("ERR", f, e.message); }
}
