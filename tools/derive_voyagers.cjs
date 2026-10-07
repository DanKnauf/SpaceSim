// Derive heliocentric state vectors for Voyager 1 & 2 at 2026-10-03 00:00 UTC
// from JPL Horizons geocentric vectors + our own Earth ephemeris.
const fs = require("fs");
const path = require("path");
const P = require(path.join(__dirname, "..", "js", "physics.js"));

const EPOCH_MS = Date.UTC(2026, 9, 3, 0, 0, 0);
const t0 = P.daysFromUTC(new Date(EPOCH_MS));
console.log("t0 =", t0, "days since J2000");

// Voyager 1 geocentric state (Horizons, 2026-Oct-03 00:00 TDB, ecliptic J2000)
const V1_GEO = {
  r: { x: -33.15264551607864, y: -137.0043613816768, z: 99.00660750047713 },
  v: { x: 0.001896762920510714, y: -0.02476840772865092, z: 0.005679065810013880 }
};

function parseVoyager(text) {
  const soe = text.slice(text.indexOf("$$SOE"), text.indexOf("$$EOE"));
  const lines = soe.split("\n").filter(l => /X =/.test(l) || /VX=/.test(l));
  const rx = lines[0].match(/X =\s*([\-\d.E+]+)/), ry = lines[0].match(/Y =\s*([\-\d.E+]+)/), rz = lines[0].match(/Z =\s*([\-\d.E+]+)/);
  const vx = lines[1].match(/VX=\s*([\-\d.E+]+)/), vy = lines[1].match(/VY=\s*([\-\d.E+]+)/), vz = lines[1].match(/VZ=\s*([\-\d.E+]+)/);
  const rg = soe.match(/RG=\s*([\-\d.E+]+)/);
  return {
    r: { x: +rx[1], y: +ry[1], z: +rz[1] },
    v: { x: +vx[1], y: +vy[1], z: +vz[1] },
    rg: +rg[1]
  };
}

async function fetchVoyager(id, label) {
  const cacheFile = path.join(__dirname, id === "-32" ? "v2_raw.txt" : "v1_raw.txt");
  if (fs.existsSync(cacheFile)) {
    return parseVoyager(fs.readFileSync(cacheFile, "utf8"));
  }
  const url =
    "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=" +
    encodeURIComponent("'" + id + "'") +
    "&OBJ_DATA=NO&MAKE_EPHEM=YES&EPHEM_TYPE=VECTORS" +
    "&START_TIME=2026-10-03&STOP_TIME=2026-10-04&STEP_SIZE=1&OUT_UNITS=AU-D";
  let j;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      j = await r.json();
      break;
    } catch (e) {
      console.log(`  attempt ${attempt} failed: ${e.message} — retrying in 3s`);
      await new Promise(res => setTimeout(res, 3000));
    }
  }
  if (!j) throw new Error("Horizons fetch failed after retries");
  fs.writeFileSync(cacheFile, j.result || JSON.stringify(j));
  return parseVoyager(j.result);
}

(async () => {
  const v1geo = V1_GEO;
  const v2geo = await fetchVoyager("-32", "Voyager 2");
  console.log("V2 geocentric:", JSON.stringify(v2geo.r), "RG =", v2geo.rg.toFixed(2), "AU");

  const earth = {
    r: P.planetPosition("earth", t0),
    v: P.planetVelocity("earth", t0)
  };
  console.log("Earth heliocentric at t0:", JSON.stringify(earth.r), "v:", JSON.stringify(earth.v));

  function toHeliocentric(geo) {
    return {
      r: P.add(earth.r, geo.r),
      v: P.add(earth.v, geo.v)
    };
  }

  const v1 = toHeliocentric(v1geo);
  const v2 = toHeliocentric(v2geo);

  const out = {
    tEpoch: t0,
    voyager1: {
      r: { x: v1.r.x, y: v1.r.y, z: v1.r.z },
      v: { x: v1.v.x, y: v1.v.y, z: v1.v.z },
      distAU: P.len(v1.r),
      speedKms: P.len(v1.v) * P.AU_DAY_KMS
    },
    voyager2: {
      r: { x: v2.r.x, y: v2.r.y, z: v2.r.z },
      v: { x: v2.v.x, y: v2.v.y, z: v2.v.z },
      distAU: P.len(v2.r),
      speedKms: P.len(v2.v) * P.AU_DAY_KMS
    }
  };
  fs.writeFileSync(path.join(__dirname, "voyagers_state.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
