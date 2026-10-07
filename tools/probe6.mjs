const r = await fetch("https://ssd-api.jpl.nasa.gov/doc/horizons.html", { signal: AbortSignal.timeout(30000) });
const html = await r.text();
const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ");
const i = text.indexOf("COMMAND");
console.log(text.slice(i, i + 3000));
