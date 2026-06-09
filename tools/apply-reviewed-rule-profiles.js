const fs = require("fs");
const path = require("path");

const root = process.cwd();

const args = new Set(process.argv.slice(2));
const applyMode = args.has("--apply");
const makeTemplateMode = args.has("--make-template");

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const inputRelPath = argValue("--input", "reports/reviewed-rule-profile-apply.json");
const catalogRelPath = "data/full-rules-catalog.json";
const splitRelPath = "reports/rule-profile-fast-slow-split.json";

const allowedFields = new Set([
  "globalInclusionChance",
  "activationChance",
  "dropoutChance"
]);

function readJson(relPath) {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing file: ${relPath}`);
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function writeJson(relPath, value) {
  fs.writeFileSync(path.join(root, relPath), JSON.stringify(value, null, 2) + "\n", "utf8");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateProbability(value, field, key) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key}.${field} must be a number`);
  }

  if (value < 0 || value > 1) {
    throw new Error(`${key}.${field} must be between 0 and 1`);
  }
}

function validateEntry(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Entry ${index} must be an object`);
  }

  if (entry.enabled !== true) {
    return { enabled: false };
  }

  if (!entry.key || typeof entry.key !== "string") {
    throw new Error(`Enabled entry ${index} is missing string key`);
  }

  if (!entry.profile || typeof entry.profile !== "object" || Array.isArray(entry.profile)) {
    throw new Error(`Enabled entry ${index} is missing profile object`);
  }

  const fields = Object.keys(entry.profile);
  if (!fields.length) {
    throw new Error(`Enabled entry ${index} has empty profile`);
  }

  for (const field of fields) {
    if (!allowedFields.has(field)) {
      throw new Error(`Enabled entry ${index} uses unsupported field '${field}'`);
    }

    validateProbability(entry.profile[field], field, entry.key);
  }

  return { enabled: true };
}

function makeTemplate() {
  const split = readJson(splitRelPath);
  const fast = split.fastChanceOnly || {};
  const entries = Object.entries(fast).map(([key, item]) => ({
    enabled: false,
    key,
    profile: item.candidateProfileFields,
    sourceLines: item.sourceLines || [],
    note: "Set enabled to true only after this entry has been reviewed."
  }));

  const template = {
    instructions: [
      "This file is intentionally disabled by default.",
      "Only entries with enabled:true will be applied.",
      "Only globalInclusionChance, activationChance, and dropoutChance are allowed by this apply script.",
      "Run without --apply first for dry-run.",
      "Run with --apply only after reviewing the dry-run output."
    ],
    source: splitRelPath,
    generatedAt: new Date().toISOString(),
    entries
  };

  writeJson(inputRelPath, template);
  console.log(`WROTE TEMPLATE: ${inputRelPath}`);
  console.log(`Entries written disabled: ${entries.length}`);
}

function applyReviewedProfiles() {
  const review = readJson(inputRelPath);
  const catalog = readJson(catalogRelPath);
  const nextCatalog = clone(catalog);

  if (!Array.isArray(review.entries)) {
    throw new Error(`${inputRelPath} must contain an entries array`);
  }

  if (!nextCatalog.rulePools) nextCatalog.rulePools = {};
  if (!nextCatalog.rulePools.ruleProfiles) nextCatalog.rulePools.ruleProfiles = {};
  if (!nextCatalog.rulePools.ruleProfiles.byKey) nextCatalog.rulePools.ruleProfiles.byKey = {};

  const enabledEntries = [];

  review.entries.forEach((entry, index) => {
    const validation = validateEntry(entry, index);
    if (validation.enabled) enabledEntries.push(entry);
  });

  const changes = [];

  for (const entry of enabledEntries) {
    const before = nextCatalog.rulePools.ruleProfiles.byKey[entry.key] || {};
    const after = {
      ...before,
      ...entry.profile
    };

    nextCatalog.rulePools.ruleProfiles.byKey[entry.key] = after;

    changes.push({
      key: entry.key,
      before,
      applied: entry.profile,
      after
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: applyMode ? "APPLY" : "DRY_RUN",
    input: inputRelPath,
    enabledEntryCount: enabledEntries.length,
    changes
  };

  writeJson("reports/reviewed-rule-profile-apply-report.json", report);

  if (applyMode) {
    const backupRelPath = `reports/full-rules-catalog.before-reviewed-rule-profile-apply.${Date.now()}.json`;
    writeJson(backupRelPath, catalog);
    writeJson(catalogRelPath, nextCatalog);

    console.log(`APPLIED enabled entries: ${enabledEntries.length}`);
    console.log(`BACKUP WRITTEN: ${backupRelPath}`);
    console.log(`CATALOG UPDATED: ${catalogRelPath}`);
  } else {
    console.log(`DRY RUN ONLY. Enabled entries that would be applied: ${enabledEntries.length}`);
    console.log("No catalog changes were made.");
  }

  console.log("REPORT WRITTEN: reports/reviewed-rule-profile-apply-report.json");
}

if (makeTemplateMode) {
  makeTemplate();
} else {
  applyReviewedProfiles();
}
