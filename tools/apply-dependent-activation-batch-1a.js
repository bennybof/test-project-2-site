const fs = require("fs");
const path = require("path");

const root = process.cwd();
const rendererPath = path.join(root, "full-renderer.js");
const catalogPath = path.join(root, "data", "full-rules-catalog.json");
const reportJsonPath = path.join(root, "reports", "dependent-activation-batch-1a-report.json");
const reportTxtPath = path.join(root, "reports", "dependent-activation-batch-1a-report.txt");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function fail(message) {
  throw new Error(message);
}

function getFunctionRange(source, functionName) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  if (start < 0) fail(`Missing function ${functionName}`);

  const paramStart = source.indexOf("(", start + marker.length);
  if (paramStart < 0) fail(`Missing parameter start for ${functionName}`);

  let parenDepth = 0;
  let paramEnd = -1;
  let inString = null;
  let escape = false;

  for (let i = paramStart; i < source.length; i += 1) {
    const char = source[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = char;
      continue;
    }

    if (char === "(") parenDepth += 1;

    if (char === ")") {
      parenDepth -= 1;

      if (parenDepth === 0) {
        paramEnd = i;
        break;
      }
    }
  }

  if (paramEnd < 0) fail(`Missing parameter end for ${functionName}`);

  const braceStart = source.indexOf("{", paramEnd);
  if (braceStart < 0) fail(`Missing function body start for ${functionName}`);

  let depth = 0;
  inString = null;
  escape = false;

  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = char;
      continue;
    }

    if (char === "{") depth += 1;

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return {
          start,
          end: i + 1,
          text: source.slice(start, i + 1)
        };
      }
    }
  }

  fail(`Missing function body end for ${functionName}`);
}

function replaceFunction(source, functionName, replacement) {
  const range = getFunctionRange(source, functionName);
  return source.slice(0, range.start) + replacement + source.slice(range.end);
}

function insertBefore(source, marker, block, label) {
  const firstLine = block.trim().split(/\r?\n/)[0].trim();

  if (source.includes(firstLine)) {
    return {
      source,
      label,
      status: "already_present"
    };
  }

  const index = source.indexOf(marker);
  if (index < 0) fail(`Missing marker for ${label}: ${marker}`);

  return {
    source: source.slice(0, index) + block + "\n" + source.slice(index),
    label,
    status: "inserted"
  };
}

function replaceExactlyOnce(source, marker, replacement, label) {
  const count = source.split(marker).length - 1;
  if (count !== 1) fail(`Expected 1 marker for ${label}, found ${count}`);
  return source.replace(marker, replacement);
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
  const result = { sourceKey, targetKey, chance, id, status: "" };

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

  if (profile.dependentActivationRules.some(rule => rule.id === id)) {
    result.status = "unchanged_existing";
    return result;
  }

  profile.dependentActivationRules.push({
    id,
    chance,
    targets: [{ key: targetKey }],
    sourceNote
  });

  result.status = "added";
  return result;
}

function markDependentOnlyTarget(catalog, catalogKeys, targetKey, reason) {
  const result = { targetKey, status: "" };

  if (!catalogKeys.has(targetKey)) {
    result.status = "skipped_missing_target_key";
    return result;
  }

  const profile = ensureByKeyProfile(catalog, targetKey);
  const alreadySet = profile.dependentActivationOnly === true && profile.activationChance === 0;

  profile.dependentActivationOnly = true;
  profile.activationChance = 0;
  profile.sourceNote = profile.sourceNote || reason;

  result.status = alreadySet ? "unchanged_existing" : "set_dependent_only";
  return result;
}

let renderer = fs.readFileSync(rendererPath, "utf8");
const originalRenderer = renderer;
const rendererChanges = [];

if (!renderer.includes("function forceIncludeAudioSelection(")) {
  fail("Missing forceIncludeAudioSelection; cannot safely expand dependent targets into selectedAudio.");
}

const getterBlock = `  function getDependentActivationRules(profile) {
    return getRuleArray(profile, [
      "dependentActivationRules",
      "dependentActivations",
      "activationFollowers",
      "followerActivations",
      "activatesTargets"
    ]);
  }
`;

if (!renderer.includes("function getDependentActivationRules(profile)")) {
  const result = insertBefore(renderer, "  function getDensityRules(profile) {", getterBlock, "getDependentActivationRules");
  renderer = result.source;
  rendererChanges.push(result);
}

const expandBlock = `  function expandDependentActivationTargets({
    random,
    selectedAudio = null,
    globalInclusionState = null,
    requiredActivationState = null
  } = {}) {
    if (!selectedAudio) return 0;

    let addedCount = 0;
    let changed = true;
    let guard = 0;

    while (changed && guard < 20) {
      changed = false;
      guard += 1;

      const sourceKeys = [...selectedAudio];

      for (const sourceKey of sourceKeys) {
        const sourceEntry = getCatalogEntry(sourceKey);
        if (!sourceEntry) continue;

        const sourceProfile = getRuleProfileForEntry(sourceEntry);
        const dependentRules = getDependentActivationRules(sourceProfile);

        for (const rule of dependentRules) {
          const targets = getRuleTargets(rule);

          for (const target of targets) {
            if (!target?.key) continue;
            if (target.kind && target.kind !== "audio") continue;

            const targetEntry = getCatalogEntry(target.key);
            if (!targetEntry || isLyrix(targetEntry)) continue;

            const hadTarget = selectedAudio.has(targetEntry.key);

            forceIncludeAudioSelection({
              random,
              globalInclusionState,
              requiredActivationState,
              selectedAudio,
              key: targetEntry.key,
              reason: \`dependent_activation_target:\${sourceEntry.key}\`
            });

            if (!hadTarget && selectedAudio.has(targetEntry.key)) {
              addedCount += 1;
              changed = true;
            }
          }
        }
      }
    }

    return addedCount;
  }
`;

if (!renderer.includes("function expandDependentActivationTargets({")) {
  const result = insertBefore(renderer, "  function includeAudioByGlobalDecision({", expandBlock, "expandDependentActivationTargets");
  renderer = result.source;
  rendererChanges.push(result);
}

if (!renderer.includes("\n    expandDependentActivationTargets({\n      random,")) {
  const marker = "    expandSelectedWetDryPairs(selectedAudio, random, globalInclusionState, requiredActivationState);";
  const replacement = `${marker}

    expandDependentActivationTargets({
      random,
      selectedAudio,
      globalInclusionState,
      requiredActivationState
    });`;

  renderer = replaceExactlyOnce(renderer, marker, replacement, "dependent target expansion call");
  rendererChanges.push({ label: "dependent target expansion call", status: "inserted" });
}

const schedulerBlock = `  function scheduleDependentActivationFollowersForAudio({
    offlineContext,
    destination,
    buffers = null,
    random,
    plan = null,
    playbackState = null,
    section = null,
    lifecycleStates = null,
    sourceContext = null,
    sourceProfile = null,
    sourceKey = "",
    startSeconds = 0
  } = {}) {
    const rules = getDependentActivationRules(sourceProfile);
    if (!rules.length) return 0;

    const activeBuffers = buffers || currentRenderBuffers;
    let scheduledCount = 0;

    for (const rule of rules) {
      const targets = getRuleTargets(rule);

      for (const target of targets) {
        if (!target?.key) continue;
        if (target.kind && target.kind !== "audio") continue;

        const targetEntry = getCatalogEntry(target.key);
        if (!targetEntry || isLyrix(targetEntry)) continue;
        if (!audioMatchesSection(targetEntry, section)) continue;

        const targetBuffer = activeBuffers?.get(targetEntry.key);
        if (!targetBuffer) continue;

        const offsetBars = Number(rule.offsetBars ?? rule.delayBars ?? 0);
        const offsetSeconds = Number(rule.offsetSeconds ?? rule.delaySeconds ?? 0);
        const targetStartSeconds =
          Number(startSeconds || 0) +
          (Number.isFinite(offsetBars) ? offsetBars * Number(section?.barSeconds || 0) : 0) +
          (Number.isFinite(offsetSeconds) ? offsetSeconds : 0);

        const targetLifecycleId = getAudioLifecycleId(targetEntry.key);

        if (
          lifecycleStates &&
          targetLifecycleId &&
          !isLifecycleIdEligible(lifecycleStates, targetLifecycleId)
        ) {
          continue;
        }

        const targetProfile = getRuleProfileForEntry(targetEntry);
        const ruleChance = clampProbability(
          rule.chance ?? rule.activationChance ?? rule.targetChance ?? rule.probability ?? 1,
          1
        );
        const localBarIndex = section?.barSeconds
          ? Math.max(0, Math.round((targetStartSeconds - section.startSeconds) / section.barSeconds))
          : null;

        const targetDecisionResult = resolveRuleProfileDecision({
          random,
          plan,
          playbackState,
          kind: "audio",
          key: targetEntry.key,
          entry: targetEntry,
          section,
          lifecycleStates,
          localBarIndex,
          startSeconds: targetStartSeconds,
          baseChance: ruleChance,
          profile: targetProfile
        });

        if (!targetDecisionResult.allowed) continue;

        applyCutoffRulesForAllowedDecision(playbackState, targetDecisionResult.context, targetProfile);

        const gainMultiplier = Number(rule.gainMultiplier ?? 1);
        const targetGain =
          sectionGainForAudio(targetEntry, section) *
          (Number.isFinite(gainMultiplier) ? gainMultiplier : 1);

        const scheduled = scheduleAudioBufferWithPlaybackState({
          offlineContext,
          destination,
          buffer: targetBuffer,
          startTime: targetStartSeconds,
          gainValue: targetGain,
          playbackState,
          key: targetEntry.key,
          entry: targetEntry,
          section
        });

        if (scheduled) {
          scheduledCount += 1;

          if (lifecycleStates && targetLifecycleId) {
            activateLifecycleItem(
              lifecycleStates,
              targetLifecycleId,
              \`\${section?.id || "section"}:\${targetEntry.key}:dependent:\${sourceKey}\`
            );
          }

          if (section) {
            if (!Array.isArray(section.dependentActivationDebug)) {
              section.dependentActivationDebug = [];
            }

            section.dependentActivationDebug.push({
              ruleId: rule.id || "",
              sourceKey,
              targetKey: targetEntry.key,
              sourceStartSeconds: startSeconds,
              targetStartSeconds,
              chance: ruleChance,
              sourceContext: sourceContext
                ? {
                    kind: sourceContext.kind,
                    itemKey: sourceContext.itemKey,
                    sectionId: sourceContext.sectionId,
                    localBarIndex: sourceContext.localBarIndex
                  }
                : null
            });
          }
        }
      }
    }

    return scheduledCount;
  }
`;

if (!renderer.includes("function scheduleDependentActivationFollowersForAudio({")) {
  const result = insertBefore(
    renderer,
    "  function scheduleAudioStemInSection({ offlineContext, destination, key, buffer, random, plan = null, lifecycleStates = null, playbackState = null, section }) {",
    schedulerBlock,
    "scheduleDependentActivationFollowersForAudio"
  );
  renderer = result.source;
  rendererChanges.push(result);
}

const newScheduleAudioStemInSection = `function scheduleAudioStemInSection({ offlineContext, destination, key, buffer, random, plan = null, lifecycleStates = null, playbackState = null, section }) {
    const entry = getCatalogEntry(key);
    if (!entry || !buffer) return 0;
    if (!audioMatchesSection(entry, section)) return 0;

    const keyLower = key.toLowerCase();
    const gain = sectionGainForAudio(entry, section);
    const audioProfile = getRuleProfileForEntry(entry);

    if (audioProfile.dependentActivationOnly || audioProfile.dependentOnly || audioProfile.activationMode === "dependent") {
      return 0;
    }

    function scheduleDependents(startSeconds, sourceContext = null) {
      return scheduleDependentActivationFollowersForAudio({
        offlineContext,
        destination,
        buffers: currentRenderBuffers,
        random,
        plan,
        playbackState,
        section,
        lifecycleStates,
        sourceContext,
        sourceProfile: audioProfile,
        sourceKey: key,
        startSeconds
      });
    }

    if (entry.folder === "alternate downloads") {
      if (chance(random, 0.005)) {
        const scheduled = scheduleAudioBufferWithPlaybackState({
          offlineContext,
          destination,
          buffer,
          startTime: section.startSeconds,
          gainValue: 0.8,
          playbackState,
          key,
          entry,
          section
        });

        return scheduled ? 1 + scheduleDependents(section.startSeconds) : 0;
      }
      return 0;
    }

    if (keyLower.includes("everything_intro")) {
      const scheduled = scheduleAudioBufferWithPlaybackState({
        offlineContext,
        destination,
        buffer,
        startTime: section.startSeconds,
        gainValue: gain,
        playbackState,
        key,
        entry,
        section
      });

      return scheduled ? 1 + scheduleDependents(section.startSeconds) : 0;
    }

    if (keyLower.includes("drop_") || keyLower.includes("dropped_")) {
      const localBar = Math.floor(random() * Math.max(1, section.bars));
      const startSeconds = section.startSeconds + localBar * section.barSeconds;
      const scheduled = scheduleAudioBufferWithPlaybackState({
        offlineContext,
        destination,
        buffer,
        startTime: startSeconds,
        gainValue: gain,
        playbackState,
        key,
        entry,
        section
      });

      return scheduled ? 1 + scheduleDependents(startSeconds) : 0;
    }

    if (keyLower.includes("outburst")) {
      const scheduled = scheduleAudioBufferWithPlaybackState({
        offlineContext,
        destination,
        buffer,
        startTime: section.startSeconds,
        gainValue: gain,
        playbackState,
        key,
        entry,
        section
      });

      return scheduled ? 1 + scheduleDependents(section.startSeconds) : 0;
    }

    if (keyLower.includes("grm_") || keyLower.includes("rewind_sfx")) {
      const localBar = Math.floor(random() * Math.max(1, section.bars));
      const startSeconds = section.startSeconds + localBar * section.barSeconds;
      const scheduled = scheduleAudioBufferWithPlaybackState({
        offlineContext,
        destination,
        buffer,
        startTime: startSeconds,
        gainValue: gain,
        playbackState,
        key,
        entry,
        section
      });

      return scheduled ? 1 + scheduleDependents(startSeconds) : 0;
    }

    if (isLyrix(entry)) {
      return scheduleLyrixGroupInSection({
        offlineContext,
        destination,
        key,
        random,
        playbackState,
        section,
        buffers: currentRenderBuffers
      }) ? 1 : 0;
    }

    if (isLikelyOneShot(entry)) {
      const allowedBars = getAllowedLocalBarIndexesForKey(key, section);
      const oneShotBaseChance = getActivationChance(audioProfile, 0.12);
      let scheduledCount = 0;

      for (const localBarIndex of allowedBars) {
        const startSeconds = section.startSeconds + localBarIndex * section.barSeconds;
        const audioDecisionResult = resolveRuleProfileDecision({
          random,
          plan,
          playbackState,
          kind: "audio",
          key,
          entry,
          section,
          lifecycleStates,
          localBarIndex,
          startSeconds,
          baseChance: oneShotBaseChance,
          profile: audioProfile
        });

        if (audioDecisionResult.allowed) {
          applyCutoffRulesForAllowedDecision(playbackState, audioDecisionResult.context, audioProfile);
          const scheduled = scheduleAudioBufferWithPlaybackState({
            offlineContext,
            destination,
            buffer,
            startTime: startSeconds,
            gainValue: gain,
            playbackState,
            key,
            entry,
            section
          });

          if (scheduled) {
            scheduledCount += 1;
            scheduledCount += scheduleDependents(startSeconds, audioDecisionResult.context);
          }
        }
      }

      return scheduledCount;
    }

    const phraseRepeats = section.type === "normal" ? 1 : 2;
    const allowedPhraseBars = getAllowedLocalBarIndexesForKey(key, section);

    if (!allowedPhraseBars.length) return 0;

    const phraseBaseChance = getActivationChance(audioProfile, 0.45);
    let scheduledCount = 0;

    for (let i = 0; i < phraseRepeats; i++) {
      const localBar = chooseOne(random, allowedPhraseBars);
      const startSeconds = section.startSeconds + localBar * section.barSeconds;
      const audioDecisionResult = resolveRuleProfileDecision({
        random,
        plan,
        playbackState,
        kind: "audio",
        key,
        entry,
        section,
        lifecycleStates,
        localBarIndex: localBar,
        startSeconds,
        baseChance: phraseBaseChance,
        profile: audioProfile
      });

      if (audioDecisionResult.allowed) {
        applyCutoffRulesForAllowedDecision(playbackState, audioDecisionResult.context, audioProfile);
        const scheduled = scheduleAudioBufferWithPlaybackState({
          offlineContext,
          destination,
          buffer,
          startTime: startSeconds,
          gainValue: gain,
          playbackState,
          key,
          entry,
          section
        });

        if (scheduled) {
          scheduledCount += 1;
          scheduledCount += scheduleDependents(startSeconds, audioDecisionResult.context);
        }
      }
    }

    return scheduledCount;
  }`;

renderer = replaceFunction(renderer, "scheduleAudioStemInSection", newScheduleAudioStemInSection);

const catalog = readJson(catalogPath);
const catalogKeys = getCatalogKeys(catalog);

const dependentRuleResults = [];
const dependentTargetResults = [];

dependentRuleResults.push(ensureDependentRule(
  catalog,
  catalogKeys,
  "samples/crash_washes_metal_even (consolidated).wav",
  "samples/crash_washes_metal_dlay_even (consolidated).wav",
  0.2,
  "dependent_crash_washes_delay_after_normal",
  "Definitions doc: crash_washes_metal_dlay_even has 20% chance if crash_washes_metal_even activates."
));

dependentRuleResults.push(ensureDependentRule(
  catalog,
  catalogKeys,
  "samples/big_crash_layer_odd_metal (consolidated).wav",
  "samples/big_crash_layer_odd_dlay_metal (consolidated).wav",
  0.5,
  "dependent_big_crash_layer_delay_after_normal",
  "Definitions doc: big_crash_layer_odd_dlay_metal has 50% chance if big_crash_layer_odd_metal activates."
));

dependentTargetResults.push(markDependentOnlyTarget(
  catalog,
  catalogKeys,
  "samples/crash_washes_metal_dlay_even (consolidated).wav",
  "Dependent activation target only: should not roll independently from its normal crash wash source."
));

dependentTargetResults.push(markDependentOnlyTarget(
  catalog,
  catalogKeys,
  "samples/big_crash_layer_odd_dlay_metal (consolidated).wav",
  "Dependent activation target only: should not roll independently from its normal big crash layer source."
));

const report = {
  generatedAt: new Date().toISOString(),
  batch: "dependent activation batch 1A",
  rendererPath: "full-renderer.js",
  catalogPath: "data/full-rules-catalog.json",
  note: "Adds a reusable dependent activation rule type: when a source audio stem successfully schedules, target audio stems roll their dependent chance and still pass through rule-profile decision checks.",
  rendererChanged: renderer !== originalRenderer,
  rendererChanges,
  dependentRuleResults,
  dependentTargetResults
};

fs.writeFileSync(rendererPath, renderer, "utf8");
writeJson(catalogPath, catalog);
writeJson(reportJsonPath, report);

const lines = [];
lines.push("TEST PROJECT 2 - DEPENDENT ACTIVATION BATCH 1A REPORT");
lines.push("");
lines.push(`Generated: ${report.generatedAt}`);
lines.push("Renderer change: reusable dependent activation system");
lines.push("Catalog change: two confirmed normal/delay pairs");
lines.push("");
lines.push("Renderer changes:");
for (const change of rendererChanges) {
  lines.push(`- ${change.label}: ${change.status}`);
}
if (!rendererChanges.length) lines.push("- none");
lines.push("- scheduleAudioStemInSection: full function replaced to call dependent activation after successful audio scheduling");
lines.push("");
lines.push("Dependent source rules:");
for (const result of dependentRuleResults) {
  lines.push(`- ${result.sourceKey} -> ${result.targetKey} @ ${result.chance}: ${result.status}`);
}
lines.push("");
lines.push("Dependent-only targets:");
for (const result of dependentTargetResults) {
  lines.push(`- ${result.targetKey}: ${result.status}`);
}
lines.push("");
lines.push("Behaviour:");
lines.push("- Source file rolls/schedules using its normal existing rules.");
lines.push("- If source schedules, target rolls its dependent chance.");
lines.push("- Target still passes through rule-profile decision checks.");
lines.push("- If source does not schedule, target has no independent direct activation.");

fs.writeFileSync(reportTxtPath, lines.join("\n").trimEnd() + "\n", "utf8");

console.log(lines.join("\n"));
