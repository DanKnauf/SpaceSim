// Probe: does Horizons accept SPK IDs for comets? Does CENTER='500' work
// (quoted) vs CENTER=500?
(async () => {
  const tries = [
    { cmd: "90000006", center: "500@10" }, // Sun site, barycenter body
    { cmd: "90000006", center: "@10" },    // barycenter
  ];
  for (const t of tries) {
    const url =
      "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=" +
      encodeURIComponent("'" + t.cmd + "'") +
      "&OBJ_DATA=NO&MAKE_EPHEM=YES&EPHEM_TYPE=VECTORS" +
      "&CENTER=" + encodeURIComponent(t.center) +
      "&START_TIME=2026-10-03&STOP_TIME=2026-10-04&STEP_SIZE=1&OUT_UNITS=AU-D";
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const j = await r.json();
      if (process.argv.includes("--raw")) {
        console.log(`--- RAW cmd=${t.cmd} center=${t.center} ---`);
        console.log((j.result || j.errmsg || JSON.stringify(j)).slice(0, 900));
        continue;
      }
      const res = (j.result || j.errmsg || JSON.stringify(j));
      const centerLine = (res.match(/Center body name[^\n]*/) || ["?"])[0];
      const targetLine = (res.match(/Target body name[^\n]*/) || ["?"])[0];
      const hasSOE = res.indexOf("$$SOE") >= 0;
      console.log(`cmd=${t.cmd} center=${t.center}: ${targetLine} | ${centerLine} | SOE=${hasSOE}`);
    } catch (e) {
      console.log(`cmd=${t.cmd} center=${t.center}: ERROR ${e.message}`);
    }
  }
})();
