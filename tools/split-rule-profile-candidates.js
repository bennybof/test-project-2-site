const fs = require("fs");
const path = require("path");

const root = process.cwd();

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), "utf8"));
}

function writeJson(relPath, value) {
  fs.writeFileSync(path.join(root, relPath), JSON.stringify(value, null, 2) + "\n", "utf8");
}

function writeText(relPath, value) {
  fs.writeFileSync(path.join(root, relPath), value, "utf8");
}

const supportedFastFields = new Set([
  "globalInclusionChance",
  "activationChance",
  "dropoutChance"
]);

const candidates = readJson("reports/rule-profile-batch-candidates.json");
const byKey = candidates?.candidateProfileFields?.byKey || {};
const genericCandidates = candidates?.genericSystemCandidates || [];

const fastChanceOnly = {};
const reviewBecauseMixedOrUnclassified = {};
const slowGenericByKind = {};
const slowGenericByKey = {};

for (const [key, item] of Object.entries(byKey)) {
  const fields = item.candidateProfileFields || {};
  const fieldNames = Object.keys(fields);
  const reviewNotes = item.reviewNotes || [];

  const isChanceOnly = fieldNames.length > 0 && fieldNames.every(field => supportedFastFields.has(field));
  const hasReviewNotes = reviewNotes.length > 0;

  const outputItem = {
    candidateProfileFields: fields,
    sourceLines: item.sourceLines || [],
    evidence: item.evidence || [],
    reviewNotes,
    safety: "review before apply"
  };

  if (isChanceOnly && !hasReviewNotes) {
    fastChanceOnly[key] = outputItem;
  } else {
    reviewBecauseMixedOrUnclassified[key] = {
      ...outputItem,
      reason: hasReviewNotes
        ? "contains unclassified prose chance lines"
        : "contains fields outside simple chance-only fast set"
    };
  }
}

for (const item of genericCandidates) {
  const kinds = item.kinds || [];

  for (const kind of kinds) {
    if (!slowGenericByKind[kind]) slowGenericByKind[kind] = [];
    slowGenericByKind[kind].push(item);
  }

  if (!slowGenericByKey[item.key]) slowGenericByKey[item.key] = [];
  slowGenericByKey[item.key].push({
    line: item.line,
    kinds,
    text: item.text
  });
}

const split = {
  generatedAt: new Date().toISOString(),
  source: "reports/rule-profile-batch-candidates.json",
  important: [
    "This is a report-only split.",
    "Do not auto-apply these profiles without a separate safe apply step.",
    "Fast means the renderer appears to support the fields, not that the parsed values are guaranteed musically correct.",
    "Slow means build/confirm generic systems before applying at scale."
  ],
  summary: {
    fastChanceOnlyCount: Object.keys(fastChanceOnly).length,
    reviewBecauseMixedOrUnclassifiedCount: Object.keys(reviewBecauseMixedOrUnclassified).length,
    slowGenericCandidateCount: genericCandidates.length,
    slowGenericKindCounts: Object.fromEntries(
      Object.entries(slowGenericByKind).map(([kind, items]) => [kind, items.length])
    )
  },
  fastChanceOnly,
  reviewBecauseMixedOrUnclassified,
  slowGenericByKind,
  slowGenericByKey
};

const textLines = [];
textLines.push("TEST PROJECT 2 — FAST / SLOW RULE SPLIT");
textLines.push("");
textLines.push(`Generated: ${split.generatedAt}`);
textLines.push(`Source: ${split.source}`);
textLines.push("");
textLines.push("SUMMARY");
textLines.push(`- fast chance-only candidates: ${split.summary.fastChanceOnlyCount}`);
textLines.push(`- mixed/unclassified candidates needing review: ${split.summary.reviewBecauseMixedOrUnclassifiedCount}`);
textLines.push(`- slow generic-system candidate blocks: ${split.summary.slowGenericCandidateCount}`);
textLines.push("");
textLines.push("SLOW GENERIC SYSTEM COUNTS");
for (const [kind, count] of Object.entries(split.summary.slowGenericKindCounts)) {
  textLines.push(`- ${kind}: ${count}`);
}
textLines.push("");
textLines.push("FAST CHANCE-ONLY CANDIDATES — FIRST 80");
const fastEntries = Object.entries(fastChanceOnly);
if (!fastEntries.length) {
  textLines.push("- none");
} else {
  for (const [key, item] of fastEntries.slice(0, 80)) {
    textLines.push(`- ${key}: ${JSON.stringify(item.candidateProfileFields)}`);
  }
  if (fastEntries.length > 80) {
    textLines.push(`- ... ${fastEntries.length - 80} more in JSON`);
  }
}
textLines.push("");
textLines.push("NEXT IMPLEMENTATION PRIORITY");
textLines.push("1. Build safe batch apply script for reviewed fast chance-only byKey profiles.");
textLines.push("2. Build groupedActivation generic system.");
textLines.push("3. Build delayFollowsMain generic system.");
textLines.push("4. Build generic variantChooser/replacement system.");
textLines.push("5. Add noDropoutBeforeBars/minimum-active support.");
textLines.push("");
textLines.push("FILES WRITTEN");
textLines.push("- reports/rule-profile-fast-slow-split.json");
textLines.push("- reports/rule-profile-fast-slow-split.txt");
textLines.push("");

writeJson("reports/rule-profile-fast-slow-split.json", split);
writeText("reports/rule-profile-fast-slow-split.txt", textLines.join("\n"));

console.log(textLines.join("\n"));
