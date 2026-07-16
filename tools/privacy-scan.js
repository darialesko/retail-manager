const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const forbidden = [
  /Daria/i,
  /Muhammad/i,
  /Hussein/i,
  /Mushari/i,
  /Tobacco/i,
  /\+614/,
  /viber/i,
  /ЖУРНАЛ/i,
  /OneDrive/i,
  /DLesko/i,
  /ORDER-HISTORY-backup/i,
  /source-of-truth/i,
  /retailOrderHelper(?!PublicDemo)/i,
  /retailOrderHistory(?!PublicDemo)/i,
  /retailShiftCashflowTracker(?!PublicDemo)/i,
  /Manchester/i,
  /Marlboro/i,
  /\bEsse\b/i,
  /\bMAC\b/i,
  /Oscar/i,
  /Double Happiness/i,
  /Winfield/i,
  /\bJPS\b/i,
  /Rothmans/i,
  /Benson/i,
  /Bond Street/i,
  /Parker/i,
  /Peter Jackson/i,
  /Chesterfield/i,
  /Holiday/i,
  /Cherry/i,
  /Grape/i,
  /Passionfruit/i,
  /Blueberry/i,
  /Strawberry/i,
  /Kiwifruit/i,
  /Blackberry/i,
  /Peach ice/i,
  /Super mint/i,
  /2026-06/,
  /2026-07/,
  /202606/,
  /202607/
];

const ignoredDirs = new Set([".git", "node_modules"]);
const ignoredFiles = new Set(["privacy-scan.js"]);
const extensions = new Set([".html", ".js", ".md", ".json", ".webmanifest", ".svg", ".css", ".txt"]);
const forbiddenAssetExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    if (forbiddenAssetExtensions.has(path.extname(entry.name).toLowerCase())) {
      hits.push(`${path.relative(root, path.join(dir, entry.name))}: image assets are not allowed in the public demo package`);
      continue;
    }
    if (!extensions.has(path.extname(entry.name)) || ignoredFiles.has(entry.name)) continue;
    files.push(path.join(dir, entry.name));
  }
  return files;
}

const hits = [];
for (const file of walk(root)) {
  const text = fs.readFileSync(file, "utf8");
  text.split(/\r?\n/).forEach((line, index) => {
    forbidden.forEach((pattern) => {
      if (pattern.test(line)) hits.push(`${path.relative(root, file)}:${index + 1}: ${pattern}`);
    });
  });
}

if (hits.length) {
  console.error("Privacy scan failed:");
  hits.forEach((hit) => console.error(`- ${hit}`));
  process.exit(1);
}

console.log("Privacy scan passed:");
console.log("- no private names, phone prefixes, brand names, or original operational dates found");
