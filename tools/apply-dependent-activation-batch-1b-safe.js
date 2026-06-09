const fs = require("fs");
const path = require("path");

const root = process.cwd();
const catalogPath = path.join(root, "data", "full-rules-catalog.json");
const reportJsonPath = path.join(root, "reports", "dependent-activation-batch-1b-safe-report.json");
const reportTxtPath = path.join(root, "reports", "dependent-activation-batch-1b-safe-report.txt");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function getCatalogKeys(catalog) {
  const keys = new Set(Array.isArray(catalog.allKeys) ? catalog.allKeys : []);

  for (const group of Object.values(catalog.groups || {})) {
    if (!Array.isArray(group?.entries)) continue;

    for (const entry of group.entries) {
      if (entry?.key) keys.add(entry.key);
    }
  }

  return keys;
}

function ensureByKeyProfile(catalog, key) {
  if (!catalog.rulePools) catalog.rulePools = {};
  if (!catalog.rulePools.ruleProfiles) catalog.rulePools.ruleProfiles = {};
  if (!catalog.rulePools.ruleProfiles.byKey) catalog.rulePools.ruleProfiles.byKey = {};
  if (!catalog.rulePools.ruleProfiles.byKey[key]) catalog.rulePools.ruleProfiles.byKey[key] = {};
  return catalog.rulePools.ruleProfiles.byKey[key];
}

function ensureDependentRule(catalog, catalogKeys, sourceKey, targetKey, chance, id, sourceNote) {
  const result = { sourceKey, targetKey, chance, id, status: "" };

  if (!catalogKeys.has(sourceKey)) {
    result.status = "skipped_missing_source_key";
    return result;
  }

  if (!catalogKeys.has(targetKey)) {
    result.status = "skipped_missing_target_key";
    return result;
  }

  const profile = ensureByKeyProfile(catalog, sourceKey);

  if (!Array.isArray(profile.dependentActivationRules)) {
    profile.dependentActivationRules = [];
  }

  if (profile.dependentActivationRules.some(rule => rule.id === id)) {
    result.status = "unchanged_existing";
    return result;
  }

  profile.dependentActivationRules.push({
    id,
    chance,
    targets: [{ key: targetKey }],
    sourceNote
  });

  result.status = "added";
  return result;
}

const catalog = readJson(catalogPath);
const catalogKeys = getCatalogKeys(catalog);

const dependentRuleResults = [];

dependentRuleResults.push(ensureDependentRule(
  catalog,
  catalogKeys,
  "samples/glock_ext_even (consolidated).wav",
  "samples/glock_ext_even_dlay (consolidated).wav",
  0.5,
  "dependent_glock_ext_delay_after_glock_ext",
  "Definitions: glock delay can activate with 50% chance when matching glock activates, while still keeping its independent activation chance."
));

dependentRuleResults.push(ensureDependentRule(
  catalog,
  catalogKeys,
  "samples/breathe_vox_stutter_odd_x2_xtra (consolidated).wav",
  "samples/breathe_vox_stutter_dlay_odd_x2 (consolidated).wav",
  0.2,
  "dependent_breathe_stutter_delay_after_first_stutter",
  "Definitions: breathe_vox_stutter_dlay has 20% chance with first stutter part, while still keeping its independent 5% activation chance."
));

writeJson(catalogPath, catalog);

const report = {
  generatedAt: new Date().toISOString(),
  batch: "dependent activation batch 1B safe",
  catalogPath: "data/full-rules-catalog.json",
  note: "Adds dependent activation rules only for candidates that should keep independent activation. No dependentActivationOnly flags are set in this batch.",
  dependentRuleResults
};

writeJson(reportJsonPath, report);

const lines = [];
lines.push("TEST PROJECT 2 - DEPENDENT ACTIVATION BATCH 1B SAFE REPORT");
lines.push("");
lines.push(`Generated: ${report.generatedAt}`);
lines.push("Catalog change: two dependent activation rules added");
lines.push("Renderer change: none");
lines.push("");
lines.push("Important:");
lines.push("- This batch does not set dependentActivationOnly.");
lines.push("- Target files keep their independent activation chances.");
lines.push("");
lines.push("Dependent source rules:");
for (const result of dependentRuleResults) {
  lines.push(`- ${result.sourceKey} -> ${result.targetKey} @ ${result.chance}: ${result.status}`);
}

fs.writeFileSync(reportTxtPath, lines.join("\n").trimEnd() + "\n", "utf8");

console.log(lines.join("\n"));
