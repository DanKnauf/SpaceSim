// Verify every texture ends with a proper terminator:
// JPEG must end FF D9; PNG must end with the IEND chunk.
import fs from "fs";
import path from "path";
const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))), "..");
const dir = path.join(ROOT, "textures");
let bad = 0;
for (const f of fs.readdirSync(dir).sort()) {
  const buf = fs.readFileSync(path.join(dir, f));
  const tail = buf.slice(-12);
  let ok;
  if (f.endsWith(".png")) {
    // IEND chunk: 00 00 00 00 'I' 'E' 'N' 'D' AE 42 60 82
    ok = tail.equals(Buffer.from([0,0,0,0,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82]));
  } else {
    ok = buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
  }
  if (!ok) { bad++; console.log("BAD ENDING:", f, [...tail].map(b => b.toString(16)).join(" ")); }
  else console.log("ok:", f);
}
console.log(bad === 0 ? "\nALL TEXTURES COMPLETE" : `\n${bad} TRUNCATED FILE(S)`);
