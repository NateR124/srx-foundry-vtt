import fs from "fs";

const en = JSON.parse(fs.readFileSync("lang/en.json", "utf8"));
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walk(p);
    } else if (/\.(mjs|hbs|js)$/.test(e.name)) files.push(p);
  }
}
walk("module");
walk("templates");

const re = /["']((?:SRX|TYPES)\.[A-Za-z0-9._]+)["']/g;
const used = new Set();
for (const f of files) {
  const t = fs.readFileSync(f, "utf8");
  let m;
  while ((m = re.exec(t))) used.add(m[1]);
}
const missing = [...used].filter((k) => !(k in en)).sort();
console.log(`used ${used.size}, missing ${missing.length}`);
for (const k of missing) console.log(k);
