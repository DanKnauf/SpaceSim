"use strict";
const fs = require("fs");
const path = require("path");
const dir = path.resolve(__dirname, "..", "textures");
for (const f of fs.readdirSync(dir).sort()) {
  const p = path.join(dir, f);
  const st = fs.statSync(p);
  const buf = fs.readFileSync(p);
  let kind = "?";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) kind = "JPEG";
  else if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) kind = "PNG";
  else if (buf.slice(0, 4).toString("ascii") === "<htm" || buf.slice(0, 5).toString("ascii") === "<?xml" || buf.slice(0, 1).toString("ascii") === "<") kind = "HTML/XML (bad download?)";
  else if (buf.slice(0, 15).toString("ascii").includes("Error")) kind = "ERROR TEXT (bad download?)";
  else kind = "UNKNOWN";
  // for JPEGs, find SOF to get dimensions
  let dims = "";
  if (kind === "JPEG") {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] === 0xff && (buf[i + 1] & 0xc0) === 0xc0 && (buf[i + 1] & 0xc0) !== 0xc8) {
        const h = buf.readUInt16BE(i + 5), w = buf.readUInt16BE(i + 7);
        dims = w + "x" + h;
        break;
      }
      if (buf[i] !== 0xff) { i++; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  } else if (kind === "PNG") {
    dims = buf.readUInt32BE(16) + "x" + buf.readUInt32BE(20);
  }
  console.log(f.padEnd(22), (st.size / 1024).toFixed(1).padStart(9) + " KB", kind, dims);
}
