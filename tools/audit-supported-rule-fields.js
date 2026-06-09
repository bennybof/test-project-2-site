const fs = require("fs");
const path = require("path");

const root = process.cwd();

function readText(relPath) {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${relPath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

function readJson(relPath) {
  return JSON.parse(readText(relPath));
}

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function functionExists(source, name) {
  return new RegExp(`function\\s+${name}\\s*\\(`).test(source);
}

function getFunctionBlock(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) return "";

  const firstBrace = source.indexOf("{", start);
  if (firstBrace < 0) return "";

  let depth = 0;
  for (let i = firstBrace; i < source.length; i++) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }

  return "";
}

function quotedStringsFromFunction(source, name) {
  const block = getFunctionBlock(source, name);
  return [...block.matchAll(/"([^"]+)"/g)].map(match => match[1]);
}

function countMapAdd(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function collectTopLevelProfileFields(profile, out) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return;
  for (const key of Object.keys(profile)) {
    countMapAdd(out, key);
  }
}

function collectProfileFields(ruleProfiles) {
  const fields = new Map();

  collectTopLevelProfileFields(ruleProfiles.default, fields);
  collectTopLevelProfileFields(ruleProfiles.defaults, fields);

  for (const groupName of ["byKey", "keys", "stems", "audio", "midi", "files", "byFamily", "families", "familyRules", "byTag", "tags", "tagRules"]) {
    const group = ruleProfiles[groupName];
    if (!group || typeof group !== "object" || Array.isArray(group)) continue;

    for (const profile of Object.values(group)) {
      collectTopLevelProfileFields(profile, fields);
    }
  }

  return fields;
}

function countEntries(obj) {
  return obj && typeof obj === "object" && !Array.isArray(obj) ? Object.keys(obj).length : 0;
}

function statusLine(label, ok, note = "") {
  return `${ok ? "SUPPORTED" : "NEEDS BUILD"} | ${label}${note ? ` | ${note}` : ""}`;
}

const renderer = readText("full-renderer.js");
const catalog = readJson("data/full-rules-catalog.json");
const ruleProfiles = catalog?.rulePools?.ruleProfiles || {};

const lyrixRulesExists = exists("data/lyrix-rules.json");
const lyrixRules = lyrixRulesExists ? readJson("data/lyrix-rules.json") : null;

const chanceAliases = {
  globalInclusionChance: quotedStringsFromFunction(renderer, "getGlobalInclusionChance"),
  activationChance: quotedStringsFromFunction(renderer, "getActivationChance"),
  dropoutChance: quotedStringsFromFunction(renderer, "getDropoutChance")
};

const arrayAliases = {
  cutoffRules: quotedStringsFromFunction(renderer, "getCutoffRules"),
  hardClashRules: quotedStringsFromFunction(renderer, "getHardClashRules"),
  softMultiplierRules: quotedStringsFromFunction(renderer, "getSoftMultiplierRules"),
  timedBlockRules: quotedStringsFromFunction(renderer, "getTimedBlockRules"),
  familyLockRules: quotedStringsFromFunction(renderer, "getFamilyLockRules"),
  dependencyRules: quotedStringsFromFunction(renderer, "getDependencyRules"),
  densityRules: quotedStringsFromFunction(renderer, "getDensityRules"),
  tensionRules: quotedStringsFromFunction(renderer, "getTensionRules"),
  crescendoRules: quotedStringsFromFunction(renderer, "getCrescendoRules")
};

const currentProfileFields = collectProfileFields(ruleProfiles);

const systems = [
  statusLine(
    "ruleProfiles by key/family/tag/default merge",
    functionExists(renderer, "getRuleProfileForEntry") && renderer.includes("byKey") && renderer.includes("byFamily") && renderer.includes("byTag"),
    "usable for exact filename, family, and tag profiles"
  ),
  statusLine(
    "MIDI rule profiles",
    functionExists(renderer, "getRuleProfileForMidiPattern"),
    "MIDI patterns can use ruleProfiles through getMidiPatternRuleEntry"
  ),
  statusLine(
    "globalInclusionChance aliases",
    functionExists(renderer, "getGlobalInclusionChance"),
    chanceAliases.globalInclusionChance.join(", ")
  ),
  statusLine(
    "activationChance aliases",
    functionExists(renderer, "getActivationChance"),
    chanceAliases.activationChance.join(", ")
  ),
  statusLine(
    "dropoutChance + increasing dropout",
    functionExists(renderer, "getDropoutRuleConfig") && functionExists(renderer, "applyLifecycleDropoutToDecision"),
    "supports dropout, dropoutRule, dropoutIncreasePerActivation/dropoutChanceIncrease"
  ),
  statusLine(
    "hardClash",
    functionExists(renderer, "getHardClashRules") && functionExists(renderer, "applyHardClashRulesToDecision"),
    arrayAliases.hardClashRules.join(", ")
  ),
  statusLine(
    "softMultiplier",
    functionExists(renderer, "getSoftMultiplierRules") && functionExists(renderer, "applySoftMultiplierRulesToDecision"),
    arrayAliases.softMultiplierRules.join(", ")
  ),
  statusLine(
    "requiredActive / requiresActive dependencies",
    functionExists(renderer, "getDependencyRules") && functionExists(renderer, "applyDependencyRulesToDecision"),
    "active-now dependencies are supported; previously-activated/history dependencies still need separate check"
  ),
  statusLine(
    "cutoffRules",
    functionExists(renderer, "getCutoffRules") && functionExists(renderer, "applyCutoffRulesForAllowedDecision"),
    arrayAliases.cutoffRules.join(", ")
  ),
  statusLine(
    "timed blocks / shutoff windows",
    functionExists(renderer, "getTimedBlockRules") && functionExists(renderer, "applyTimedBlockRulesToDecision"),
    arrayAliases.timedBlockRules.join(", ")
  ),
  statusLine(
    "family locks / mutual exclusion",
    functionExists(renderer, "getFamilyLockRules") && functionExists(renderer, "applyFamilyLockRulesToDecision"),
    arrayAliases.familyLockRules.join(", ")
  ),
  statusLine(
    "density/tension/crescendo multipliers",
    functionExists(renderer, "applyDensityRulesToDecision") && functionExists(renderer, "applyTensionRulesToDecision") && functionExists(renderer, "applyCrescendoRulesToDecision"),
    "renderer has hooks, but musical completeness still needs later audit"
  ),
  statusLine(
    "groupedActivation generic system",
    renderer.includes("groupedActivation"),
    functionExists(renderer, "scheduleHookJazzHatsPairInSectionWithRules") ? "specific hook jazz hats pair exists; generic groupedActivation still needs build" : ""
  ),
  statusLine(
    "delayFollowsMain generic system",
    renderer.includes("delayFollowsMain"),
    "not detected as a generic named system"
  ),
  statusLine(
    "variantChooser generic system",
    renderer.includes("variantChooser"),
    renderer.includes("chooseJazzRideWithHatsVariantForSection") ? "specific jazz ride variant chooser exists; generic variantChooser still needs build" : ""
  ),
  statusLine(
    "noDropoutBeforeBars",
    renderer.includes("noDropoutBeforeBars") || renderer.includes("minimumActiveBars") || renderer.includes("minActiveBars"),
    "not detected"
  )
];

const profileScopeSummary = [
  `default/defaults: ${ruleProfiles.default || ruleProfiles.defaults ? "present" : "missing"}`,
  `byKey/keys/stems/audio/midi/files entries: ${["byKey", "keys", "stems", "audio", "midi", "files"].map(k => countEntries(ruleProfiles[k])).reduce((a, b) => a + b, 0)}`,
  `byFamily/families/familyRules entries: ${["byFamily", "families", "familyRules"].map(k => countEntries(ruleProfiles[k])).reduce((a, b) => a + b, 0)}`,
  `byTag/tags/tagRules entries: ${["byTag", "tags", "tagRules"].map(k => countEntries(ruleProfiles[k])).reduce((a, b) => a + b, 0)}`
];

const fieldLines = [...currentProfileFields.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([field, count]) => `- ${field}: ${count}`);

const report = [
  "TEST PROJECT 2 — SUPPORTED FIELDS AUDIT",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Branch expectation: full-rules-build`,
  "",
  "INPUT FILES",
  `- full-renderer.js: loaded`,
  `- data/full-rules-catalog.json: loaded`,
  `- data/lyrix-rules.json: ${lyrixRulesExists ? `loaded (${Array.isArray(lyrixRules?.sections) ? lyrixRules.sections.length : 0} sections)` : "not found"}`,
  "",
  "RULE PROFILE SCOPE SUMMARY",
  ...profileScopeSummary.map(line => `- ${line}`),
  "",
  "CURRENT TOP-LEVEL FIELDS ALREADY USED IN ruleProfiles",
  ...(fieldLines.length ? fieldLines : ["- none found"]),
  "",
  "SUPPORTED CHANCE FIELD ALIASES",
  `- global inclusion: ${chanceAliases.globalInclusionChance.join(", ") || "not detected"}`,
  `- activation: ${chanceAliases.activationChance.join(", ") || "not detected"}`,
  `- dropout: ${chanceAliases.dropoutChance.join(", ") || "not detected"}`,
  "",
  "SUPPORTED RULE ARRAY FIELD ALIASES",
  ...Object.entries(arrayAliases).map(([name, aliases]) => `- ${name}: ${aliases.join(", ") || "not detected"}`),
  "",
  "GENERIC SYSTEM READINESS",
  ...systems.map(line => `- ${line}`),
  "",
  "INITIAL SPLIT",
  "FAST / BATCHABLE NOW",
  "- exact filename profiles through ruleProfiles.byKey",
  "- tag profiles through ruleProfiles.byTag",
  "- family profiles through ruleProfiles.byFamily",
  "- globalInclusionChance / activationChance / dropoutChance",
  "- cutoffRules, hardClashRules, softMultiplierRules, active-now dependencies, timed blocks, family locks",
  "",
  "GENERIC SYSTEMS TO BUILD BEFORE BIG AUTOMATIC PASSES",
  "- groupedActivation as a data-driven system",
  "- delayFollowsMain",
  "- generic variantChooser",
  "- noDropoutBeforeBars / minimum active duration before dropout",
  "- previously-activated or only-after-history dependency checks, if needed by definitions",
  "",
  "CUSTOM / CAREFUL",
  "- lyrix timing edge cases",
  "- section transitions",
  "- rules that must depend on actual scheduled material rather than planned material",
  "- anything that could reintroduce broad filename matching for _1/_2 branches",
  ""
].join("\n");

const outPath = path.join(root, "reports", "supported-fields-audit.txt");
fs.writeFileSync(outPath, report, "utf8");

console.log(report);
console.log(`WROTE: ${path.relative(root, outPath)}`);
