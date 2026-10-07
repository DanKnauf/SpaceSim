const fs = require("fs");
for (const f of fs.readdirSync("textures")) {
  const b = fs.readFileSync("textures/" + f);
  let w = 0, h = 0;
  if (b.slice(0, 2).toString() === "BM") { w = b.readUInt32LE(18); h = b.readUInt32LE(22); }
  else if (b[0] === 0xFF && b[1] === 0xD8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xFF) { o++; continue; }
      const m = b[o + 1];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        h = b.readUInt16BE(o + 5); w = b.readUInt16BE(o + 7); break;
      }
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { o += 2; continue; }
      o += 2 + b.readUInt16BE(o + 2);
    }
  } else if (b.slice(0, 4).toString() === "PNG\0") { w = b.readUInt32BE(16); h = b.readUInt32BE(20); }
  console.log(f.padEnd(22), w + "x" + h, (b.length / 1048576).toFixed(2) + "MB");
}
