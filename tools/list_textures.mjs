import fs from "fs";
import path from "path";
const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))), "..");
const dir = path.join(ROOT, "textures");
for (const f of fs.readdirSync(dir).sort()) {
  const s = fs.statSync(path.join(dir, f));
  console.log(f.padEnd(24), (s.size / 1048576).toFixed(2) + " MB");
}
