const fs = require("fs");

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
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

const catalog = readJson("data/full-rules-catalog.json");
const registry = readJson("data/stem-registry.json");

const entries = Array.isArray(registry.entries) ? registry.entries : [];
const byTag = catalog?.rulePools?.ruleProfiles?.byTag || {};

const usedTags = new Set();

for (const [sourceTag, profile] of Object.entries(byTag)) {
  const hardClashRules = Array.isArray(profile.hardClashRules) ? profile.hardClashRules : [];

  for (const rule of hardClashRules) {
    if (!String(rule.id || "").startsWith("hard_clash_")) continue;

    usedTags.add(normalize(sourceTag));

    for (const target of rule.targets || []) {
      if (target.tag) usedTags.add(normalize(target.tag));
    }
  }
}

const exactHits = {};

for (const tag of usedTags) {
  exactHits[tag] = [];
}

for (const entry of entries) {
  const tags = Array.isArray(entry.tags) ? entry.tags.map(normalize) : [];

  for (const tag of usedTags) {
    if (tags.includes(tag)) {
      exactHits[tag].push(entry.key);
    }
  }
}

const results = [...usedTags].sort().map(tag => ({
  tag,
  exactHitCount: exactHits[tag].length,
  exactHits: exactHits[tag]
}));

const missing = results.filter(result => result.exactHitCount === 0);

const report = {
  generatedAt: new Date().toISOString(),
  catalogPath: "data/full-rules-catalog.json",
  registryPath: "data/stem-registry.json",
  scope: "All hard_clash_* ruleProfiles.byTag source and target tags",
  checkedTagCount: results.length,
  missingExactTagCount: missing.length,
  results
};

fs.writeFileSync("reports/hard-clash-tag-coverage-verification.json", JSON.stringify(report, null, 2) + "\n", "utf8");

const lines = [];
lines.push("TEST PROJECT 2 — HARD CLASH TAG COVERAGE VERIFICATION");
lines.push("");
lines.push(`Generated: ${report.generatedAt}`);
lines.push(`Checked tags: ${report.checkedTagCount}`);
lines.push(`Missing exact tags: ${report.missingExactTagCount}`);
lines.push("");
lines.push("RESULTS");

for (const result of results) {
  lines.push(`- ${result.tag}: ${result.exactHitCount} exact hits`);
  for (const key of result.exactHits.slice(0, 5)) {
    lines.push(`  ${key}`);
  }
  if (result.exactHits.length > 5) {
    lines.push(`  ... ${result.exactHits.length - 5} more`);
  }
}

fs.writeFileSync("reports/hard-clash-tag-coverage-verification.txt", lines.join("\n").trimEnd() + "\n", "utf8");

console.log(lines.join("\n"));
