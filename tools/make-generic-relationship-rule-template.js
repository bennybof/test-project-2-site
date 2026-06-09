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
  fs.writeFileSync(path.join(root, relPath), value, "utf8");
}

function shortText(value, max = 700) {
  const text = String(value || "")
    .split(/\r?\n/g)
    .map(line => line.trim())
    .filter(Boolean)
    .join(" | ")
    .trim();

  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

function makeEmptyRule(kind) {
  if (kind === "hardClash") {
    return {
      supportedByRendererNow: true,
      targetToFillManually: { key: "", family: "", tag: "", kind: "" },
      profileField: "hardClashRules",
      profileValueExample: [
        {
          id: "example_hard_clash",
          targets: [
            { tag: "example_target_tag" }
          ]
        }
      ]
    };
  }

  if (kind === "softMultiplier") {
    return {
      supportedByRendererNow: true,
      targetToFillManually: { key: "", family: "", tag: "", kind: "" },
      multiplierToFillManually: 1,
      profileField: "softMultiplierRules",
      profileValueExample: [
        {
          id: "example_soft_multiplier",
          multiplier: 0.5,
          targets: [
            { tag: "example_target_tag" }
          ]
        }
      ]
    };
  }

  if (kind === "requiredActive_or_onlyAfterActive") {
    return {
      supportedByRendererNow: "partly",
      warning: "Renderer supports active-now dependencies. History/previously-activated dependencies still need build/check.",
      targetToFillManually: { key: "", family: "", tag: "", kind: "" },
      profileField: "dependencies",
      profileValueExample: [
        {
          id: "example_requires_active",
          targets: [
            { tag: "example_required_active_tag" }
          ]
        }
      ]
    };
  }

  if (kind === "groupedActivation") {
    return {
      supportedByRendererNow: false,
      needsGenericSystem: true,
      warning: "Do not apply as ruleProfile yet. Build groupedActivation renderer support first.",
      groupIdToFillManually: "",
      groupedKeysToFillManually: []
    };
  }

  if (kind === "delayFollowsMain") {
    return {
      supportedByRendererNow: false,
      needsGenericSystem: true,
      warning: "Do not apply as ruleProfile yet. Build delayFollowsMain renderer support first.",
      mainKeyToFillManually: "",
      delayKeyToFillManually: "",
      chanceToFillManually: null
    };
  }

  if (kind === "variantChooser_or_replacement") {
    return {
      supportedByRendererNow: false,
      needsGenericSystem: true,
      warning: "Do not apply as ruleProfile yet. Build generic variantChooser/replacement support first.",
      baseKeyToFillManually: "",
      variantKeysToFillManually: [],
      conditionToFillManually: ""
    };
  }

  if (kind === "noDropoutBeforeBars") {
    return {
      supportedByRendererNow: false,
      needsGenericSystem: true,
      warning: "Do not apply as ruleProfile yet. Build noDropoutBeforeBars/minimum-active support first.",
      barsToFillManually: null
    };
  }

  return {
    supportedByRendererNow: false,
    warning: "Unknown generic relationship kind. Review manually."
  };
}

const split = readJson("reports/rule-profile-fast-slow-split.json");
const slowByKind = split.slowGenericByKind || {};

const preferredKindOrder = [
  "hardClash",
  "softMultiplier",
  "requiredActive_or_onlyAfterActive",
  "groupedActivation",
  "delayFollowsMain",
  "variantChooser_or_replacement",
  "noDropoutBeforeBars"
];

const entries = [];

for (const kind of preferredKindOrder) {
  const items = Array.isArray(slowByKind[kind]) ? slowByKind[kind] : [];

  for (const item of items) {
    entries.push({
      enabled: false,
      kind,
      sourceKey: item.key || "",
      sourceLine: item.line || null,
      sourceTextPreview: shortText(item.text),
      reviewDecision: "unreviewed",
      ruleDraft: makeEmptyRule(kind),
      note: "Keep enabled:false until the relationship has been checked against the saved definitions and exact target has been filled."
    });
  }
}

const template = {
  generatedAt: new Date().toISOString(),
  source: "reports/rule-profile-fast-slow-split.json",
  instructions: [
    "This is a review template only.",
    "It does not change renderer behaviour.",
    "Only hardClash, softMultiplier, and active-now dependencies are currently supported by existing renderer ruleProfiles.",
    "groupedActivation, delayFollowsMain, variantChooser/replacement, and noDropoutBeforeBars need generic renderer systems before applying at scale.",
    "Do not set enabled:true until exact targets and rule meaning have been checked."
  ],
  summary: {
    totalEntries: entries.length,
    byKind: Object.fromEntries(
      preferredKindOrder.map(kind => [kind, entries.filter(entry => entry.kind === kind).length])
    )
  },
  entries
};

const textLines = [];
textLines.push("TEST PROJECT 2 — GENERIC RELATIONSHIP RULE REVIEW TEMPLATE");
textLines.push("");
textLines.push(`Generated: ${template.generatedAt}`);
textLines.push(`Source: ${template.source}`);
textLines.push("");
textLines.push("SUMMARY");
for (const [kind, count] of Object.entries(template.summary.byKind)) {
  textLines.push(`- ${kind}: ${count}`);
}
textLines.push("");
textLines.push("SUPPORTED BY RENDERER NOW");
textLines.push("- hardClash");
textLines.push("- softMultiplier");
textLines.push("- active-now dependency rules");
textLines.push("");
textLines.push("NEEDS GENERIC RENDERER SYSTEM BEFORE APPLYING");
textLines.push("- groupedActivation");
textLines.push("- delayFollowsMain");
textLines.push("- variantChooser_or_replacement");
textLines.push("- noDropoutBeforeBars");
textLines.push("");
textLines.push("FIRST 60 REVIEW ENTRIES");
for (const entry of entries.slice(0, 60)) {
  textLines.push(`- [${entry.kind}] ${entry.sourceKey} | line ${entry.sourceLine} | ${entry.sourceTextPreview}`);
}
if (entries.length > 60) {
  textLines.push(`- ... ${entries.length - 60} more in JSON`);
}
textLines.push("");
textLines.push("FILES WRITTEN");
textLines.push("- reports/generic-relationship-rule-template.json");
textLines.push("- reports/generic-relationship-rule-template.txt");
textLines.push("");

writeJson("reports/generic-relationship-rule-template.json", template);
writeText("reports/generic-relationship-rule-template.txt", textLines.join("\n"));

console.log(textLines.join("\n"));
