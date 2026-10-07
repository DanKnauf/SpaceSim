// Measure residual of the ELEMENTS-based model vs Horizons reference vectors.
const P = require("../js/physics.js");
const data = require("./comets_state.json");

for (const [name, body] of Object.entries(data.bodies)) {
  let line = name.padEnd(10);
  for (const d of data.dates) {
    const model = P.planetPosition(name, d.t);
    const ref = body.horizons[d.iso].r;
    const dx = model.x - ref.x, dy = model.y - ref.y, dz = model.z - ref.z;
    const err = Math.sqrt(dx * dx + dy * dy + dz * dz);
    line += `  ${d.iso}:${err < 0.001 ? err.toExponential(2) : err.toFixed(3)}`;
  }
  console.log(line + "  (AU)");
}
