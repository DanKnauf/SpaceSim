// Precise check of the state -> elements identities
const P = require("../js/physics.js");
const mu = P.MU_SUN;

const r0 = P.V(0.7, 0.2, 0), v0 = P.V(0.002, 0.0165, 0.0005);
const r = P.len(r0), v2 = P.dot(v0, v0);
const a = 1 / (2 / r - v2 / mu);
const h = P.cross(r0, v0);
const hlen = P.len(h);
const evec = P.sub(P.scl(P.cross(v0, h), 1 / mu), P.unit(r0));
const e = P.len(evec);
const rdotv = P.dot(r0, v0);

console.log("r    =", r);
console.log("a    =", a);
console.log("e    =", e, " e^2 =", e * e);
console.log("h    =", hlen);
console.log("rdotv=", rdotv);
console.log("v2   =", v2, " mu/r =", mu / r, " Ev =", v2 / 2 - mu / r);

// identity check: e^2 = 1 + 2*Ev*h^2/mu^2
const eId = Math.sqrt(1 + 2 * (v2 / 2 - mu / r) * hlen * hlen / (mu * mu));
console.log("e (identity) =", eId);

// cosE, sinE from the two standard formulas
const cosE = (1 - r / a) / e;
const sinE_code = rdotv * Math.sqrt(1 - e * e) / (e * hlen);
const sinE_a = rdotv * Math.sqrt(1 - e * e) / (e * a * hlen);
console.log("cosE =", cosE);
console.log("sinE (no /a) =", sinE_code, " cos^2+sin^2 =", cosE * cosE + sinE_code * sinE_code);
console.log("sinE (/a)    =", sinE_a, " cos^2+sin^2 =", cosE * cosE + sinE_a * sinE_a);

// ground truth: build perifocal frame and compute E from position
const Pp = P.scl(evec, 1 / e);
const W = P.unit(h);
const Q = P.cross(W, Pp);
const X0 = P.dot(r0, Pp), Y0 = P.dot(r0, Q);
const Etruth = Math.atan2(Y0 / Math.sqrt(1 - e * e), X0 / a);
console.log("X0 =", X0, " Y0 =", Y0);
console.log("E (truth from X0,Y0) =", Etruth, " cos =", Math.cos(Etruth), " sin =", Math.sin(Etruth));
console.log("check X0 = a(cosE-e):", a * (Math.cos(Etruth) - e), " Y0 = a sqrt(1-e^2) sinE:", a * Math.sqrt(1 - e * e) * Math.sin(Etruth));

// what does r.v identity say?  r.v = sqrt(mu a^3) e sinE
console.log("rdotv / (sqrt(mu a^3) e) =", rdotv / (Math.sqrt(mu * a * a * a) * e), " (should be sinE)");

// velocity check: perifocal velocity from Etruth vs actual v0 in (P,Q)
const vP0 = P.dot(v0, Pp), vQ0 = P.dot(v0, Q);
const den = 1 - e * Math.cos(Etruth);
const s = Math.sqrt(mu * a);
console.log("v0 in (P,Q):", vP0, vQ0);
console.log("formula   :", -s * Math.sin(Etruth) / den, s * Math.sqrt(1 - e * e) * Math.cos(Etruth) / den);
