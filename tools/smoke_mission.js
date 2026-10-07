// Headless smoke test: plan a transfer to every destination from today's
// Earth state, propagate the rocket along the resulting orbit, and verify
// it reaches the destination within tolerance at tArrival.
var P = require("../js/physics.js");
var t0 = P.daysFromUTC(new Date());
console.log("Launch sim date:", P.fmtDate(t0));
var r0 = P.planetPosition("earth", t0);
var v0 = P.planetVelocity("earth", t0);

var dests = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune",
  "moon", "phobos", "deimos", "io", "europa", "ganymede", "callisto", "titan", "triton"];

var failures = 0;
dests.forEach(function (d) {
  var tStart = Date.now();
  var plan;
  try {
    plan = P.planTransfer(t0, r0, v0, function (t) { return P.destinationPosition(d, t); });
  } catch (e) {
    console.log("FAIL", d, "threw:", e.message); failures++; return;
  }
  var ms = Date.now() - tStart;
  if (plan.error) { console.log("FAIL", d, "error:", plan.error); failures++; return; }
  var ballistic = plan.p !== undefined;
  var st;
  if (ballistic) {
    st = { pos: P.add(r0, P.scl(plan.v0, plan.TOF)), vel: plan.v0 };
  } else {
    var orb = P.conicFromState(r0, plan.v0);
    st = P.conicPropagate(orb, plan.TOF);
  }
  var destPos = P.destinationPosition(d, plan.tArrival);
  var miss = P.len(P.sub(st.pos, destPos)); // AU
  var missKm = miss * P.AU_KM;
  var ok = missKm < 250000; // loose tolerance (moon distances are ~384k km)
  if (!ok) failures++;
  console.log(
    (ok ? "PASS" : "FAIL"), d.padEnd(9),
    "TOF=" + P.fmtDuration(plan.TOF).padEnd(10),
    "dV=" + plan.dV_kms.toFixed(2).padStart(7) + " km/s" + (plan.dV_over ? " OVER" : ""),
    "e=" + (ballistic ? "ballistic" : plan.e.toFixed(3)).padStart(10),
    "miss=" + Math.round(missKm).toLocaleString("en-US") + " km",
    "solve=" + ms + "ms"
  );
});
console.log(failures === 0 ? "\nALL DESTINATIONS OK" : "\n" + failures + " FAILURES");
process.exit(failures === 0 ? 0 : 1);
