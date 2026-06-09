const fs = require("fs");
const path = require("path");

const root = process.cwd();
const catalogPath = path.join(root, "data", "full-rules-catalog.json");
const reportJsonPath = path.join(root, "reports", "hard-clash-batch-1-report.json");
const reportTxtPath = path.join(root, "reports", "hard-clash-batch-1-report.txt");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function ruleId(sourceTag, targetTag) {
  return `hard_clash_${sourceTag}_with_${targetTag}`.replace(/[^a-zA-Z0-9_]+/g, "_");
}

function ensureByTagProfile(catalog, tag) {
  if (!catalog.rulePools) catalog.rulePools = {};
  if (!catalog.rulePools.ruleProfiles) catalog.rulePools.ruleProfiles = {};
  if (!catalog.rulePools.ruleProfiles.byTag) catalog.rulePools.ruleProfiles.byTag = {};
  if (!catalog.rulePools.ruleProfiles.byTag[tag]) catalog.rulePools.ruleProfiles.byTag[tag] = {};
  if (!Array.isArray(catalog.rulePools.ruleProfiles.byTag[tag].hardClashRules)) {
    catalog.rulePools.ruleProfiles.byTag[tag].hardClashRules = [];
  }
  return catalog.rulePools.ruleProfiles.byTag[tag];
}

function addOneWayHardClash(catalog, sourceTag, targetTag, sourceNote) {
  const profile = ensureByTagProfile(catalog, sourceTag);
  const id = ruleId(sourceTag, targetTag);

  const alreadyExists = profile.hardClashRules.some(rule => rule.id === id);

  if (alreadyExists) {
    return {
      sourceTag,
      targetTag,
      id,
      status: "unchanged_existing"
    };
  }

  profile.hardClashRules.push({
    id,
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
    id,
    status: "added"
  };
}

function addTwoWayHardClash(catalog, tagA, tagB, sourceNote) {
  return [
    addOneWayHardClash(catalog, tagA, tagB, sourceNote),
    addOneWayHardClash(catalog, tagB, tagA, sourceNote)
  ];
}

if (!fs.existsSync(catalogPath)) {
  console.error("ERROR: Missing data/full-rules-catalog.json");
  process.exit(1);
}

const catalog = readJson(catalogPath);

const twoWayPairs = [
  {
    tags: ["breathe_vox_small", "breathe_vox_big"],
    sourceNote: "Definitions doc: breathe_vox_small and breathe_vox_big cannot activate at the same time."
  },
  {
    tags: ["pad_1", "pad_2"],
    sourceNote: "Definitions doc: pad_1 and pad_2 cannot play at the same time."
  },
  {
    tags: ["pad", "nuva_bass"],
    sourceNote: "Definitions doc: nuva_bass clashes with all pad stems."
  },
  {
    tags: ["bagoo_low", "bagoo"],
    sourceNote: "Definitions doc: bagoo_low cannot activate at the same time as bagoo."
  },
  {
    tags: ["bagoo", "tbone"],
    sourceNote: "Definitions doc: bagoo hard clashes with tbone."
  },
  {
    tags: ["bagoo_ext", "clarinet"],
    sourceNote: "Definitions doc: bagoo_ext hard clashes with clarinet."
  },
  {
    tags: ["random_vox", "sax_1"],
    sourceNote: "Definitions doc: sax_1 hard clashes with random_vox."
  },
  {
    tags: ["beeps", "bagoo"],
    sourceNote: "Definitions doc: beeps hard clash with bagoo."
  },
  {
    tags: ["beepipes_ghosts", "rim"],
    sourceNote: "Definitions doc: beepipes_ghosts hard clashes with all rims."
  },
  {
    tags: ["rims_xtra_1", "beepipes"],
    sourceNote: "Definitions doc: rims_xtra hard clashes with beepipes."
  },
  {
    tags: ["rims_xtra_2", "beepipes"],
    sourceNote: "Definitions doc: rims_xtra hard clashes with beepipes."
  },
  {
    tags: ["rims_xtra_3", "beepipes"],
    sourceNote: "Definitions doc: rims_xtra hard clashes with beepipes."
  },
  {
    tags: ["beepipes", "snare_pattern"],
    sourceNote: "Definitions doc: beepipes clash with snare_pattern, but can work with snare_xtra."
  },
  {
    tags: ["hippy_synth_wiv_bass", "pad_wiv_bass"],
    sourceNote: "Definitions doc: hippy_synth_wiv-bass, pad_wiv-bass, and cello_wiv-bass cannot play at the same time as each other."
  },
  {
    tags: ["hippy_synth_wiv_bass", "cello_wiv_bass"],
    sourceNote: "Definitions doc: hippy_synth_wiv-bass, pad_wiv-bass, and cello_wiv-bass cannot play at the same time as each other."
  },
  {
    tags: ["pad_wiv_bass", "cello_wiv_bass"],
    sourceNote: "Definitions doc: hippy_synth_wiv-bass, pad_wiv-bass, and cello_wiv-bass cannot play at the same time as each other."
  },
  {
    tags: ["hippy_synth_wiv_bass", "nuva_bass"],
    sourceNote: "Definitions doc: hippy_synth_wiv-bass cannot play with nuva_bass."
  },
  {
    tags: ["pad_wiv_bass", "nuva_bass"],
    sourceNote: "Definitions doc: pad_wiv-bass cannot play with nuva_bass."
  },
  {
    tags: ["cello_wiv_bass", "nuva_bass"],
    sourceNote: "Definitions doc: cello_wiv-bass cannot play with nuva_bass."
  }
];

const results = [];

for (const pair of twoWayPairs) {
  results.push(...addTwoWayHardClash(catalog, pair.tags[0], pair.tags[1], pair.sourceNote));
}

const added = results.filter(result => result.status === "added");
const unchanged = results.filter(result => result.status === "unchanged_existing");

const report = {
  generatedAt: new Date().toISOString(),
  catalogPath: "data/full-rules-catalog.json",
  batch: "high-confidence hard clash rules batch 1",
  note: "No new renderer system. Uses existing ruleProfiles.byTag hardClashRules only.",
  addedCount: added.length,
  unchangedCount: unchanged.length,
  added,
  unchanged
};

writeJson(catalogPath, catalog);
writeJson(reportJsonPath, report);

const lines = [];
lines.push("TEST PROJECT 2 — HARD CLASH BATCH 1 REPORT");
lines.push("");
lines.push(`Generated: ${report.generatedAt}`);
lines.push("Scope: high-confidence hard clashes from definitions doc");
lines.push("Renderer/system change: none");
lines.push("Catalog field used: ruleProfiles.byTag.*.hardClashRules");
lines.push("");
lines.push(`Added rules: ${added.length}`);
lines.push(`Already existed: ${unchanged.length}`);
lines.push("");
lines.push("ADDED");
for (const item of added) {
  lines.push(`- ${item.sourceTag} hard-clashes with ${item.targetTag} (${item.id})`);
}
if (!added.length) lines.push("- none");
lines.push("");
lines.push("UNCHANGED");
for (const item of unchanged) {
  lines.push(`- ${item.sourceTag} hard-clashes with ${item.targetTag} (${item.id})`);
}
if (!unchanged.length) lines.push("- none");

fs.writeFileSync(reportTxtPath, lines.join("\n").trimEnd() + "\n", "utf8");

console.log(lines.join("\n"));
