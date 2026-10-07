// Temporary debug: compare element ephemeris vs astronomy-engine at J2000
const P = require("../js/physics.js");
const A = require("./node_modules/astronomy-engine");

const t = 0; // J2000
const mine = P.planetPosition("earth", t);
const ref = A.HelioVector(A.Body.EMB, new Date(Date.UTC(2000, 0, 1, 12)));
console.log("mine:", JSON.stringify(mine));
console.log("ref :", JSON.stringify({ x: ref.x, y: ref.y, z: ref.z }));
console.log("dist AU:", P.len(P.sub(mine, ref)));

const el = P.ELEMENTS.earth;
console.log("earth elements:", JSON.stringify(el));

// Hand computation
var M = (el.L - el.wbar) * Math.PI / 180;
console.log("M deg:", el.L - el.wbar, " rad:", M);
var e = el.e;
var E = M;
for (var i = 0; i < 50; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
var a = el.a;
var xp = a * (Math.cos(E) - e);
var yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
console.log("hand orbital-plane:", xp, yp, "r =", Math.hypot(xp, yp));
console.log("omega deg:", el.wbar - el.O, "i deg:", el.i, "O deg:", el.O);
var o = (el.wbar - el.O) * Math.PI / 180, inc = el.i * Math.PI / 180, O = el.O * Math.PI / 180;
var x = (Math.cos(O) * Math.cos(o) - Math.sin(O) * Math.sin(o) * Math.cos(inc)) * xp + (-Math.cos(O) * Math.sin(o) - Math.sin(O) * Math.cos(o) * Math.cos(inc)) * yp;
var y = (Math.sin(O) * Math.cos(o) + Math.cos(O) * Math.sin(o) * Math.cos(inc)) * xp + (-Math.sin(O) * Math.sin(o) + Math.cos(O) * Math.cos(o) * Math.cos(inc)) * yp;
var z = (Math.sin(o) * Math.sin(inc)) * xp + (Math.cos(o) * Math.sin(inc)) * yp;
console.log("hand ecliptic:", x, y, z);
