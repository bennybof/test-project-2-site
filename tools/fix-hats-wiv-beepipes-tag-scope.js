const fs = require("fs");
const path = require("path");

const root = process.cwd();
const registryPath = path.join(root, "data", "stem-registry.json");
const reportJsonPath = path.join(root, "reports", "hats-wiv-beepipes-tag-scope-fix-report.json");
const reportTxtPath = path.join(root, "reports", "hats-wiv-beepipes-tag-scope-fix-report.txt");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^#/, "")
    .replace(/[\\/]+/g, "_")
    .replace(/[\s\-]+/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const registry = readJson(registryPath);
const entries = Array.isArray(registry.entries) ? registry.entries : [];

const targetKeys = new Set([
  "midi files/hats_wiv-beepipes_2_metal_odd_ch.mid",
  "midi files/hats_wiv-beepipes_2_metal_odd_oh.mid"
]);

const changed = [];
const unchanged = [];

for (const entry of entries) {
  if (!targetKeys.has(entry.key)) continue;

  const before = Array.isArray(entry.tags) ? [...entry.tags] : [];
  const after = before.filter(tag => normalize(tag) !== "beepipes");

  entry.tags = after;

  const record = {
    key: entry.key,
    before,
    after
  };

  if (before.length !== after.length) {
    changed.push(record);
  } else {
    unchanged.push(record);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  registryPath: "data/stem-registry.json",
  note: "Removes broad beepipes tag from hats_wiv-beepipes_2 patterns. These are hats that work with beepipes_2, not beepipes themselves.",
  changedCount: changed.length,
  unchangedCount: unchanged.length,
  changed,
  unchanged
};

writeJson(registryPath, registry);
writeJson(reportJsonPath, report);

const lines = [];
lines.push("TEST PROJECT 2 — HATS WIV-BEEPIPES TAG SCOPE FIX REPORT");
lines.push("");
lines.push(`Generated: ${report.generatedAt}`);
lines.push("Renderer/system change: none");
lines.push("Purpose: remove accidental broad beepipes tag from hats_wiv-beepipes_2 patterns.");
lines.push("");
lines.push(`Changed entries: ${changed.length}`);
lines.push(`Already unchanged: ${unchanged.length}`);
lines.push("");
lines.push("CHANGED");
for (const item of changed) {
  lines.push(`- ${item.key}`);
  lines.push(`  before: ${JSON.stringify(item.before)}`);
  lines.push(`  after:  ${JSON.stringify(item.after)}`);
}
if (!changed.length) lines.push("- none");
lines.push("");
lines.push("UNCHANGED");
for (const item of unchanged) {
  lines.push(`- ${item.key}`);
}
if (!unchanged.length) lines.push("- none");

fs.writeFileSync(reportTxtPath, lines.join("\n").trimEnd() + "\n", "utf8");

console.log(lines.join("\n"));
