const fs = require("fs");
const path = require("path");

const root = process.cwd();
const catalogPath = path.join(root, "data", "full-rules-catalog.json");
const registryPath = path.join(root, "data", "stem-registry.json");
const reportJsonPath = path.join(root, "reports", "safe-soft-multiplier-batch-1a-report.json");
const reportTxtPath = path.join(root, "reports", "safe-soft-multiplier-batch-1a-report.txt");

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

function ruleId(sourceTag, targetTag, multiplier) {
  return `soft_${sourceTag}_with_${targetTag}_x${String(multiplier).replace(".", "_")}`.replace(/[^a-zA-Z0-9_]+/g, "_");
}

function ensureByTagProfile(catalog, tag) {
  if (!catalog.rulePools) catalog.rulePools = {};
  if (!catalog.rulePools.ruleProfiles) catalog.rulePools.ruleProfiles = {};
  if (!catalog.rulePools.ruleProfiles.byTag) catalog.rulePools.ruleProfiles.byTag = {};
  if (!catalog.rulePools.ruleProfiles.byTag[tag]) catalog.rulePools.ruleProfiles.byTag[tag] = {};
  if (!Array.isArray(catalog.rulePools.ruleProfiles.byTag[tag].softMultiplierRules)) {
    catalog.rulePools.ruleProfiles.byTag[tag].softMultiplierRules = [];
  }

  return catalog.rulePools.ruleProfiles.byTag[tag];
}

function collectExactRegistryTags(registry) {
  const entries = Array.isArray(registry.entries) ? registry.entries : [];
  const tags = new Set();

  for (const entry of entries) {
    for (const tag of Array.isArray(entry.tags) ? entry.tags : []) {
      tags.add(normalize(tag));
    }
  }

  return tags;
}

function addOneWaySoftMultiplier(catalog, exactTags, sourceTag, targetTag, multiplier, sourceNote) {
  const normalizedSource = normalize(sourceTag);
  const normalizedTarget = normalize(targetTag);

  if (!exactTags.has(normalizedSource)) {
    return {
      sourceTag,
      targetTag,
      multiplier,
      status: "skipped_missing_source_tag"
    };
  }

  if (!exactTags.has(normalizedTarget)) {
    return {
      sourceTag,
      targetTag,
      multiplier,
      status: "skipped_missing_target_tag"
    };
  }

  const profile = ensureByTagProfile(catalog, sourceTag);
  const id = ruleId(sourceTag, targetTag, multiplier);

  const alreadyExists = profile.softMultiplierRules.some(rule => rule.id === id);

  if (alreadyExists) {
    return {
      sourceTag,
      targetTag,
      multiplier,
      id,
      status: "unchanged_existing"
    };
  }

  profile.softMultiplierRules.push({
    id,
    multiplier,
    targets: [
      {
        tag: targetTag
      }
    ],
    sourceNote
  });

  return {
    sourceTag,
    targetTag,
    multiplier,
    id,
    status: "added"
  };
}

function addTwoWaySoftMultiplier(catalog, exactTags, tagA, tagB, multiplier, sourceNote) {
  return [
    addOneWaySoftMultiplier(catalog, exactTags, tagA, tagB, multiplier, sourceNote),
    addOneWaySoftMultiplier(catalog, exactTags, tagB, tagA, multiplier, sourceNote)
  ];
}

const catalog = readJson(catalogPath);
const registry = readJson(registryPath);
const exactTags = collectExactRegistryTags(registry);

const results = [];

results.push(...addTwoWaySoftMultiplier(
  catalog,
  exactTags,
  "floot",
  "tbone",
  0.1,
  "Definitions doc: floot and tbone are x0.1 as likely together."
));

results.push(...addTwoWaySoftMultiplier(
  catalog,
  exactTags,
  "accordian",
  "trumpet",
  0.1,
  "Definitions doc: accordian is x0.1 as likely with trumpet."
));

results.push(addOneWaySoftMultiplier(
  catalog,
  exactTags,
  "sax",
  "glock",
  0.4,
  "Definitions doc: if glock is active, sax activation chance is multiplied by x0.4."
));

results.push(addOneWaySoftMultiplier(
  catalog,
  exactTags,
  "tbone",
  "glock",
  0.4,
  "Definitions doc: if glock is active, tbone activation chance is multiplied by x0.4."
));

results.push(addOneWaySoftMultiplier(
  catalog,
  exactTags,
  "trumpet",
  "glock",
  0.4,
  "Definitions doc: if glock is active, trumpet activation chance is multiplied by x0.4."
));

results.push(addOneWaySoftMultiplier(
  catalog,
  exactTags,
  "clarinet",
  "glock",
  0.4,
  "Definitions doc: if glock is active, clarinet activation chance is multiplied by x0.4."
));

const added = results.filter(result => result.status === "added");
const unchanged = results.filter(result => result.status === "unchanged_existing");
const skipped = results.filter(result => result.status.startsWith("skipped_"));

const report = {
  generatedAt: new Date().toISOString(),
  catalogPath: "data/full-rules-catalog.json",
  registryPath: "data/stem-registry.json",
  batch: "safe soft multiplier rules batch 1A",
  note: "Safe subset only. No registry tag repair. No broad filename matching. Uses only exact tags already present in stem-registry.json.",
  addedCount: added.length,
  unchangedCount: unchanged.length,
  skippedCount: skipped.length,
  added,
  unchanged,
  skipped
};

writeJson(catalogPath, catalog);
writeJson(reportJsonPath, report);

const lines = [];
lines.push("TEST PROJECT 2 — SAFE SOFT MULTIPLIER BATCH 1A REPORT");
lines.push("");
lines.push(`Generated: ${report.generatedAt}`);
lines.push("Renderer/system change: none");
lines.push("Catalog field used: ruleProfiles.byTag.*.softMultiplierRules");
lines.push("Registry tag repair: none");
lines.push("");
lines.push(`Added rules: ${added.length}`);
lines.push(`Already existed: ${unchanged.length}`);
lines.push(`Skipped missing exact tags: ${skipped.length}`);
lines.push("");
lines.push("ADDED");
for (const item of added) {
  lines.push(`- ${item.sourceTag} x${item.multiplier} when ${item.targetTag} is active (${item.id})`);
}
if (!added.length) lines.push("- none");
lines.push("");
lines.push("SKIPPED");
for (const item of skipped) {
  lines.push(`- ${item.sourceTag} / ${item.targetTag} x${item.multiplier}: ${item.status}`);
}
if (!skipped.length) lines.push("- none");
lines.push("");
lines.push("UNCHANGED");
for (const item of unchanged) {
  lines.push(`- ${item.sourceTag} x${item.multiplier} when ${item.targetTag} is active (${item.id})`);
}
if (!unchanged.length) lines.push("- none");

fs.writeFileSync(reportTxtPath, lines.join("\n").trimEnd() + "\n", "utf8");

console.log(lines.join("\n"));
