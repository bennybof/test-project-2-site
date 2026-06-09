const fs = require("fs");
const path = require("path");

const root = process.cwd();
const catalogPath = path.join(root, "data", "full-rules-catalog.json");
const registryPath = path.join(root, "data", "stem-registry.json");
const reportJsonPath = path.join(root, "reports", "safe-soft-multiplier-batch-1b-report.json");
const reportTxtPath = path.join(root, "reports", "safe-soft-multiplier-batch-1b-report.txt");

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

function collectRegistryInfo(registry) {
  const entries = Array.isArray(registry.entries) ? registry.entries : [];
  const keys = new Set();
  const tags = new Set();

  for (const entry of entries) {
    keys.add(entry.key);

    for (const tag of Array.isArray(entry.tags) ? entry.tags : []) {
      tags.add(normalize(tag));
    }
  }

  return { entries, keys, tags };
}

function ensureProfile(catalog, bucketName, name) {
  if (!catalog.rulePools) catalog.rulePools = {};
  if (!catalog.rulePools.ruleProfiles) catalog.rulePools.ruleProfiles = {};
  if (!catalog.rulePools.ruleProfiles[bucketName]) catalog.rulePools.ruleProfiles[bucketName] = {};
  if (!catalog.rulePools.ruleProfiles[bucketName][name]) catalog.rulePools.ruleProfiles[bucketName][name] = {};
  if (!Array.isArray(catalog.rulePools.ruleProfiles[bucketName][name].softMultiplierRules)) {
    catalog.rulePools.ruleProfiles[bucketName][name].softMultiplierRules = [];
  }

  return catalog.rulePools.ruleProfiles[bucketName][name];
}

function targetLabel(target) {
  if (target.key) return `key:${target.key}`;
  if (target.tag) return `tag:${target.tag}`;
  if (target.family) return `family:${target.family}`;
  return JSON.stringify(target);
}

function ruleId(sourceBucket, sourceName, target, multiplier) {
  return `soft_${sourceBucket}_${sourceName}_with_${targetLabel(target)}_x${String(multiplier).replace(".", "_")}`
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hasValidSource(registryInfo, bucketName, sourceName) {
  if (bucketName === "byKey") return registryInfo.keys.has(sourceName);
  if (bucketName === "byTag") return registryInfo.tags.has(normalize(sourceName));
  return false;
}

function hasValidTarget(registryInfo, target) {
  if (target.key) return registryInfo.keys.has(target.key);
  if (target.tag) return registryInfo.tags.has(normalize(target.tag));
  return false;
}

function addSoftRule(catalog, registryInfo, bucketName, sourceName, target, multiplier, sourceNote) {
  if (!hasValidSource(registryInfo, bucketName, sourceName)) {
    return {
      bucketName,
      sourceName,
      target,
      multiplier,
      status: "skipped_missing_source"
    };
  }

  if (!hasValidTarget(registryInfo, target)) {
    return {
      bucketName,
      sourceName,
      target,
      multiplier,
      status: "skipped_missing_target"
    };
  }

  const profile = ensureProfile(catalog, bucketName, sourceName);
  const id = ruleId(bucketName, sourceName, target, multiplier);

  const alreadyExists = profile.softMultiplierRules.some(rule => rule.id === id);

  if (alreadyExists) {
    return {
      bucketName,
      sourceName,
      target,
      multiplier,
      id,
      status: "unchanged_existing"
    };
  }

  profile.softMultiplierRules.push({
    id,
    multiplier,
    targets: [target],
    sourceNote
  });

  return {
    bucketName,
    sourceName,
    target,
    multiplier,
    id,
    status: "added"
  };
}

const catalog = readJson(catalogPath);
const registry = readJson(registryPath);
const registryInfo = collectRegistryInfo(registry);

const results = [];

function add(bucketName, sourceName, target, multiplier, sourceNote) {
  results.push(addSoftRule(catalog, registryInfo, bucketName, sourceName, target, multiplier, sourceNote));
}

function addTwoWayTagAndKey(tag, key, multiplier, sourceNote) {
  add("byTag", tag, { key }, multiplier, sourceNote);
  add("byKey", key, { tag }, multiplier, sourceNote);
}

const breatheStutterKeys = [
  "samples/breathe_vox_stutter_dlay_odd_x2 (consolidated).wav",
  "samples/breathe_vox_stutter_odd_x2_xtra (consolidated).wav",
  "samples/breathe_vox_stutter_xtra #2 (consolidated).wav",
  "samples/breathe_vox_stutter_xtra #3 (consolidated).wav",
  "samples/breathe_vox_stutter_xtra #4 (consolidated).wav",
  "samples/breathe_vox_stutter_xtra #5 (consolidated).wav",
  "samples/breathe_vox_stutter_xtra #6 (consolidated).wav",
  "samples/breathe_vox_stutter_xtra #7 (consolidated).wav",
  "samples/breathe_vox_stutter_xtra #8 (consolidated).wav",
  "samples/breathe_vox_stutter_xtra #9 (consolidated).wav"
];

const vlinsLongKey = "samples/vlins_long_suspense_odd_x2 (consolidated).wav";
const tbone1Key = "samples/tbone_1_even_x2 (consolidated).wav";
const tbone2Key = "samples/tbone_2_even_x2 (consolidated).wav";
const celloHighKey = "samples/cello_high_even_x2 (consolidated).wav";
const floot1Key = "samples/floot_1_even_x4 (consolidated).wav";
const floot2Key = "samples/floot_2_even_x4 (consolidated).wav";
const vlins1Key = "samples/vlins_1_even_x2 (consolidated).wav";

for (const key of breatheStutterKeys) {
  add("byKey", key, { tag: "breathe_vox_big" }, 0.2, "Definitions doc: breathe stutter and non-stutter breathe_vox are much less likely together; exact-key safe version.");
  add("byKey", key, { tag: "breathe_vox_small" }, 0.2, "Definitions doc: breathe stutter and non-stutter breathe_vox are much less likely together; exact-key safe version.");
  add("byTag", "breathe_vox_big", { key }, 0.2, "Definitions doc: breathe stutter and non-stutter breathe_vox are much less likely together; exact-key safe reverse rule.");
  add("byTag", "breathe_vox_small", { key }, 0.2, "Definitions doc: breathe stutter and non-stutter breathe_vox are much less likely together; exact-key safe reverse rule.");
}

add("byTag", "sax", { key: vlinsLongKey }, 0.1, "Definitions doc: if vlins_long_suspense is active, sax activation chance is multiplied by x0.1.");
add("byTag", "accordian", { key: vlinsLongKey }, 0.1, "Definitions doc: if vlins_long_suspense is active, accordian activation chance is multiplied by x0.1.");
add("byTag", "trumpet", { key: vlinsLongKey }, 0.1, "Definitions doc: if vlins_long_suspense is active, trumpet activation chance is multiplied by x0.1.");
add("byKey", tbone1Key, { key: vlinsLongKey }, 0.1, "Definitions doc: if vlins_long_suspense is active, tbone_1 activation chance is multiplied by x0.1.");
add("byTag", "clarinet", { key: vlinsLongKey }, 0.1, "Definitions doc: if vlins_long_suspense is active, clarinet activation chance is multiplied by x0.1.");
add("byKey", celloHighKey, { key: vlinsLongKey }, 0.1, "Definitions doc: if vlins_long_suspense is active, cello_high activation chance is multiplied by x0.1.");
add("byKey", floot1Key, { key: vlinsLongKey }, 0.1, "Definitions doc: if vlins_long_suspense is active, floot_1 activation chance is multiplied by x0.1.");

addTwoWayTagAndKey("clarinet", tbone1Key, 0.1, "Definitions doc: tbone_1 is x0.1 as likely with clarinet patterns.");
add("byKey", tbone1Key, { key: celloHighKey }, 0.1, "Definitions doc: tbone_1 is x0.1 as likely with cello_high.");
add("byKey", celloHighKey, { key: tbone1Key }, 0.1, "Definitions doc: cello_high is x0.1 as likely with tbone_1.");

addTwoWayTagAndKey("trumpet", floot2Key, 0.1, "Definitions doc: floot_2 is x0.1 as likely with trumpet.");
addTwoWayTagAndKey("trumpet", tbone2Key, 0.1, "Definitions doc: tbone_2 is x0.1 as likely with trumpet.");
addTwoWayTagAndKey("trumpet", vlins1Key, 0.1, "Definitions doc: vlins_1 is x0.1 as likely with trumpet.");

const added = results.filter(result => result.status === "added");
const unchanged = results.filter(result => result.status === "unchanged_existing");
const skipped = results.filter(result => result.status.startsWith("skipped_"));

const report = {
  generatedAt: new Date().toISOString(),
  catalogPath: "data/full-rules-catalog.json",
  registryPath: "data/stem-registry.json",
  batch: "safe soft multiplier rules batch 1B",
  note: "Exact-key safe batch. No registry tag repair. Broad synth/pno-synth and drowned/drowner rules intentionally excluded.",
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
lines.push("TEST PROJECT 2 — SAFE SOFT MULTIPLIER BATCH 1B REPORT");
lines.push("");
lines.push(`Generated: ${report.generatedAt}`);
lines.push("Renderer/system change: none");
lines.push("Catalog fields used: ruleProfiles.byKey.*.softMultiplierRules and ruleProfiles.byTag.*.softMultiplierRules");
lines.push("Registry tag repair: none");
lines.push("Excluded: broad synth rules, pno/synth rules, drowned/drowner rules");
lines.push("");
lines.push(`Added rules: ${added.length}`);
lines.push(`Already existed: ${unchanged.length}`);
lines.push(`Skipped missing exact source/target: ${skipped.length}`);
lines.push("");
lines.push("ADDED");
for (const item of added) {
  lines.push(`- ${item.bucketName}.${item.sourceName} x${item.multiplier} when ${targetLabel(item.target)} is active (${item.id})`);
}
if (!added.length) lines.push("- none");
lines.push("");
lines.push("SKIPPED");
for (const item of skipped) {
  lines.push(`- ${item.bucketName}.${item.sourceName} / ${targetLabel(item.target)} x${item.multiplier}: ${item.status}`);
}
if (!skipped.length) lines.push("- none");
lines.push("");
lines.push("UNCHANGED");
for (const item of unchanged) {
  lines.push(`- ${item.bucketName}.${item.sourceName} x${item.multiplier} when ${targetLabel(item.target)} is active (${item.id})`);
}
if (!unchanged.length) lines.push("- none");

fs.writeFileSync(reportTxtPath, lines.join("\n").trimEnd() + "\n", "utf8");

console.log(lines.join("\n"));
