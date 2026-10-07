"use strict";
const fs = require("fs");
const path = require("path");
const file = path.resolve(__dirname, "..", "..", "..", "..", ".qwen", "projects", "c--users-dknauf-documents-vs-code-projects-spacesim", "chats", "1801faee-0916-4191-a24f-21491deeaf92.jsonl");
const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
let n = 0;
for (const line of lines) {
  let o;
  try { o = JSON.parse(line); } catch (e) { continue; }
  if (o.type === "user" && o.provenance === "real_user" && o.message && o.message.parts) {
    n++;
    const texts = o.message.parts.filter(p => p.text).map(p => p.text).join("\n");
    console.log("\n================ USER MESSAGE #" + n + " @ " + o.timestamp + " ================");
    console.log(texts);
  }
}
console.log("\nTotal real user messages: " + n);
