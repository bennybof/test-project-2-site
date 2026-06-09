const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "full-renderer.js");
let text = fs.readFileSync(filePath, "utf8");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function insertAfter(pattern, insertText, label) {
  if (text.includes(insertText.trim())) {
    console.log(`Already present: ${label}`);
    return true;
  }

  const match = text.match(pattern);
  if (!match) {
    fail(`Could not find anchor for ${label}`);
    return false;
  }

  text = text.slice(0, match.index + match[0].length) + "\n\n" + insertText.trimEnd() + text.slice(match.index + match[0].length);
  console.log(`Inserted: ${label}`);
  return true;
}

function replaceOnce(pattern, replacement, label) {
  const next = text.replace(pattern, replacement);
  if (next === text) {
    fail(`Could not replace anchor for ${label}`);
    return false;
  }

  text = next;
  console.log(`Updated: ${label}`);
  return true;
}

let ok = true;

ok = insertAfter(
  /  function getSoftMultiplierRules\(profile\) \{\r?\n\s*return getRuleArray\(profile, \[\r?\n\s*"softMultipliers",\r?\n\s*"softMultiplierRules",\r?\n\s*"activationMultipliers",\r?\n\s*"chanceMultipliers"\r?\n\s*\]\);\r?\n\s*\}/,
  `
  function getGroupedActivationRules(profile) {
    return getRuleArray(profile, [
      "groupedActivation",
      "groupedActivations",
      "groupedActivationRules",
      "activationGroups",
      "groupedWith"
    ]);
  }
`,
  "getGroupedActivationRules"
) && ok;

ok = replaceOnce(
  /      familyLocks: new Map\(\),\r?\n      nextItemId: 1/,
  `      familyLocks: new Map(),
      groupedActivationDecisions: new Map(),
      nextItemId: 1`,
  "groupedActivationDecisions playback state"
) && ok;

ok = insertAfter(
  /  function applySoftMultiplierRulesToDecision\(playbackState, context, decision, rules = \[\]\) \{[\s\S]*?\r?\n  \}/,
  `
  function getGroupedActivationDecisionId(rule, context) {
    const groupId = String(
      rule.groupId ||
      rule.group ||
      rule.id ||
      rule.name ||
      ""
    );

    if (!groupId || !context) return "";

    const scope = normalizeRuleDecisionToken(rule.scope || "opportunity");
    const sectionId = String(context.sectionId || "");
    const localBarIndex = context.localBarIndex === null || context.localBarIndex === undefined
      ? "none"
      : String(context.localBarIndex);
    const startSeconds = Number.isFinite(Number(context.startSeconds))
      ? Number(context.startSeconds).toFixed(4)
      : "none";

    if (scope === "section") {
      return \`\${groupId}:section:\${sectionId}\`;
    }

    if (scope === "bar" || scope === "opportunity") {
      return \`\${groupId}:bar:\${sectionId}:\${localBarIndex}\`;
    }

    if (scope === "time") {
      return \`\${groupId}:time:\${startSeconds}\`;
    }

    return \`\${groupId}:opportunity:\${sectionId}:\${localBarIndex}\`;
  }

  function applyGroupedActivationRulesToDecision(playbackState, context, decision, rules = [], random = null) {
    if (!playbackState || !context || !decision || !Array.isArray(rules)) return decision;

    if (!playbackState.groupedActivationDecisions) {
      playbackState.groupedActivationDecisions = new Map();
    }

    const safeRandom = typeof random === "function" ? random : (() => 1);

    for (const rule of rules) {
      const decisionId = getGroupedActivationDecisionId(rule, context);
      if (!decisionId) continue;

      const existingDecision = playbackState.groupedActivationDecisions.get(decisionId);

      if (existingDecision) {
        addRuleDecisionReason(decision, "grouped_activation_reused", {
          ruleId: rule.id || rule.groupId || rule.group || "",
          decisionId,
          groupedAllowed: existingDecision.allowed,
          groupedRoll: existingDecision.roll,
          groupedChance: existingDecision.finalChance
        });

        if (!existingDecision.allowed) {
          return blockRuleDecision(decision, "grouped_activation_blocked", {
            ruleId: rule.id || rule.groupId || rule.group || "",
            decisionId,
            groupedRoll: existingDecision.roll,
            groupedChance: existingDecision.finalChance
          });
        }

        decision.baseChance = 1;
        decision.chanceMultiplier = 1;
        decision.finalChance = 1;
        continue;
      }

      const explicitChance = rule.chance ?? rule.activationChance ?? rule.groupChance;
      const groupedChance = explicitChance === undefined
        ? clampProbability(decision.finalChance, 1)
        : clampProbability(explicitChance, decision.finalChance);
      const roll = safeRandom();
      const allowed = roll <= groupedChance;

      playbackState.groupedActivationDecisions.set(decisionId, {
        allowed,
        roll,
        finalChance: groupedChance
      });

      addRuleDecisionReason(decision, "grouped_activation_created", {
        ruleId: rule.id || rule.groupId || rule.group || "",
        decisionId,
        groupedRoll: roll,
        groupedChance
      });

      if (!allowed) {
        return blockRuleDecision(decision, "grouped_activation_blocked", {
          ruleId: rule.id || rule.groupId || rule.group || "",
          decisionId,
          groupedRoll: roll,
          groupedChance
        });
      }

      decision.baseChance = 1;
      decision.chanceMultiplier = 1;
      decision.finalChance = 1;
    }

    return decision;
  }
`,
  "grouped activation decision helpers"
) && ok;

ok = replaceOnce(
  /    applySoftMultiplierRulesToDecision\(playbackState, context, decision, getSoftMultiplierRules\(profile\)\);\r?\n\r?\n    applyDensityRulesToDecision\(context, decision, profile\);/,
  `    applySoftMultiplierRulesToDecision(playbackState, context, decision, getSoftMultiplierRules(profile));

    applyGroupedActivationRulesToDecision(
      playbackState,
      context,
      decision,
      getGroupedActivationRules(profile),
      random
    );
    if (decision.blocked) return decision;

    applyDensityRulesToDecision(context, decision, profile);`,
  "applyGroupedActivationRulesToDecision wiring"
) && ok;

if (!ok || process.exitCode) {
  process.exit(process.exitCode || 1);
}

fs.writeFileSync(filePath, text.trimEnd() + "\n", "utf8");
console.log("Updated full-renderer.js");
