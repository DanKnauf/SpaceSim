const r = await fetch("https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=" +
  encodeURIComponent('Voyager 1 @10 0 "2026-10-03" "2026-10-03" "0" \'ECL_J2000\' \'AU,AU/DAY\''));
const j = await r.json();
console.log("ERRMSG:\n", j.errmsg);
