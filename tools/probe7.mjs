const url =
  "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=" +
  encodeURIComponent("'-31'") +
  "&OBJ_DATA=NO&MAKE_EPHEM=YES&EPHEM_TYPE=VECTORS" +
  "&CENTER=10&REF_PLANE=ECLIPTIC" +
  "&START_TIME=2026-10-03&STOP_TIME=2026-10-03&STEP_SIZE=0" +
  "&OUT_UNITS=" + encodeURIComponent("AU, AU/DAY");
console.log("URL:", url);
const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
console.log("status:", r.status);
const j = await r.json();
console.log(JSON.stringify(j, null, 1).slice(0, 2000));
