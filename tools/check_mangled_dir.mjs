// One-off: list the contents of the mangled "VS%20Code%20Projects" dir created by a
// path-encoding bug, so we can confirm it only contains our bad downloads before removal.
import fs from "fs";
const p = "C:/Users/dknauf/Documents/" + "VS" + String.fromCharCode(37) + "20Code" + String.fromCharCode(37) + "20Projects";
try {
  const walk = (d, dep = 0) => {
    for (const f of fs.readdirSync(d)) {
      const full = d + "/" + f;
      const st = fs.statSync(full);
      console.log("  ".repeat(dep) + f + (st.isDirectory() ? "/" : "  " + (st.size / 1e6).toFixed(2) + "MB"));
      if (st.isDirectory() && dep < 4) walk(full, dep + 1);
    }
  };
  walk(p);
} catch (e) {
  console.log("not found or error:", e.message);
}
