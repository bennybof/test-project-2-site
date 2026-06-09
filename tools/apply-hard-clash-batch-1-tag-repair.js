const fs = require("fs");
const path = require("path");

const root = process.cwd();
const registryPath = path.join(root, "data", "stem-registry.json");
const reportJsonPath = path.join(root, "reports", "hard-clash-batch-1-tag-repair-report.json");
const reportTxtPath = path.join(root, "reports", "hard-clash-batch-1-tag-repair-report.txt");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${path.relative(root, filePath)}`);
  }

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

function hasTag(entry, tag) {
  const normalizedTag = normalize(tag);
  return (Array.isArray(entry.tags) ? entry.tags : []).some(existing => normalize(existing) === normalizedTag);
}

function addTag(entry, tag) {
  if (!Array.isArray(entry.tags)) entry.tags = [];

  if (hasTag(entry, tag)) {
    return false;
  }

  entry.tags.push(tag);
  return true;
}

function normalizedKey(entry) {
  return normalize(entry.key || "");
}

function normalizedFamily(entry) {
  return normalize(entry.family || "");
}

const registry = readJson(registryPath);
const entries = Array.isArray(registry.entries) ? registry.entries : [];

const repairs = [
  {
    tag: "bagoo_ext",
    reason: "Hard clash batch 1 uses bagoo_ext; registry had filename match but no exact tag.",
    matches: entry => normalizedKey(entry).includes("bagoo_ext")
  },
  {
    tag: "beepipes",
    reason: "Hard clash batch 1 uses beepipes; registry had family/filename matches but no exact tag.",
    matches: entry => normalizedFamily(entry) === "beepipes" || normalizedKey(entry).includes("beepipes")
  },
  {
    tag: "beepipes_ghosts",
    reason: "Hard clash batch 1 uses beepipes_ghosts; registry had filename match but no exact tag.",
    matches: entry => normalizedKey(entry).includes("beepipes_ghosts")
  },
  {
    tag: "breathe_vox_big",
    reason: "Hard clash batch 1 uses breathe_vox_big; registry had filename matches but no exact tag.",
    matches: entry => normalizedKey(entry).includes("breathe_vox_big")
  },
  {
    tag: "breathe_vox_small",
    reason: "Hard clash batch 1 uses breathe_vox_small; registry had filename matches but no exact tag.",
    matches: entry => normalizedKey(entry).includes("breathe_vox_small")
  },
  {
    tag: "cello_wiv_bass",
    reason: "Hard clash batch 1 uses cello_wiv_bass; registry filename uses wiv-bass but had no exact normalized tag.",
    matches: entry => normalizedKey(entry).includes("cello_wiv_bass")
  },
  {
    tag: "hippy_synth_wiv_bass",
    reason: "Hard clash batch 1 uses hippy_synth_wiv_bass; registry filename uses wiv-bass but had no exact normalized tag.",
    matches: entry => normalizedKey(entry).includes("hippy_synth_wiv_bass")
  },
  {
    tag: "pad_1",
    reason: "Hard clash batch 1 uses pad_1; registry had filename match but no exact tag.",
    matches: entry => normalizedKey(entry).includes("pad_1")
  },
  {
    tag: "pad_2",
    reason: "Hard clash batch 1 uses pad_2; registry had filename match but no exact tag.",
    matches: entry => normalizedKey(entry).includes("pad_2")
  },
  {
    tag: "pad_wiv_bass",
    reason: "Hard clash batch 1 uses pad_wiv_bass; registry filename uses wiv-bass but had no exact normalized tag.",
    matches: entry => normalizedKey(entry).includes("pad_wiv_bass")
  },
  {
    tag: "random_vox",
    reason: "Hard clash batch 1 uses random_vox; registry had filename matches but no exact tag.",
    matches: entry => normalizedKey(entry).includes("random_vox")
  },
  {
    tag: "rim",
    reason: "Hard clash batch 1 uses rim; registry had rim family/filename matches but no exact tag.",
    matches: entry => normalizedFamily(entry) === "rim" || /(^|_)rims?(_|$)/.test(normalizedKey(entry))
  },
  {
    tag: "rims_xtra_1",
    reason: "Hard clash batch 1 uses rims_xtra_1; registry had filename match but no exact tag.",
    matches: entry => normalizedKey(entry).includes("rims_xtra_1")
  },
  {
    tag: "rims_xtra_2",
    reason: "Hard clash batch 1 uses rims_xtra_2; registry had filename match but no exact tag.",
    matches: entry => normalizedKey(entry).includes("rims_xtra_2")
  },
  {
    tag: "rims_xtra_3",
    reason: "Hard clash batch 1 uses rims_xtra_3; registry had filename match but no exact tag.",
    matches: entry => normalizedKey(entry).includes("rims_xtra_3")
  },
  {
    tag: "sax_1",
    reason: "Hard clash batch 1 uses sax_1; registry had filename matches but no exact tag.",
    matches: entry => normalizedKey(entry).includes("sax_1")
  },
  {
    tag: "snare_pattern",
    reason: "Hard clash batch 1 uses snare_pattern; registry had filename match but no exact tag.",
    matches: entry => normalizedKey(entry).includes("snare_pattern")
  }
];

const results = [];

for (const repair of repairs) {
  const matched = [];

  for (const entry of entries) {
    if (!repair.matches(entry)) continue;

    const added = addTag(entry, repair.tag);

    matched.push({
      key: entry.key,
      added
    });
  }

  results.push({
    tag: repair.tag,
    reason: repair.reason,
    matchedCount: matched.length,
    addedCount: matched.filter(item => item.added).length,
    unchangedCount: matched.filter(item => !item.added).length,
    matched
  });
}

writeJson(registryPath, registry);

const report = {
  generatedAt: new Date().toISOString(),
  registryPath: "data/stem-registry.json",
  note: "Adds exact registry tags needed by hard clash batch 1. No renderer/system change.",
  results
};

writeJson(reportJsonPath, report);

const lines = [];
lines.push("TEST PROJECT 2 — HARD CLASH BATCH 1 TAG REPAIR REPORT");
lines.push("");
lines.push(`Generated: ${report.generatedAt}`);
lines.push("Renderer/system change: none");
lines.push("Purpose: make hard clash batch 1 byTag rules match real registry entries.");
lines.push("");

for (const result of results) {
  lines.push(`TAG: ${result.tag}`);
  lines.push(`- matched entries: ${result.matchedCount}`);
  lines.push(`- tags added: ${result.addedCount}`);
  lines.push(`- already had tag: ${result.unchangedCount}`);
  lines.push(`- reason: ${result.reason}`);

  for (const item of result.matched.slice(0, 8)) {
    lines.push(`  ${item.added ? "ADDED" : "UNCHANGED"}: ${item.key}`);
  }

  if (result.matched.length > 8) {
    lines.push(`  ... ${result.matched.length - 8} more`);
  }

  lines.push("");
}

fs.writeFileSync(reportTxtPath, lines.join("\n").trimEnd() + "\n", "utf8");

console.log(lines.join("\n"));
