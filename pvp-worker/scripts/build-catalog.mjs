import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL("../../assets/locations.json", import.meta.url);
const targetUrl = new URL("../src/catalog.js", import.meta.url);
const fields = ["id", "short", "clue", "fact", "lat", "lng", "difficulty", "category", "image", "country"];
const source = JSON.parse(await readFile(sourceUrl, "utf8"));

const playable = source.filter((item) => {
  if (item.category !== "city") return false;
  if (typeof item.image !== "string" || !item.image || item.image.includes("No_image_available")) return false;
  if (Number(item.lat) < -60 || String(item.country).toLowerCase().includes("antarctica")) return false;
  return true;
}).map((item) => Object.fromEntries(fields.map((field) => [field, item[field]])));

for (const item of playable) {
  if (!item.id || !item.short || !item.clue || !item.country || !item.image || item.category !== "city" ||
      !Number.isFinite(item.lat) || !Number.isFinite(item.lng) || !Number.isInteger(item.difficulty) ||
      item.difficulty < 1 || item.difficulty > 10) throw new Error(`Invalid catalog entry: ${item.id || "unknown"}`);
}
if (new Set(playable.map((item) => item.id)).size !== playable.length) throw new Error("Duplicate catalog ID");

const canonical = JSON.stringify(playable);
const version = `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
const counts = [1, 3, 5, 7, 9].map((low) => playable.filter((item) => item.difficulty >= low && item.difficulty <= low + 1).length);
if (counts.some((count) => count === 0)) throw new Error(`Empty difficulty band: ${counts.join(",")}`);
await writeFile(targetUrl, `// Generated from demo/assets/locations.json by scripts/build-catalog.mjs.\nexport const CATALOG_VERSION = ${JSON.stringify(version)};\nexport const CATALOG = ${canonical};\n`);
console.log(`catalog ${playable.length} entries ${counts.join("/")} ${version}`);
