// Temporary: list astronomy-engine API functions relevant to frame conversion
const A = require("./node_modules/astronomy-engine");
const names = Object.keys(A).filter(k =>
  /ecliptic|equator|precess|nutat|obliquity/i.test(k));
console.log(names.join("\n"));
