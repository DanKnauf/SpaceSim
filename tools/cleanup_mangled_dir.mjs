// Remove the mangled "VS%20Code%20Projects" directory created by the path-encoding
// bug. Safety: only removes if it contains exactly the expected stray files.
import fs from "fs";
const base = "C:/Users/dknauf/Documents/" + "VS" + String.fromCharCode(37) + "20Code" + String.fromCharCode(37) + "20Projects";
try {
  if (!fs.existsSync(base)) { console.log("nothing to do"); process.exit(0); }
  const ss = base + "/SpaceSim";
  const files = fs.readdirSync(ss);
  const texDir = ss + "/textures";
  const texFiles = fs.existsSync(texDir) ? fs.readdirSync(texDir) : null;
  console.log("SpaceSim contents:", files, "| textures/ contents:", texFiles);
  if (JSON.stringify(files) !== JSON.stringify(["favicon.png", "textures"]) || (texFiles !== null && texFiles.length > 0)) {
    console.log("UNEXPECTED CONTENTS — aborting, remove manually");
    process.exit(1);
  }
  fs.rmSync(base, { recursive: true, force: false });
  console.log("removed", base);
} catch (e) {
  console.log("error:", e.message);
}
