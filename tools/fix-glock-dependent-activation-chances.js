const fs = require("fs");
const path = require("path");

const root = process.cwd();
const catalogPath = path.join(root, "data", "full-rules-catalog.json");
const reportJsonPath = path.join(root, "reports", "fix-glock-dependent-activation-chances-report.json");
const reportTxtPath = path.join(root, "reports", "fix-glock-dependent-activation-chances-report.txt");

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

function ensureOrUpdateDependentRule(catalog, catalogKeys, sourceKey, targetKey, chance, id, sourceNote) {
  const result = {
    sourceKey,
    targetKey,
    id,
    chance,
    previousChance: null,
    status: ""
  };

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

  let rule = profile.dependentActivationRules.find(existingRule => existingRule.id === id);

  if (!rule) {
    rule = {
      id,
      targets: [{ key: targetKey }]
    };
    profile.dependentActivationRules.push(rule);
    result.status = "added";
  } else {
    result.previousChance = rule.chance;
    result.status = rule.chance === chance ? "unchanged_existing" : "updated";
  }

  rule.chance = chance;
  rule.targets = [{ key: targetKey }];
  rule.sourceNote = sourceNote;

  return result;
}

const catalog = readJson(catalogPath);
const catalogKeys = getCatalogKeys(catalog);

const results = [];

results.push(ensureOrUpdateDependentRule(
  catalog,
  catalogKeys,
  "samples/glock_ext_even (consolidated).wav",
  "samples/glock_ext_even_dlay (consolidated).wav",
  0.2,
  "dependent_glock_ext_delay_after_glock_ext",
  "Saved definitions absolute final 2: glock_ext_even_dlay has a 20% chance to activate when glock_ext_even activates."
));

results.push(ensureOrUpdateDependentRule(
  catalog,
  catalogKeys,
  "samples/glock_odd (consolidated).wav",
  "samples/glock_odd_dlay (consolidated).wav",
  0.2,
  "dependent_glock_odd_delay_after_glock_odd",
  "Saved definitions absolute final 2: glock_odd_dlay has a 20% chance to activate when glock_odd activates."
));

writeJson(catalogPath, catalog);

const report = {
  generatedAt: new Date().toISOString(),
  batch: "fix glock dependent activation chances",
  catalogPath: "data/full-rules-catalog.json",
  note: "Corrects glock dependent delay activation from the saved definitions source. Does not change independent activationChance/globalInclusionChance values.",
  results
};

writeJson(reportJsonPath, report);

const lines = [];
lines.push("TEST PROJECT 2 - FIX GLOCK DEPENDENT ACTIVATION CHANCES REPORT");
lines.push("");
lines.push(`Generated: ${report.generatedAt}`);
lines.push("Renderer change: none");
lines.push("Catalog change: correct/add glock dependent activation rules");
lines.push("");
lines.push("Important:");
lines.push("- Saved definitions say glock delay stems have 20% chance when the matching glock activates.");
lines.push("- This correction does not change independent activationChance/globalInclusionChance values.");
lines.push("");
lines.push("Results:");
for (const result of results) {
  const previous = result.previousChance === null ? "none" : result.previousChance;
  lines.push(`- ${result.sourceKey} -> ${result.targetKey}: ${result.status}, previousChance=${previous}, newChance=${result.chance}`);
}

fs.writeFileSync(reportTxtPath, lines.join("\n").trimEnd() + "\n", "utf8");

console.log(lines.join("\n"));
