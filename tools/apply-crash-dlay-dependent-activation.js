const fs = require("fs");
const path = require("path");

const root = process.cwd();
const catalogPath = path.join(root, "data", "full-rules-catalog.json");
const reportJsonPath = path.join(root, "reports", "crash-dlay-dependent-activation-report.json");
const reportTxtPath = path.join(root, "reports", "crash-dlay-dependent-activation-report.txt");

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

function markDependentOnlyTarget(catalog, catalogKeys, targetKey, reason) {
  const result = {
    targetKey,
    previousActivationChance: null,
    previousDependentActivationOnly: null,
    status: ""
  };

  if (!catalogKeys.has(targetKey)) {
    result.status = "skipped_missing_target_key";
    return result;
  }

  const profile = ensureByKeyProfile(catalog, targetKey);

  result.previousActivationChance = profile.activationChance ?? null;
  result.previousDependentActivationOnly = profile.dependentActivationOnly ?? null;

  const alreadySet = profile.dependentActivationOnly === true && profile.activationChance === 0;

  profile.dependentActivationOnly = true;
  profile.activationChance = 0;
  profile.sourceNote = reason;

  result.status = alreadySet ? "unchanged_existing" : "set_dependent_only";
  return result;
}

const catalog = readJson(catalogPath);
const catalogKeys = getCatalogKeys(catalog);

const sourceKey = "samples/crash_metal_odd_metal (consolidated).wav";
const targetKey = "samples/crash_dlay_odd (consolidated).wav";

const dependentRuleResult = ensureDependentRule(
  catalog,
  catalogKeys,
  sourceKey,
  targetKey,
  0.1,
  "dependent_crash_dlay_after_normal_crash",
  "Saved definitions absolute final 2: crash_dlay_odd has a 10% activation chance if crash activates on the same bar."
);

const dependentOnlyResult = markDependentOnlyTarget(
  catalog,
  catalogKeys,
  targetKey,
  "Dependent activation target only: crash_dlay_odd should only roll after normal crash activates on the same bar."
);

writeJson(catalogPath, catalog);

const report = {
  generatedAt: new Date().toISOString(),
  batch: "crash dlay dependent activation",
  catalogPath: "data/full-rules-catalog.json",
  note: "Adds crash_dlay_odd as a dependent activation target of normal crash at 10%, and prevents independent direct activation.",
  dependentRuleResult,
  dependentOnlyResult
};

writeJson(reportJsonPath, report);

const lines = [];
lines.push("TEST PROJECT 2 - CRASH DLAY DEPENDENT ACTIVATION REPORT");
lines.push("");
lines.push(`Generated: ${report.generatedAt}`);
lines.push("Renderer change: none");
lines.push("Catalog change: crash_dlay_odd dependent activation");
lines.push("");
lines.push("Rule:");
lines.push("- crash_dlay_odd has 10% chance if crash_metal_odd_metal activates on the same bar.");
lines.push("- crash_dlay_odd is marked dependentActivationOnly so it does not roll independently.");
lines.push("");
lines.push("Dependent rule result:");
lines.push(`- ${dependentRuleResult.sourceKey} -> ${dependentRuleResult.targetKey}: ${dependentRuleResult.status}, chance=${dependentRuleResult.chance}`);
lines.push("");
lines.push("Dependent-only target result:");
lines.push(`- ${dependentOnlyResult.targetKey}: ${dependentOnlyResult.status}, previousActivationChance=${dependentOnlyResult.previousActivationChance}, newActivationChance=0`);

fs.writeFileSync(reportTxtPath, lines.join("\n").trimEnd() + "\n", "utf8");

console.log(lines.join("\n"));
