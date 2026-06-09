const fs = require("fs");
const path = require("path");

const root = process.cwd();
const catalogPath = path.join(root, "data", "full-rules-catalog.json");
const registryPath = path.join(root, "data", "stem-registry.json");
const reportJsonPath = path.join(root, "reports", "grouped-activation-batch-1a-report.json");
const reportTxtPath = path.join(root, "reports", "grouped-activation-batch-1a-report.txt");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function ensureByKeyProfile(catalog, key) {
  if (!catalog.rulePools) catalog.rulePools = {};
  if (!catalog.rulePools.ruleProfiles) catalog.rulePools.ruleProfiles = {};
  if (!catalog.rulePools.ruleProfiles.byKey) catalog.rulePools.ruleProfiles.byKey = {};
  if (!catalog.rulePools.ruleProfiles.byKey[key]) catalog.rulePools.ruleProfiles.byKey[key] = {};
  if (!Array.isArray(catalog.rulePools.ruleProfiles.byKey[key].groupedActivationRules)) {
    catalog.rulePools.ruleProfiles.byKey[key].groupedActivationRules = [];
  }

  return catalog.rulePools.ruleProfiles.byKey[key];
}

function addGroupedRule(catalog, registryKeys, key, rule) {
  if (!registryKeys.has(key)) {
    return {
      key,
      status: "skipped_missing_key"
    };
  }

  const profile = ensureByKeyProfile(catalog, key);
  const alreadyExists = profile.groupedActivationRules.some(existing => existing.id === rule.id);

  if (alreadyExists) {
    return {
      key,
      id: rule.id,
      status: "unchanged_existing"
    };
  }

  profile.groupedActivationRules.push(rule);

  return {
    key,
    id: rule.id,
    status: "added"
  };
}

const catalog = readJson(catalogPath);
const registry = readJson(registryPath);

const registryKeys = new Set(
  (Array.isArray(registry.entries) ? registry.entries : []).map(entry => entry.key)
);

const hookJazzHatKeys = [
  "midi files/jazz_hats_metal_hook_even_~_ride04.mid",
  "midi files/jazz_hats_metal_hook_even_~_ridehard.mid"
];

const groupedRule = {
  id: "group_hook_jazz_hats_ride04_ridehard",
  groupId: "hook_jazz_hats_ride04_ridehard",
  scope: "bar",
  sourceNote: "User-confirmed: hook jazz hats ride04 and ridehard MIDI files activate together as one hook jazz hats pattern using two ride samples. No explicit chance is set; the first candidate uses its normal decision chance and the second reuses that grouped decision."
};

const results = hookJazzHatKeys.map(key => addGroupedRule(catalog, registryKeys, key, groupedRule));

const added = results.filter(result => result.status === "added");
const unchanged = results.filter(result => result.status === "unchanged_existing");
const skipped = results.filter(result => result.status.startsWith("skipped_"));

const report = {
  generatedAt: new Date().toISOString(),
  catalogPath: "data/full-rules-catalog.json",
  registryPath: "data/stem-registry.json",
  batch: "grouped activation batch 1A",
  note: "Adds groupedActivationRules only for the confirmed hook jazz hats ride04/ridehard pair. Does not implement delay-pair rules, because the existing grouped activation system does not create dependent extra activations.",
  addedCount: added.length,
  unchangedCount: unchanged.length,
  skippedCount: skipped.length,
  rule: groupedRule,
  results
};

writeJson(catalogPath, catalog);
writeJson(reportJsonPath, report);

const lines = [];
lines.push("TEST PROJECT 2 — GROUPED ACTIVATION BATCH 1A REPORT");
lines.push("");
lines.push(`Generated: ${report.generatedAt}`);
lines.push("Renderer/system change: none");
lines.push("Catalog field used: ruleProfiles.byKey.*.groupedActivationRules");
lines.push("Rule: hook jazz hats ride04 + ridehard share one grouped activation decision per bar.");
lines.push("");
lines.push(`Added rules: ${added.length}`);
lines.push(`Already existed: ${unchanged.length}`);
lines.push(`Skipped: ${skipped.length}`);
lines.push("");
lines.push("RESULTS");
for (const result of results) {
  lines.push(`- ${result.key}: ${result.status}`);
}
lines.push("");
lines.push("NOT IMPLEMENTED IN THIS BATCH");
lines.push("- crash_washes normal/delay pair");
lines.push("- big_crash_layer normal/delay pair");
lines.push("- any delay-follows-main behaviour");
lines.push("");
lines.push("Reason: existing grouped activation shares a decision only; it does not create extra dependent activations.");

fs.writeFileSync(reportTxtPath, lines.join("\n").trimEnd() + "\n", "utf8");

console.log(lines.join("\n"));
