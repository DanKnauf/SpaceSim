// Determine the correct precession-removal sign in test_physics.js's
// toEclipticJ2000: convert astronomy-engine heliocentric equatorial vectors
// to ecliptic J2000 with +p and -p, compare both to our element-based ephemeris.
const P = require("../js/physics.js");
const Astronomy = require("./node_modules/astronomy-engine");

const tDays = P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12)));
const date = new Date(Date.UTC(2026, 9, 3, 12));
const T = tDays / 36525;
const pArc = 5028.7961955 * T - 62.569310 * T * T + 6.226787 * T ** 3
           - 0.654230 * T ** 4 - 0.059468 * T ** 5 + 0.005789 * T ** 6;
const p = pArc / 3600 * Math.PI / 180;
console.log(`T=${T.toFixed(5)}Jc  p=${(pArc / 3600).toFixed(3)}' = ${(p * 57.2958).toFixed(4)} deg`);

function conv(eq, sign) {
  const ec = Astronomy.Ecliptic(eq, date);
  const c = Math.cos(p), s = Math.sin(p);
  const v = ec.vec;
  // +1: x' = x c - y s (current test); -1: x' = x c + y s (proposed fix)
  return sign > 0
    ? { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z }
    : { x: v.x * c + v.y * s, y: -v.x * s + v.y * c, z: v.z };
}

const BODIES = {
  mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus,
  earth: Astronomy.Body.EMB, mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn,
  uranus: Astronomy.Body.Uranus, neptune: Astronomy.Body.Neptune,
};
console.log("body      ours(AU)                     +p err(Mkm)   -p err(Mkm)");
for (const name of Object.keys(BODIES)) {
  const mine = P.planetPosition(name, tDays);
  const ref = Astronomy.HelioVector(BODIES[name], date);
  const ep = conv(ref, +1), em = conv(ref, -1);
  const dp = P.len(P.sub(mine, ep)) * P.AU_KM / 1e6;
  const dm = P.len(P.sub(mine, em)) * P.AU_KM / 1e6;
  console.log(name.padEnd(9),
    `${mine.x.toFixed(5)}, ${mine.y.toFixed(5)}, ${mine.z.toFixed(5)}  `,
    dp.toFixed(3).padStart(10), dm.toFixed(3).padStart(10));
}
