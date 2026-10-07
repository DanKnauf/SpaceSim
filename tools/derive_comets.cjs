// Derive J2000-epoch Keplerian elements (ecliptic J2000, AU / days) for real
// comets + Pluto from JPL Horizons heliocentric state vectors, and collect
// reference vectors for the physics test suite.
//
// Method (uniform for all bodies):
//  - Comets: the valid Horizons record number is found via a
//    "DES= <spkid>;" search (spkid from SBDB); the record whose 2026
//    heliocentric distance matches the SBDB osculating prediction wins.
//  - Pluto: COMMAND='134340' directly.
//  - Heliocentric ecliptic-J2000 vectors: EPHEM_TYPE=VECTORS, CENTER=500@10,
//    OUT_UNITS=AU-D, at 2010-03-03, 2026-10-03 (sim epoch), 2035-01-01
//    (independent test date), 2050-06-15.
//  - Elements are derived from the 2026 vector (exact at epoch); a,e,i,O,wbar
//    rates are fitted over 2010..2050 (perturbation drift); dL is the
//    dynamical mean motion 360*36525/T.
//
// Run: node tools/derive_comets.cjs
// Output: tools/comets_state.json
const fs = require("fs");
const path = require("path");
const P = require(path.join(__dirname, "..", "js", "physics.js"));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const RAD = P.DEG; // deg -> rad

const DATES = [
  { iso: "2010-03-03", t: P.daysFromUTC(new Date(Date.UTC(2010, 2, 3, 12))) },
  { iso: "2026-10-03", t: P.daysFromUTC(new Date(Date.UTC(2026, 9, 3, 12))) },
  { iso: "2035-01-01", t: P.daysFromUTC(new Date(Date.UTC(2035, 0, 1, 12))) },
  { iso: "2050-06-15", t: P.daysFromUTC(new Date(Date.UTC(2050, 5, 15, 12))) }
];
const EPOCH_I = 1; // 2026-10-03 (sim epoch)

const COMETS = { "1P": "halley", "2P": "encke", "8P": "tuttle", "19P": "borrelly", "67P": "churyumov", "103P": "hartley2" };

async function getJson(url, label, timeoutMs = 45000) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      return await r.json();
    } catch (e) {
      console.log(`    ${label} attempt ${attempt} failed: ${e.message} — retry in 3s`);
      await new Promise(res => setTimeout(res, 3000));
    }
  }
  throw new Error("fetch failed: " + label);
}

function parseVectors(text) {
  const soe = text.slice(text.indexOf("$$SOE"), text.indexOf("$$EOE"));
  const lines = soe.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/X =\s*([\-\d.E+]+)/);
    if (!m) continue;
    const ry = lines[i].match(/Y =\s*([\-\d.E+]+)/), rz = lines[i].match(/Z =\s*([\-\d.E+]+)/);
    const vx = lines[i + 1].match(/VX=\s*([\-\d.E+]+)/), vy = lines[i + 1].match(/VY=\s*([\-\d.E+]+)/), vz = lines[i + 1].match(/VZ=\s*([\-\d.E+]+)/);
    out.push({ r: { x: +m[1], y: +ry[1], z: +rz[1] }, v: { x: +vx[1], y: +vy[1], z: +vz[1] } });
  }
  return out;
}

function horizonsUrl(command, startIso, stopIso) {
  return "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=" +
    encodeURIComponent("'" + command + "'") +
    "&OBJ_DATA=NO&MAKE_EPHEM=YES&EPHEM_TYPE=VECTORS&CENTER=500@10" +
    "&START_TIME=" + startIso + "&STOP_TIME=" + stopIso + "&STEP_SIZE=1d&OUT_UNITS=AU-D";
}

async function fetchVector(command, dateIso, cacheLabel) {
  const cacheFile = path.join(__dirname, `hz_${cacheLabel}_${dateIso}.txt`);
  if (fs.existsSync(cacheFile)) {
    const sv = parseVectors(fs.readFileSync(cacheFile, "utf8"));
    if (sv.length) return sv[0];
  }
  // Horizons requires stop > start; request a 2-day span and take the first row.
  const d0 = new Date(dateIso + "T00:00:00Z");
  const d1 = new Date(d0.getTime() + 86400000).toISOString().slice(0, 10);
  const j = await getJson(horizonsUrl(command, dateIso, d1), cacheLabel + " " + dateIso);
  const text = j.result || "";
  if (text.indexOf("$$SOE") < 0) throw new Error("no SOE for " + cacheLabel + " " + dateIso + ": " + (j.errmsg || text.slice(0, 120)));
  fs.writeFileSync(cacheFile, text);
  const sv = parseVectors(text);
  if (!sv.length) throw new Error("parsed 0 vectors for " + cacheLabel + " " + dateIso);
  return sv[0];
}

// Derive classical elements from a heliocentric ecliptic-J2000 state vector.
function deriveElements(sv, mu) {
  const r = sv.r, v = sv.v;
  const rmag = P.len(r), v2 = P.dot(v, v);
  const a = 1 / (2 / rmag - v2 / mu);
  const h = P.cross(r, v);
  const H = P.len(h);
  const evec = P.sub(P.scl(P.cross(v, h), 1 / mu), P.unit(r));
  const e = P.len(evec);
  const nhat = P.scl(h, 1 / H);
  const i = Math.acos(clamp(nhat.z, -1, 1));
  // Node vector ẑ × nhat points to the ascending node.
  const nbar = P.unit(P.cross(P.V(0, 0, 1), nhat));
  const O = Math.atan2(nbar.y, nbar.x);
  const Pdir = e > 1e-10 ? P.scl(evec, 1 / e) : P.unit(r);
  // ω: angle from node to perihelion in the orbital plane (right-handed about nhat).
  const w = Math.atan2(P.dot(nhat, P.cross(nbar, Pdir)), P.dot(nbar, Pdir));
  const Q = P.cross(nhat, Pdir);
  const nu = Math.atan2(P.dot(r, Q), P.dot(r, Pdir));
  let M;
  if (Math.abs(e) < 1e-10) M = nu;
  else {
    const cosE = (1 - rmag / a) / e;
    const sinE = P.dot(r, v) * Math.sqrt(1 - e * e) / (e * H);
    const E = Math.atan2(sinE, clamp(cosE, -1, 1));
    M = E - e * Math.sin(E);
  }
  const T = P.TAU * Math.sqrt(Math.abs(a) ** 3 / mu);
  return { a, e, i, O, w, M, T }; // radians; T in days
}

const rad360 = r => ((r / RAD) % 360 + 360) % 360;
function angDiff(aDeg, bDeg) { // unwrap to [-180, 180)
  let d = (aDeg - bDeg) % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// State from classical elements (all angles rad), t/epoch in days since J2000.
function stateFromElements(el, tDays, mu) {
  const T = P.TAU * Math.sqrt(el.a ** 3 / mu);
  let M = ((el.M + (tDays - el.epochDays) * P.TAU / T) % P.TAU + P.TAU) % P.TAU;
  let E = (el.e < 0.8) ? M : Math.PI;
  for (let k = 0; k < 100; k++) {
    const f = E - el.e * Math.sin(E) - M, fp = 1 - el.e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  const cE = Math.cos(E), sE = Math.sin(E);
  const oneMinus = 1 - el.e * cE;
  const xp = el.a * (cE - el.e), yp = el.a * Math.sqrt(1 - el.e * el.e) * sE;
  const vxp = -Math.sqrt(mu / el.a) * sE / oneMinus, vyp = Math.sqrt(mu / el.a) * Math.sqrt(1 - el.e * el.e) * cE / oneMinus;
  const cw = Math.cos(el.w), sw = Math.sin(el.w);
  const cO = Math.cos(el.O), sO = Math.sin(el.O);
  const ci = Math.cos(el.i), si = Math.sin(el.i);
  const x1 = cw * xp - sw * yp, y1 = sw * xp + cw * yp;
  const x2 = x1, y2 = ci * y1, z2 = si * y1;
  const vx1 = cw * vxp - sw * vyp, vy1 = sw * vxp + cw * vyp;
  return {
    r: { x: cO * x2 - sO * y2, y: sO * x2 + cO * y2, z: z2 },
    v: { x: cO * vx1 - sO * ci * vy1, y: sO * vx1 + cO * ci * vy1, z: si * vy1 }
  };
}

// Parse a Horizons DES= search result -> [{record, epochYr}]
function parseRecordList(text) {
  const out = [];
  const re = /(\d{8})\s+([-\d]{3,6})\s+\d+\s+\S+\s+\S+/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ record: m[1], epochYr: +m[2] });
  return out;
}

// Build one body record: fetch vectors, derive elements, fit rates.
async function buildBody(hzCommand, label, sbdbRec) {
  const hz = {};
  for (const d of DATES) hz[d.iso] = await fetchVector(hzCommand, d.iso, label);
  const els = DATES.map(d => deriveElements(hz[d.iso], P.MU_SUN));

  // rates over 2010..2050 (per century)
  const spanCen = (DATES[3].t - DATES[0].t) / 36525;
  const wbar = el => rad360(el.O + el.w); // angles in radians; single conversion
  const rates = {
    da: (els[3].a - els[0].a) / spanCen,
    de: (els[3].e - els[0].e) / spanCen,
    di: angDiff(rad360(els[3].i), rad360(els[0].i)) / spanCen,
    dO: angDiff(rad360(els[3].O), rad360(els[0].O)) / spanCen,
    dwbar: angDiff(wbar(els[3]), wbar(els[0])) / spanCen
  };
  const el0 = els[EPOCH_I];
  const dL = 360 * 36525 / el0.T; // deg/century (mean motion)
  const T0 = DATES[EPOCH_I].t / 36525;
  const L2026 = (wbar(el0) + rad360(el0.M)) % 360;
  const elJ2000 = {
    a: el0.a - rates.da * T0,
    e: el0.e - rates.de * T0,
    i: (rad360(el0.i) - rates.di * T0 + 360) % 360,
    O: (rad360(el0.O) - rates.dO * T0 + 360) % 360,
    wbar: (wbar(el0) - rates.dwbar * T0 + 360) % 360,
    L: (L2026 - dL * T0 + 360) % 360,
    da: rates.da, de: rates.de, di: rates.di, dO: rates.dO, dwbar: rates.dwbar, dL
  };
  return {
    sbdb: sbdbRec, horizons: hz, elementsJ2000: elJ2000, periodDays: el0.T,
    derivedAtDates: DATES.map((d, k) => ({ date: d.iso, a: els[k].a, e: els[k].e, iDeg: rad360(els[k].i), ODeg: rad360(els[k].O), wDeg: rad360(els[k].w), M0Deg: rad360(els[k].M), r: P.len(hz[d.iso].r) }))
  };
}

function sbdbFetch(des, label) {
  return getJson("https://ssd-api.jpl.nasa.gov/sbdb.api?des=" + encodeURIComponent(des) + "&full-prec=1&cd-epoch=1&cd-tp=1", label + " sbdb");
}
function sbdbToRec(j) {
  const m = {};
  (j.orbit.elements || []).forEach(e => { m[e.name] = +e.value; });
  return {
    spkid: j.object.spkid, designation: j.object.fullname, kind: j.object.kind,
    a: m.a, e: m.e, i: m.i, om: m.om, w: m.w, ma: m.ma,
    per: m.per, tp: m.tp, q: m.q, ad: m.ad,
    epochJd: j.orbit.epoch, epochCd: j.orbit.epoch_cd, equinox: j.orbit.equinox
  };
}

(async () => {
  const out = { epoch: DATES[EPOCH_I].iso, tEpoch: DATES[EPOCH_I].t, dates: DATES, bodies: {} };

  // ---- Pluto (direct command) ----
  {
    const label = "pluto";
    let sbdbRec = null;
    try { sbdbRec = sbdbToRec(await sbdbFetch("134340", label)); }
    catch (e) { console.log("pluto SBDB lookup failed:", e.message); }
    out.bodies[label] = await buildBody("134340", label, sbdbRec);
    console.log(`pluto    T=${(out.bodies[label].periodDays / 365.25).toFixed(3)} yr  a=${out.bodies[label].elementsJ2000.a.toFixed(5)} AU`);
  }

  // ---- Comets (record search via SBDB spkid) ----
  for (const [des, label] of Object.entries(COMETS)) {
    console.log("\n" + label + " (" + des + ")");
    const sbdb = await sbdbFetch(des, label);
    const sbdbRec = sbdbToRec(sbdb);
    const spkid = sbdbRec.spkid;
    console.log(`  SBDB: a=${sbdbRec.a} e=${sbdbRec.e} i=${sbdbRec.i} per=${sbdbRec.per}d epoch=${sbdbRec.epochCd} spk=${spkid}`);

    const eIso = DATES[EPOCH_I].iso;
    const eIso1 = new Date(eIso + "T00:00:00Z").getTime() + 86400000;
    const searchJ = await getJson(horizonsUrl("DES= " + spkid + ";", eIso, new Date(eIso1).toISOString().slice(0, 10)), label + " search");
    const records = parseRecordList(searchJ.result || "");
    if (!records.length) throw new Error("no Horizons records for " + label);
    records.sort((a, b) => b.epochYr - a.epochYr);

    // predicted heliocentric distance at sim epoch from SBDB osculating elements
    const sbdbState = stateFromElements(
      { a: sbdbRec.a, e: sbdbRec.e, i: sbdbRec.i * RAD, O: sbdbRec.om * RAD, w: sbdbRec.w * RAD,
        M: sbdbRec.ma * RAD, epochDays: sbdbRec.epochJd - 2451545.0 },
      DATES[EPOCH_I].t, P.MU_SUN);
    const predR = P.len(sbdbState.r);
    const thresh = Math.max(2.0, 0.12 * predR);

    let chosen = null, bestD = Infinity;
    for (const rec of records.slice(0, 3)) {
      const sv = await fetchVector(rec.record, DATES[EPOCH_I].iso, label + "_r" + rec.record);
      const rg = P.len(sv.r);
      const d = Math.abs(rg - predR);
      console.log(`  record ${rec.record} (epoch-yr ${rec.epochYr}): r=${rg.toFixed(3)} AU  Δpred=${d.toFixed(3)} AU`);
      if (d < bestD) { bestD = d; chosen = rec; }
      if (d < Math.min(0.5, thresh)) break;
    }
    console.log(`  -> using record ${chosen.record} (Δpred=${bestD.toFixed(3)} AU${bestD > thresh ? "  [ABOVE THRESHOLD]" : ""})`);

    out.bodies[label] = await buildBody(chosen.record, label, sbdbRec);
    const elJ = out.bodies[label].elementsJ2000;
    console.log(`  T=${(out.bodies[label].periodDays / 365.25).toFixed(3)} yr  a=${elJ.a.toFixed(5)} AU  e=${elJ.e.toFixed(6)}  i=${elJ.i.toFixed(3)}°`);
  }

  fs.writeFileSync(path.join(__dirname, "comets_state.json"), JSON.stringify(out, null, 2));
  console.log("\nWrote tools/comets_state.json");
})().catch(e => { console.error("FATAL", e); process.exit(1); });
