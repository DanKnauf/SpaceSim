import fs from "fs";
const url =
  "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=" +
  encodeURIComponent("'-31'") +
  "&OBJ_DATA=NO&MAKE_EPHEM=YES&EPHEM_TYPE=VECTORS" +
  "&START_TIME=2026-10-03&STOP_TIME=2026-10-04&STEP_SIZE=1" +
  "&OUT_UNITS=AU-D";
const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
const j = await r.json();
fs.writeFileSync("tools/v1_full.txt", j.result || JSON.stringify(j));
console.log("saved tools/v1_full.txt, chars:", (j.result || "").length);
