const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outputDir = path.join(root, "reports");
fs.mkdirSync(outputDir, { recursive: true });

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(relPath) {
  return JSON.parse(readText(path.join(root, relPath)));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
    } else if (/\.txt$/i.test(entry.name)) {
      out.push(fullPath);
    }
  }

  return out;
}

function scoreDefinitionsText(text, filePath) {
  let score = 0;
  if (/saved definitions/i.test(text)) score += 20;
  if (/accepted definitions/i.test(text)) score += 20;
  if (/batch\s+\d+/i.test(text)) score += 10;
  if (/Tags:/i.test(text)) score += 10;
  if (/\.wav|\.mid/i.test(text)) score += 10;
  if (/rule-profile|supported-fields|audit/i.test(filePath)) score -= 30;
  if (/git-|status|log|anchor|handover/i.test(path.basename(filePath))) score -= 10;
  return score;
}

function findDefinitionsFile() {
  const explicitCandidates = [
    "saved definitions absolute final 2.txt",
    "saved definitions absolute final.txt",
    path.join("reusable chat files", "saved definitions absolute final 2.txt"),
    path.join("reusable chat files", "saved definitions absolute final.txt"),
    path.join("NEXT_CHAT_PACK", "saved definitions absolute final 2.txt"),
    path.join("NEXT_CHAT_PACK", "saved definitions absolute final.txt")
  ];

  for (const relPath of explicitCandidates) {
    const fullPath = path.join(root, relPath);
    if (fs.existsSync(fullPath)) return fullPath;
  }

  const candidates = walk(root)
    .filter(filePath => !filePath.includes(`${path.sep}reports${path.sep}`))
    .map(filePath => {
      let text = "";
      try {
        text = readText(filePath);
      } catch {
        text = "";
      }
      return { filePath, score: scoreDefinitionsText(text, filePath) };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.filePath || null;
}

function normalizeForCompare(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function cleanMention(value) {
  return normalizeForCompare(value)
    .replace(/^[-*•·\s]+/, "")
    .replace(/^['\"]|['\"]$/g, "")
    .replace(/^[`]+|[`]+$/g, "")
    .trim();
}

function buildKeyResolver(allKeys) {
  const exact = new Map(allKeys.map(key => [normalizeForCompare(key), key]));
  const basenameMap = new Map();

  for (const key of allKeys) {
    const base = path.posix.basename(normalizeForCompare(key));
    if (!basenameMap.has(base)) basenameMap.set(base, []);
    basenameMap.get(base).push(key);
  }

  function resolve(mention) {
    const cleaned = cleanMention(mention);
    if (exact.has(cleaned)) return { key: exact.get(cleaned), status: "exact" };

    const base = path.posix.basename(cleaned);
    const matches = basenameMap.get(base) || [];
    if (matches.length === 1) return { key: matches[0], status: "basename_unique" };
    if (matches.length > 1) return { key: null, status: "ambiguous", matches };

    const suffixMatches = allKeys.filter(key => normalizeForCompare(key).endsWith(cleaned));
    if (suffixMatches.length === 1) return { key: suffixMatches[0], status: "suffix_unique" };
    if (suffixMatches.length > 1) return { key: null, status: "ambiguous", matches: suffixMatches };

    return { key: null, status: "missing", matches: [] };
  }

  return resolve;
}

function extractFileMentions(line) {
  const cleaned = cleanMention(line);
  const mentions = [];
  const explicitPathRegex = /(?:alternate downloads|lyrix|samples|midi files)\/[A-Za-z0-9_#~.()\-\s]+?\.(?:wav|mid|mp3)/gi;
  const bareFileRegex = /[A-Za-z0-9_#~.()\-\s]+?\.(?:wav|mid|mp3)/gi;

  for (const match of cleaned.matchAll(explicitPathRegex)) {
    mentions.push(match[0].trim());
  }

  if (!mentions.length) {
    for (const match of cleaned.matchAll(bareFileRegex)) {
      mentions.push(match[0].trim());
    }
  }

  return [...new Set(mentions)];
}

function parsePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number / 100));
}

function inferChanceFieldFromLine(line) {
  const lower = line.toLowerCase();
  const percentMatch = lower.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!percentMatch) return null;

  const probability = parsePercent(percentMatch[1]);
  if (probability === null) return null;

  if (/global inclusion|global selection|global chance|globally/.test(lower)) {
    return { field: "globalInclusionChance", value: probability, line };
  }

  if (/dropout|drop out|drop-out/.test(lower)) {
    return { field: "dropoutChance", value: probability, line };
  }

  if (/activation chance|chance to activate|activates? .*chance|chance .*activates?|opportunity chance/.test(lower)) {
    return { field: "activationChance", value: probability, line };
  }

  if (/chance/.test(lower)) {
    return { field: "unclassifiedChance", value: probability, line };
  }

  return null;
}

function inferChanceFields(textWindow) {
  const fields = {};
  const evidence = [];
  const reviewNotes = [];
  const lines = textWindow.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

  for (const line of lines) {
    const inferred = inferChanceFieldFromLine(line);
    if (!inferred) continue;

    evidence.push(inferred);

    if (inferred.field === "unclassifiedChance") {
      reviewNotes.push(`Unclassified chance line: ${line}`);
      continue;
    }

    fields[inferred.field] = inferred.value;
  }

  return { fields, evidence, reviewNotes };
}

function genericKindFromText(text) {
  const lower = text.toLowerCase();
  const kinds = [];

  if (/activate together|activates together|scheduled together|play together as one|same pattern played by different samples|same pattern .* different sample/.test(lower)) {
    kinds.push("groupedActivation");
  }

  if (/cannot play at the same time|cannot activate at the same time|clash|clashes|hard clash|not work together/.test(lower)) {
    kinds.push("hardClash");
  }

  if (/x0\.\d|half as likely|less likely|multiplied by|multiply .* chance|activation chance .* x/.test(lower)) {
    kinds.push("softMultiplier");
  }

  if (/can only activate if|can only play if|only valid when|requires|only after|can only activate after|can only play with/.test(lower)) {
    kinds.push("requiredActive_or_onlyAfterActive");
  }

  if (/delay.*chance|dlay.*chance|chance .* delay|delay version|normal\/delay pair|normal and delay pair/.test(lower)) {
    kinds.push("delayFollowsMain");
  }

  if (/replace|variant|instead|swap/.test(lower)) {
    kinds.push("variantChooser_or_replacement");
  }

  if (/stay active for at least|cannot drop out until|no dropout before|minimum active/.test(lower)) {
    kinds.push("noDropoutBeforeBars");
  }

  return [...new Set(kinds)];
}

function parseDefinitions(text, allKeys) {
  const resolveKey = buildKeyResolver(allKeys);
  const lines = text.split(/\r?\n/);
  const byKey = {};
  const mentions = [];
  const genericSystemCandidates = [];
  const unmatchedFileMentions = [];

  for (let i = 0; i < lines.length; i++) {
    const fileMentions = extractFileMentions(lines[i]);
    if (!fileMentions.length) continue;

    for (const mention of fileMentions) {
      const resolved = resolveKey(mention);
      mentions.push({ line: i + 1, mention, ...resolved });

      if (!resolved.key) {
        unmatchedFileMentions.push({ line: i + 1, mention, status: resolved.status, matches: resolved.matches || [] });
        continue;
      }

      const nextLines = lines.slice(i + 1, Math.min(lines.length, i + 28));
      const windowText = [lines[i], ...nextLines].join("\n");
      const tags = [];
      let tagMode = false;

      for (const nextLine of nextLines) {
        const trimmed = nextLine.trim();
        if (/^Tags:\s*$/i.test(trimmed)) {
          tagMode = true;
          continue;
        }

        if (tagMode && /^#[A-Za-z0-9_~.\-]+$/.test(trimmed)) {
          tags.push(trimmed.slice(1));
          continue;
        }

        if (tagMode && trimmed && !trimmed.startsWith("#")) {
          break;
        }
      }

      const { fields, evidence, reviewNotes } = inferChanceFields(windowText);
      const kinds = genericKindFromText(windowText);

      if (!byKey[resolved.key]) {
        byKey[resolved.key] = {
          sourceLines: [],
          inferredTags: [],
          candidateProfileFields: {},
          evidence: [],
          reviewNotes: []
        };
      }

      byKey[resolved.key].sourceLines.push(i + 1);
      byKey[resolved.key].inferredTags = [...new Set([...byKey[resolved.key].inferredTags, ...tags])];
      byKey[resolved.key].candidateProfileFields = { ...byKey[resolved.key].candidateProfileFields, ...fields };
      byKey[resolved.key].evidence.push(...evidence);
      byKey[resolved.key].reviewNotes.push(...reviewNotes);

      if (kinds.length) {
        genericSystemCandidates.push({
          line: i + 1,
          key: resolved.key,
          kinds,
          text: windowText.split(/\r?\n/).slice(0, 12).join("\n")
        });
      }
    }
  }

  const candidateProfileFields = {};
  const tagOnlyCandidates = {};

  for (const [key, info] of Object.entries(byKey)) {
    const hasProfileFields = Object.keys(info.candidateProfileFields).length > 0;
    if (hasProfileFields) {
      candidateProfileFields[key] = {
        ...info,
        safeToApplyAutomatically: false,
        reason: "Parsed from prose definitions. Review before applying."
      };
    } else if (info.inferredTags.length) {
      tagOnlyCandidates[key] = {
        sourceLines: info.sourceLines,
        inferredTags: info.inferredTags,
        safeToApplyAutomatically: false,
        reason: "Renderer currently uses catalog tags/families, but adding tags to ruleProfiles is not confirmed as behaviour-changing. Review before applying."
      };
    }
  }

  return {
    mentions,
    candidateProfileFields,
    tagOnlyCandidates,
    genericSystemCandidates,
    unmatchedFileMentions
  };
}

function buildTextReport(report) {
  const lines = [];
  lines.push("TEST PROJECT 2 — RULE PROFILE BATCH CANDIDATES");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Definitions source: ${report.definitionsSource || "not found"}`);
  lines.push("");
  lines.push("SUMMARY");
  lines.push(`- exact/unique file mentions found: ${report.summary.resolvedMentions}`);
  lines.push(`- unmatched/ambiguous file mentions: ${report.summary.unmatchedFileMentions}`);
  lines.push(`- profile field candidates needing review: ${report.summary.candidateProfileFieldCount}`);
  lines.push(`- tag-only candidates needing review: ${report.summary.tagOnlyCandidateCount}`);
  lines.push(`- generic-system candidate blocks: ${report.summary.genericSystemCandidateCount}`);
  lines.push("");
  lines.push("FAST / BATCHABLE AFTER REVIEW");
  lines.push("- globalInclusionChance");
  lines.push("- activationChance");
  lines.push("- dropoutChance");
  lines.push("- simple byKey / byTag / byFamily ruleProfiles");
  lines.push("- cutoffRules / hardClashRules / softMultiplierRules / active-now dependencies / timed blocks / family locks");
  lines.push("");
  lines.push("PROFILE FIELD CANDIDATES NEEDING REVIEW");
  const profileEntries = Object.entries(report.candidateProfileFields.byKey);
  if (!profileEntries.length) {
    lines.push("- none found from the available local definitions text");
  } else {
    for (const [key, item] of profileEntries.slice(0, 80)) {
      lines.push(`- ${key}: ${JSON.stringify(item.candidateProfileFields)}`);
    }
    if (profileEntries.length > 80) lines.push(`- ... ${profileEntries.length - 80} more omitted from text report; see JSON`);
  }
  lines.push("");
  lines.push("GENERIC SYSTEM CANDIDATE COUNTS");
  if (!Object.keys(report.genericSystemKindCounts).length) {
    lines.push("- none found");
  } else {
    for (const [kind, count] of Object.entries(report.genericSystemKindCounts)) {
      lines.push(`- ${kind}: ${count}`);
    }
  }
  lines.push("");
  lines.push("SLOW / BUILD GENERIC SYSTEM FIRST");
  lines.push("- groupedActivation");
  lines.push("- delayFollowsMain");
  lines.push("- generic variantChooser / replacement");
  lines.push("- noDropoutBeforeBars");
  lines.push("- previously-activated / history-based dependencies");
  lines.push("");
  lines.push("IMPORTANT SAFETY NOTE");
  lines.push("- This script does not apply changes to data/full-rules-catalog.json.");
  lines.push("- It intentionally marks prose-parsed chance fields as review-needed, not auto-safe.");
  lines.push("");
  lines.push("FILES WRITTEN");
  lines.push("- reports/rule-profile-batch-candidates.json");
  lines.push("- reports/rule-profile-batch-candidates.txt");
  lines.push("");
  return lines.join("\n");
}

const catalog = readJson("data/full-rules-catalog.json");
const allKeys = [...new Set([
  ...(Array.isArray(catalog.allKeys) ? catalog.allKeys : []),
  ...((catalog.rulePools?.midi?.patterns || []).map(pattern => pattern.file).filter(Boolean))
])];

const definitionsPath = findDefinitionsFile();
const definitionsText = definitionsPath ? readText(definitionsPath) : "";
const parsed = definitionsText ? parseDefinitions(definitionsText, allKeys) : {
  mentions: [],
  candidateProfileFields: {},
  tagOnlyCandidates: {},
  genericSystemCandidates: [],
  unmatchedFileMentions: []
};

const genericSystemKindCounts = {};
for (const item of parsed.genericSystemCandidates) {
  for (const kind of item.kinds) {
    genericSystemKindCounts[kind] = (genericSystemKindCounts[kind] || 0) + 1;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  definitionsSource: definitionsPath ? path.relative(root, definitionsPath) : null,
  summary: {
    totalCatalogKeys: allKeys.length,
    resolvedMentions: parsed.mentions.filter(item => item.key).length,
    unmatchedFileMentions: parsed.unmatchedFileMentions.length,
    candidateProfileFieldCount: Object.keys(parsed.candidateProfileFields).length,
    tagOnlyCandidateCount: Object.keys(parsed.tagOnlyCandidates).length,
    genericSystemCandidateCount: parsed.genericSystemCandidates.length
  },
  supportedFastFields: {
    byKey: ["globalInclusionChance", "activationChance", "dropoutChance", "cutoffRules", "hardClashRules", "softMultiplierRules", "dependencies", "timedBlocks", "familyLocks"],
    byTag: ["cutoffRules", "hardClashRules", "softMultiplierRules", "dependencies", "timedBlocks", "familyLocks"],
    byFamily: ["globalInclusionChance", "activationChance", "dropoutChance", "hardClashRules", "softMultiplierRules", "dependencies", "familyLocks"]
  },
  candidateProfileFields: {
    byKey: parsed.candidateProfileFields
  },
  tagOnlyCandidates: {
    byKey: parsed.tagOnlyCandidates
  },
  genericSystemKindCounts,
  genericSystemCandidates: parsed.genericSystemCandidates,
  unmatchedFileMentions: parsed.unmatchedFileMentions.slice(0, 300)
};

const jsonPath = path.join(outputDir, "rule-profile-batch-candidates.json");
const txtPath = path.join(outputDir, "rule-profile-batch-candidates.txt");
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
fs.writeFileSync(txtPath, buildTextReport(report), "utf8");

console.log(buildTextReport(report));
