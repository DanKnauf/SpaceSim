// Probe JPL Horizons for the correct ephemeris IDs of Voyager 1 / 2.
const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["1002", "1003", "1004", "1005", "1006", "1007", "1008"];

for (const id of ids) {
  const cmd = id + ' @10 0 "2026-10-03" "2026-10-03" "0" \'ECL_J2000\' \'AU,AU/DAY\'';
  try {
    const r = await fetch("https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=" + encodeURIComponent(cmd));
    const j = await r.json();
    if (j.result) {
      const lines = j.result.split("\n");
      const i = lines.findIndex(l => l.includes("x("));
      console.log(id, "=>", i >= 0 ? lines.slice(i, i + 3).join(" | ") : j.result.slice(0, 200));
    } else {
      console.log(id, "=> ERR", (j.errmsg || j.message || "unknown").slice(0, 140));
    }
  } catch (e) {
    console.log(id, "=> FETCH ERROR", e.message);
  }
}
