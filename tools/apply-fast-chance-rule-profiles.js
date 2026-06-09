const fs = require("fs");
const path = require("path");

const root = process.cwd();

function readJson(relPath) {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${relPath}`);
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function writeJson(relPath, value) {
  fs.writeFileSync(path.join(root, relPath), JSON.stringify(value, null, 2) + "\n", "utf8");
}

function writeText(relPath, value) {
  fs.writeFileSync(path.join(root, relPath), value.trimEnd() + "\n", "utf8");
}

function pickCatalogPath() {
  const candidates = [
    "data/full-rules-catalog.json",
    "full-rules-catalog.json"
  ];

  for (const relPath of candidates) {
    if (fs.existsSync(path.join(root, relPath))) return relPath;
  }

  throw new Error("Could not find full-rules-catalog.json in data/ or repo root.");
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function getFastChanceOnly(split) {
  if (isPlainObject(split.fastChanceOnly)) return split.fastChanceOnly;
  if (isPlainObject(split.fastChanceOnlyByKey)) return split.fastChanceOnlyByKey;
  if (isPlainObject(split.fastChanceOnlyCandidates)) return split.fastChanceOnlyCandidates;
  throw new Error("Could not find fastChanceOnly object in reports/rule-profile-fast-slow-split.json.");
}

function extractCandidateFields(item) {
  if (isPlainObject(item?.candidateProfileFields)) return item.candidateProfileFields;
  if (isPlainObject(item?.fields)) return item.fields;
  if (isPlainObject(item?.profileFields)) return item.profileFields;
  return item;
}

function cleanChanceFields(fields) {
  const allowed = [
    "globalInclusionChance",
    "activationChance",
    "dropoutChance"
  ];

  const cleaned = {};

  for (const field of allowed) {
    if (fields[field] === undefined || fields[field] === null) continue;

    const value = Number(fields[field]);

    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return {
        ok: false,
        reason: `Invalid ${field}: ${fields[field]}`
      };
    }

    cleaned[field] = value;
  }

  return {
    ok: Object.keys(cleaned).length > 0,
    fields: cleaned,
    reason: Object.keys(cleaned).length ? "" : "No supported chance fields"
  };
}

const splitPath = "reports/rule-profile-fast-slow-split.json";
const catalogPath = pickCatalogPath();

const split = readJson(splitPath);
const catalog = readJson(catalogPath);
const fastChanceOnly = getFastChanceOnly(split);

if (!catalog.rulePools) catalog.rulePools = {};
if (!catalog.rulePools.ruleProfiles) catalog.rulePools.ruleProfiles = {};
if (!catalog.rulePools.ruleProfiles.byKey) catalog.rulePools.ruleProfiles.byKey = {};

const allKeys = new Set(Array.isArray(catalog.allKeys) ? catalog.allKeys : []);
const byKey = catalog.rulePools.ruleProfiles.byKey;

const applied = [];
const unchanged = [];
const skippedExistingDifferent = [];
const skipped = [];

for (const [key, item] of Object.entries(fastChanceOnly)) {
  if (allKeys.size && !allKeys.has(key)) {
    skipped.push({
      key,
      reason: "Key not found exactly in catalog.allKeys"
    });
    continue;
  }

  const fieldsRaw = extractCandidateFields(item);
  const cleaned = cleanChanceFields(fieldsRaw);

  if (!cleaned.ok) {
    skipped.push({
      key,
      reason: cleaned.reason
    });
    continue;
  }

  const existing = isPlainObject(byKey[key]) ? byKey[key] : {};
  const conflictingFields = {};

  for (const [field, value] of Object.entries(cleaned.fields)) {
    if (existing[field] !== undefined && existing[field] !== value) {
      conflictingFields[field] = {
        existing: existing[field],
        candidate: value
      };
    }
  }

  if (Object.keys(conflictingFields).length) {
    skippedExistingDifferent.push({
      key,
      conflictingFields
    });
    continue;
  }

  const next = { ...existing };
  const changedFields = {};

  for (const [field, value] of Object.entries(cleaned.fields)) {
    if (existing[field] === value) continue;
    next[field] = value;
    changedFields[field] = value;
  }

  if (!Object.keys(changedFields).length) {
    unchanged.push({
      key,
      fields: cleaned.fields
    });
    continue;
  }

  byKey[key] = next;

  applied.push({
    key,
    changedFields,
    finalProfile: next
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  source: splitPath,
  catalogPath,
  totalFastChanceOnlyCandidates: Object.keys(fastChanceOnly).length,
  appliedCount: applied.length,
  unchangedCount: unchanged.length,
  skippedExistingDifferentCount: skippedExistingDifferent.length,
  skippedCount: skipped.length,
  applied,
  unchanged,
  skippedExistingDifferent,
  skipped
};

writeJson(catalogPath, catalog);
writeJson("reports/fast-chance-rule-profile-apply-report.json", report);

const lines = [];
lines.push("TEST PROJECT 2 — FAST CHANCE RULE PROFILE APPLY REPORT");
lines.push("");
lines.push(`Generated: ${report.generatedAt}`);
lines.push(`Source: ${report.source}`);
lines.push(`Catalog: ${report.catalogPath}`);
lines.push("");
lines.push("SUMMARY");
lines.push(`- total fast chance-only candidates: ${report.totalFastChanceOnlyCandidates}`);
lines.push(`- applied/changed: ${report.appliedCount}`);
lines.push(`- unchanged/already matched: ${report.unchangedCount}`);
lines.push(`- skipped because existing catalog value differed: ${report.skippedExistingDifferentCount}`);
lines.push(`- skipped for other reasons: ${report.skippedCount}`);
lines.push("");
lines.push("FIRST 80 APPLIED");
for (const entry of applied.slice(0, 80)) {
  lines.push(`- ${entry.key}: ${JSON.stringify(entry.changedFields)}`);
}
if (applied.length > 80) {
  lines.push(`- ... ${applied.length - 80} more in JSON report`);
}
lines.push("");
lines.push("SKIPPED EXISTING DIFFERENT VALUES");
if (!skippedExistingDifferent.length) {
  lines.push("- none");
} else {
  for (const entry of skippedExistingDifferent) {
    lines.push(`- ${entry.key}: ${JSON.stringify(entry.conflictingFields)}`);
  }
}
lines.push("");
lines.push("OTHER SKIPPED");
if (!skipped.length) {
  lines.push("- none");
} else {
  for (const entry of skipped.slice(0, 80)) {
    lines.push(`- ${entry.key}: ${entry.reason}`);
  }
  if (skipped.length > 80) {
    lines.push(`- ... ${skipped.length - 80} more in JSON report`);
  }
}

writeText("reports/fast-chance-rule-profile-apply-report.txt", lines.join("\n"));

console.log(lines.join("\n"));
