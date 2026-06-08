(() => {
  const rulesPath = "data/rules.json";
  const catalogPath = "data/full-rules-catalog.json";
  const midiPatternsPath = "data/midi-patterns.json";
  const lyrixRulesPath = "data/lyrix-rules.json";

  const wavButton = document.getElementById("downloadWavButton");
  const mp3Button = document.getElementById("downloadMp3Button");
  const statusText = document.getElementById("statusText");
  const attributionLink = document.getElementById("attributionLink");

  let rules = null;
  let catalog = null;
  let midiPatterns = null;
  let lyrixRules = null;
  let currentSeed = makeSeed();
  let currentRenderBuffers = null;

  const firstPassLyrixSectionIds = new Set([
    "nochoice",
    "jigsaw",
    "anxiety",
    "bethere",
    "settledown",
    "hunch",
    "beatles",
    "glissando",
    "greentea",
    "usually",
    "brainears",
    "yapa",
    "cuppa",
    "sellingshares",
    "grounded",
    "greenguy",
    "gromit_1",
    "gromit_2"
  ]);


  function getLyrixSectionLengthBars(section) {
    return Number(section.lengthBars || section.activationPointLengthBars || section.logicalLengthBars || 0);
  }
  function getFirstPassLyrixSections() {
    if (!lyrixRules?.sections) return [];
    return lyrixRules.sections.filter(section => firstPassLyrixSectionIds.has(section.id));
  }

  function chooseFirstPassLyrixSection(random, lyrixSectionUsage = new Map()) {
    const candidates = getFirstPassLyrixSections().filter(section =>
      Number(section.globalInclusionChance) > 0 &&
      (!section.maxSeparateOccasions || (lyrixSectionUsage.get(section.id) || 0) < Number(section.maxSeparateOccasions)) &&
      getLyrixSectionLengthBars(section) > 0 &&
      Array.isArray(section.parts) &&
      section.parts.length > 0
    );

    const included = candidates.filter(section =>
      chance(random, Number(section.globalInclusionChance) || 0)
    );

    if (!included.length) return null;
    return chooseOne(random, included);
  }

  function getBridgeLyrixGlobalRules() {
    return (lyrixRules?.specialSystems || []).find(system => system.id === "bridge_lyrix_global_rules") || null;
  }

  function getBridgeLyrixSections() {
    if (!lyrixRules?.sections) return [];

    const bridgeRules = getBridgeLyrixGlobalRules();
    const bridgeSectionIds = new Set(bridgeRules?.sectionIds || []);

    return lyrixRules.sections.filter(section =>
      bridgeSectionIds.has(section.id) ||
      section.kind === "bridge" ||
      (Array.isArray(section.tags) && section.tags.includes("bridge"))
    );
  }

  function getBridgeLyrixDropoutChance(section) {
    const bridgeRules = getBridgeLyrixGlobalRules();
    return clampProbability(section?.dropoutChance ?? bridgeRules?.dropoutChance ?? 0);
  }
  function getBridgeLyrixActivationChance(section) {
    const bridgeRules = getBridgeLyrixGlobalRules();
    return clampProbability(section?.activationChance ?? bridgeRules?.activationChanceEach ?? 0.02);
  }

  function canBridgePlayBeforeLyrixSection(section) {
    if (!section) return false;

    const id = String(section.id || "").toLowerCase();
    const tensionLabel = String(section.tensionLabel || "").toLowerCase();

    if (id === "bollocks" || id.includes("bollocks")) return false;

    return ![
      "highest",
      "high",
      "medium_high"
    ].includes(tensionLabel);
  }

  function chooseBridgeLeadInBars(random) {
    return chance(random, 0.5) ? 2 : 3;
  }

  function getLyrixSectionParityRequirement(section) {
    const tags = Array.isArray(section?.tags) ? section.tags.map(tag => String(tag).toLowerCase()) : [];

    if (tags.includes("odd")) return "odd";
    if (tags.includes("even")) return "even";

    return null;
  }

  function doesBarOffsetPreserveLyrixParity(section, offsetBars) {
    const parityRequirement = getLyrixSectionParityRequirement(section);

    if (!parityRequirement) return true;

    return Math.abs(Number(offsetBars) || 0) % 2 === 0;
  }

  function chooseSafeBridgeLeadInBars(random, targetLyrixSection) {
    const preferred = chooseBridgeLeadInBars(random);
    const fallback = preferred === 2 ? 3 : 2;

    if (doesBarOffsetPreserveLyrixParity(targetLyrixSection, preferred)) return preferred;
    if (doesBarOffsetPreserveLyrixParity(targetLyrixSection, fallback)) return fallback;

    return null;
  }

  function selectIncludedBridgeLyrixSections(random) {
    const bridgeRules = getBridgeLyrixGlobalRules();

    return getBridgeLyrixSections().filter(section => {
      const globalInclusionChance = clampProbability(
        section.globalInclusionChance ?? bridgeRules?.globalInclusionChanceEach ?? 0
      );

      return chance(random, globalInclusionChance);
    });
  }

  function chooseBridgeLyrixSection(random, includedBridgeLyrixSections, lyrixSectionUsage = new Map()) {
    const bridgeRules = getBridgeLyrixGlobalRules();

    const candidates = (includedBridgeLyrixSections || []).filter(section => {
      const maxSeparateOccasions = Number(section.maxSeparateOccasions ?? bridgeRules?.maxSeparateOccasions ?? 0);
      const currentUsage = lyrixSectionUsage.get(section.id) || 0;

      return (
        (!maxSeparateOccasions || currentUsage < maxSeparateOccasions) &&
        getLyrixSectionLengthBars(section) > 0 &&
        Array.isArray(section.parts) &&
        section.parts.length > 0
      );
    });

    const activated = candidates.filter(section =>
      chance(random, getBridgeLyrixActivationChance(section))
    );

    if (!activated.length) return null;
    return chooseOne(random, activated);
  }
  function getLyrixSectionAudioFiles(section) {
    const files = [];
    if (!section?.parts) return files;

    for (const part of section.parts) {
      if (part.dry) files.push(part.dry);
      if (part.wet && !part.dryOnly) files.push(part.wet);
      if (part.file) files.push(part.file);
    }


    const adlibs = section.adlibs ? [].concat(section.adlibs) : [];

    for (const adlib of adlibs) {
      if (adlib.file) files.push(adlib.file);
      if (adlib.files?.dry) files.push(adlib.files.dry);
      if (adlib.files?.wet) files.push(adlib.files.wet);
    }
    if (section.part3ReplacementRule?.replacementFile) files.push(section.part3ReplacementRule.replacementFile);
    if (section.leadIn?.file) files.push(section.leadIn.file);
    if (section.leadIn?.files?.dry) files.push(section.leadIn.files.dry);
    if (section.leadIn?.files?.wet) files.push(section.leadIn.files.wet);
    return [...new Set(files)];
  }

  function setStatus(message) {
    console.log(message);
    if (statusText) statusText.textContent = message;
  }

  function makeSeed() {
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return values[0];
    }
    return Date.now() >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function chance(random, probability) {
    return random() < probability;
  }

  function chooseOne(random, items) {
    if (!items || !items.length) return null;
    return items[Math.floor(random() * items.length)];
  }

  function getOpportunityIntervalFromKey(key) {
    const match = String(key || "").match(/(?:^|[_\-\s])x(2|4|6|8)(?:[_\-\s.]|$)/i);
    return match ? Number(match[1]) : 1;
  }

  function getTrackBarNumber(section, localBarIndex = 0) {
    const startBar = Number(section?.trackStartBar || 1);
    return startBar + Number(localBarIndex || 0);
  }

  function getValidOpportunityIndexForKeyAtBar(key, trackBarNumber) {
    const lower = String(key || "").toLowerCase();
    const isOddOnly = /(?:^|[_\-\s])odd(?:[_\-\s.]|$)/i.test(lower);
    const isEvenOnly = /(?:^|[_\-\s])even(?:[_\-\s.]|$)/i.test(lower);
    const isOddBar = trackBarNumber % 2 === 1;

    if (isOddOnly && !isOddBar) return null;
    if (isEvenOnly && isOddBar) return null;

    if (isOddOnly) return Math.floor((trackBarNumber + 1) / 2);
    if (isEvenOnly) return Math.floor(trackBarNumber / 2);

    return trackBarNumber;
  }

  function isBarOpportunityAllowedForKey(key, section, localBarIndex = 0) {
    const trackBarNumber = getTrackBarNumber(section, localBarIndex);
    const opportunityIndex = getValidOpportunityIndexForKeyAtBar(key, trackBarNumber);

    if (opportunityIndex === null) return false;

    const interval = getOpportunityIntervalFromKey(key);
    return interval <= 1 || opportunityIndex % interval === 0;
  }
  function getAllowedLocalBarIndexesForKey(key, section) {
    const bars = Math.max(0, Number(section?.bars || 0));
    const indexes = [];

    for (let localBarIndex = 0; localBarIndex < bars; localBarIndex++) {
      if (isBarOpportunityAllowedForKey(key, section, localBarIndex)) {
        indexes.push(localBarIndex);
      }
    }

    return indexes;
  }

  function chooseAllowedLocalBarIndexForKey(random, key, section) {
    const allowedIndexes = getAllowedLocalBarIndexesForKey(key, section);
    if (!allowedIndexes.length) return null;
    return chooseOne(random, allowedIndexes);
  }
  function keyHasFilenameToken(key, token) {
    const escapedToken = String(token || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|[\\/_.\\-\\s])${escapedToken}(?:[\\/_.\\-\\s]|$)`, "i");
    return pattern.test(String(key || ""));
  }

  function isHookSection(section) {
    return (
      String(section?.type || "").toLowerCase().includes("hook") ||
      (Array.isArray(section?.tags) && section.tags.some(tag => String(tag).toLowerCase() === "hook"))
    );
  }

  function isHookKey(key) {
    return keyHasFilenameToken(key, "hook");
  }
  function createLifecycleState(id) {
    return {
      id,
      included: false,
      introduced: false,
      available: false,
      activated: false,
      withdrawn: false,
      activationCount: 0,
      dropoutCount: 0,
      lastActivatedOpportunity: null
    };
  }

  function getLifecycleState(lifecycleStates, id) {
    if (!lifecycleStates.has(id)) {
      lifecycleStates.set(id, createLifecycleState(id));
    }

    return lifecycleStates.get(id);
  }

  function includeLifecycleItem(lifecycleStates, id) {
    const state = getLifecycleState(lifecycleStates, id);
    state.included = true;
    return state;
  }

  function introduceLifecycleItem(lifecycleStates, id) {
    const state = getLifecycleState(lifecycleStates, id);
    state.introduced = true;
    state.withdrawn = false;
    return state;
  }

  function setLifecycleAvailability(lifecycleStates, id, available) {
    const state = getLifecycleState(lifecycleStates, id);
    state.available = Boolean(available);
    return state;
  }

  function activateLifecycleItem(lifecycleStates, id, opportunityId = null) {
    const state = getLifecycleState(lifecycleStates, id);
    state.activated = true;
    state.activationCount += 1;
    state.lastActivatedOpportunity = opportunityId;
    return state;
  }

  function dropoutLifecycleItem(lifecycleStates, id) {
    const state = getLifecycleState(lifecycleStates, id);
    state.activated = false;
    state.dropoutCount += 1;
    return state;
  }

  function withdrawLifecycleItem(lifecycleStates, id) {
    const state = getLifecycleState(lifecycleStates, id);
    state.available = false;
    state.activated = false;
    state.withdrawn = true;
    return state;
  }
  function getAudioLifecycleId(key) {
    return `audio:${key}`;
  }

  function getMidiLifecycleId(key) {
    return `midi:${key}`;
  }

  function createLifecycleMapFromPlan(plan) {
    const lifecycleStates = new Map();

    for (const state of plan?.lifecycleStates || []) {
      if (state?.id) {
        lifecycleStates.set(state.id, { ...state });
      }
    }

    return lifecycleStates;
  }

  function writeLifecycleMapToPlan(plan, lifecycleStates) {
    if (!plan || !lifecycleStates) return plan;
    plan.lifecycleStates = [...lifecycleStates.values()];
    return plan;
  }
  function clampProbability(value, fallback = 0) {
    const number = Number(value);

    if (!Number.isFinite(number)) return fallback;
    if (number < 0) return 0;
    if (number > 1) return 1;

    return number;
  }

  function calculateLifecycleDropoutChance(state, options = {}) {
    const baseChance = clampProbability(options.baseChance ?? 0);
    const increasePerActivation = clampProbability(options.increasePerActivation ?? 0);
    const maxChance = clampProbability(options.maxChance ?? 1, 1);
    const activationCount = Math.max(0, Number(state?.activationCount || 0));

    return Math.min(maxChance, baseChance + activationCount * increasePerActivation);
  }

  function shouldDropoutLifecycleItem(random, lifecycleStates, id, options = {}) {
    const state = getLifecycleState(lifecycleStates, id);

    if (!state.activated) return false;

    const dropoutChance = calculateLifecycleDropoutChance(state, options);

    if (chance(random, dropoutChance)) {
      dropoutLifecycleItem(lifecycleStates, id);
      return true;
    }

    return false;
  }
  function isLifecycleItemEligible(state) {
    return Boolean(
      state &&
      state.included &&
      state.introduced &&
      state.available &&
      !state.withdrawn
    );
  }

  function isLifecycleIdEligible(lifecycleStates, id) {
    return isLifecycleItemEligible(getLifecycleState(lifecycleStates, id));
  }

  function setLifecycleEligible(lifecycleStates, id) {
    includeLifecycleItem(lifecycleStates, id);
    introduceLifecycleItem(lifecycleStates, id);
    setLifecycleAvailability(lifecycleStates, id, true);
    return getLifecycleState(lifecycleStates, id);
  }

  function normalizeRuleDecisionToken(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/^#/, "")
      .replace(/[\s\-]+/g, "_");
  }

  function addRuleDecisionTags(targetSet, values, prefix = "") {
    if (!targetSet || !values) return targetSet;

    const list = Array.isArray(values) ? values : [values];

    for (const value of list) {
      const token = normalizeRuleDecisionToken(value);
      if (!token) continue;
      targetSet.add(prefix + token);
    }

    return targetSet;
  }

  function getEntryRuleDecisionTags(entry) {
    const tags = new Set();

    if (!entry) return tags;

    addRuleDecisionTags(tags, entry.tags);
    addRuleDecisionTags(tags, entry.ruleTags);
    addRuleDecisionTags(tags, entry.manualTags);
    addRuleDecisionTags(tags, entry.family, "family:");
    addRuleDecisionTags(tags, entry.families, "family:");
    addRuleDecisionTags(tags, entry.folder, "folder:");
    addRuleDecisionTags(tags, entry.type, "type:");

    return tags;
  }

  function getSectionRuleDecisionTags(section) {
    const tags = new Set();

    if (!section) return tags;

    addRuleDecisionTags(tags, section.tags);
    addRuleDecisionTags(tags, section.type, "section_type:");
    addRuleDecisionTags(tags, section.lyrixSectionId, "lyrix_section:");

    return tags;
  }

  function getRuleDecisionItemKey({ key = "", entry = null, pattern = null } = {}) {
    return String(key || entry?.key || pattern?.file || "");
  }

  function createRuleDecisionContext({
    kind = "audio",
    key = "",
    entry = null,
    pattern = null,
    section = null,
    lifecycleStates = null,
    localBarIndex = null,
    startSeconds = null,
    baseChance = 1
  } = {}) {
    const itemKey = getRuleDecisionItemKey({ key, entry, pattern });
    const lifecycleId = itemKey
      ? (kind === "midi" ? getMidiLifecycleId(itemKey) : getAudioLifecycleId(itemKey))
      : null;

    const lifecycleState = lifecycleStates && lifecycleId
      ? getLifecycleState(lifecycleStates, lifecycleId)
      : null;

    return {
      kind,
      itemKey,
      entry,
      pattern,
      section,
      sectionId: String(section?.id || ""),
      sectionType: String(section?.type || ""),
      localBarIndex,
      trackBarNumber: section && localBarIndex !== null
        ? getTrackBarNumber(section, localBarIndex)
        : null,
      startSeconds,
      baseChance: clampProbability(baseChance, 1),
      lifecycleId,
      lifecycleState,
      itemTags: getEntryRuleDecisionTags(entry),
      sectionTags: getSectionRuleDecisionTags(section)
    };
  }

  function createRuleDecisionResult(context, options = {}) {
    const baseChance = clampProbability(options.baseChance ?? context?.baseChance ?? 1, 1);

    return {
      kind: String(context?.kind || ""),
      itemKey: String(context?.itemKey || ""),
      lifecycleId: String(context?.lifecycleId || ""),
      sectionId: String(context?.sectionId || ""),
      sectionType: String(context?.sectionType || ""),
      localBarIndex: context?.localBarIndex ?? null,
      trackBarNumber: context?.trackBarNumber ?? null,
      startSeconds: context?.startSeconds ?? null,
      allowed: true,
      blocked: false,
      droppedOut: false,
      baseChance,
      chanceMultiplier: 1,
      finalChance: baseChance,
      roll: null,
      reasons: []
    };
  }

  function addRuleDecisionReason(decision, code, details = {}) {
    if (!decision) return decision;
    if (!Array.isArray(decision.reasons)) decision.reasons = [];

    decision.reasons.push({
      code,
      ...details
    });

    return decision;
  }

  function blockRuleDecision(decision, code, details = {}) {
    if (!decision) return decision;

    decision.allowed = false;
    decision.blocked = true;
    decision.finalChance = 0;

    return addRuleDecisionReason(decision, code, details);
  }

  function multiplyRuleDecisionChance(decision, multiplier, code, details = {}) {
    if (!decision) return decision;

    const safeMultiplier = Number.isFinite(Number(multiplier))
      ? Math.max(0, Number(multiplier))
      : 1;

    decision.chanceMultiplier *= safeMultiplier;
    decision.finalChance = clampProbability(decision.baseChance * decision.chanceMultiplier);

    return addRuleDecisionReason(decision, code, {
      multiplier: safeMultiplier,
      ...details
    });
  }

  function markRuleDecisionDropout(decision, code, details = {}) {
    if (!decision) return decision;

    decision.allowed = false;
    decision.droppedOut = true;

    return addRuleDecisionReason(decision, code, details);
  }

  function finalizeRuleDecision(random, decision) {
    if (!decision) return false;

    if (decision.blocked || decision.droppedOut || decision.finalChance <= 0) {
      decision.allowed = false;
      return false;
    }

    const roll = random();
    decision.roll = roll;

    if (roll <= decision.finalChance) {
      return true;
    }

    decision.allowed = false;
    addRuleDecisionReason(decision, "chance_failed", {
      roll,
      finalChance: decision.finalChance
    });

    return false;
  }

  function recordRuleDecisionDebug(plan, decision) {
    if (!plan || !decision) return;

    if (!Array.isArray(plan.ruleDecisionDebug)) {
      plan.ruleDecisionDebug = [];
    }

    plan.ruleDecisionDebug.push({
      ...decision,
      reasons: Array.isArray(decision.reasons)
        ? decision.reasons.map(reason => ({ ...reason }))
        : []
    });
  }

  function createPlaybackRuleState() {
    return {
      activeItems: new Map(),
      blockedWindows: [],
      cutoffEvents: [],
      familyLocks: new Map(),
      nextItemId: 1
    };
  }

  function getPlaybackItemId(kind, key) {
    return `${normalizeRuleDecisionToken(kind)}:${String(key || "")}`;
  }

  function registerActivePlaybackItem(playbackState, {
    kind = "audio",
    key = "",
    family = "",
    startSeconds = 0,
    endSeconds = null,
    source = null,
    gainNode = null,
    sectionId = "",
    tags = []
  } = {}) {
    if (!playbackState) return null;

    const baseId = getPlaybackItemId(kind, key);
    const id = `${baseId}:${playbackState.nextItemId}`;
    playbackState.nextItemId += 1;

    const item = {
      id,
      kind,
      key,
      family: normalizeRuleDecisionToken(family),
      startSeconds: Number(startSeconds) || 0,
      endSeconds: Number.isFinite(Number(endSeconds)) ? Number(endSeconds) : null,
      source,
      gainNode,
      sectionId: String(sectionId || ""),
      tags: Array.isArray(tags)
        ? tags.map(tag => normalizeRuleDecisionToken(tag)).filter(Boolean)
        : []
    };

    playbackState.activeItems.set(id, item);

    if (item.family) {
      playbackState.familyLocks.set(item.family, id);
    }

    return item;
  }

  function unregisterActivePlaybackItem(playbackState, idOrItem) {
    if (!playbackState || !idOrItem) return;

    const id = typeof idOrItem === "string" ? idOrItem : idOrItem.id;
    const item = playbackState.activeItems.get(id);

    if (item?.family && playbackState.familyLocks.get(item.family) === id) {
      playbackState.familyLocks.delete(item.family);
    }

    playbackState.activeItems.delete(id);
  }

  function expirePlaybackItemsAtTime(playbackState, timeSeconds) {
    if (!playbackState) return 0;

    const time = Math.max(0, Number(timeSeconds) || 0);
    let expiredCount = 0;

    for (const item of [...playbackState.activeItems.values()]) {
      if (item.endSeconds !== null && item.endSeconds <= time) {
        unregisterActivePlaybackItem(playbackState, item);
        expiredCount += 1;
      }
    }

    return expiredCount;
  }

  function getEntryPrimaryFamily(entry) {
    if (!entry) return "";

    if (entry.family) return normalizeRuleDecisionToken(entry.family);

    if (Array.isArray(entry.families) && entry.families.length) {
      return normalizeRuleDecisionToken(entry.families[0]);
    }

    return "";
  }

  function getEntryPlaybackTags(entry) {
    const tags = [...getEntryRuleDecisionTags(entry)]
      .map(tag => normalizeRuleDecisionToken(tag))
      .filter(Boolean);

    return [...new Set(tags)];
  }

  function registerScheduledPlaybackHandle(playbackState, {
    kind = "audio",
    key = "",
    entry = null,
    scheduleHandle = null,
    section = null,
    family = ""
  } = {}) {
    if (!playbackState || !scheduleHandle?.scheduled) return null;

    return registerActivePlaybackItem(playbackState, {
      kind,
      key,
      family: family || getEntryPrimaryFamily(entry),
      startSeconds: scheduleHandle.startTime,
      endSeconds: scheduleHandle.endTime,
      source: scheduleHandle.source,
      gainNode: scheduleHandle.gainNode,
      sectionId: section?.id || "",
      tags: getEntryPlaybackTags(entry)
    });
  }
  function getActivePlaybackItems(playbackState, filter = {}) {
    if (!playbackState) return [];

    const kind = filter.kind ? normalizeRuleDecisionToken(filter.kind) : "";
    const family = filter.family ? normalizeRuleDecisionToken(filter.family) : "";
    const tag = filter.tag ? normalizeRuleDecisionToken(filter.tag) : "";
    const key = filter.key ? String(filter.key) : "";

    return [...playbackState.activeItems.values()].filter(item => {
      if (kind && normalizeRuleDecisionToken(item.kind) !== kind) return false;
      if (family && item.family !== family) return false;
      if (tag && !item.tags.includes(tag)) return false;
      if (key && item.key !== key) return false;
      return true;
    });
  }

  function doesPlaybackItemOverlapTime(item, timeSeconds) {
    if (!item) return false;

    const time = Math.max(0, Number(timeSeconds) || 0);
    const start = Math.max(0, Number(item.startSeconds) || 0);
    const end = item.endSeconds === null
      ? Infinity
      : Math.max(start, Number(item.endSeconds) || start);

    return start <= time && time < end;
  }

  function getActivePlaybackItemsAtTime(playbackState, timeSeconds, filter = {}) {
    return getActivePlaybackItems(playbackState, filter)
      .filter(item => doesPlaybackItemOverlapTime(item, timeSeconds));
  }

  function getFuturePlaybackItemsAfterTime(playbackState, timeSeconds, filter = {}) {
    const time = Math.max(0, Number(timeSeconds) || 0);

    return getActivePlaybackItems(playbackState, filter)
      .filter(item => Math.max(0, Number(item.startSeconds) || 0) >= time);
  }
  function cutOffPlaybackItem(playbackState, item, cutTimeSeconds, options = {}) {
    if (!playbackState || !item) return false;

    const cutTime = Math.max(0, Number(cutTimeSeconds) || 0);
    const fadeSeconds = Math.max(0, Number(options.fadeSeconds) || 0);

    if (item.gainNode && fadeSeconds > 0) {
      try {
        item.gainNode.gain.setValueAtTime(item.gainNode.gain.value, cutTime);
        item.gainNode.gain.linearRampToValueAtTime(0, cutTime + fadeSeconds);
      } catch (error) {
        console.warn("Cutoff gain ramp failed:", error);
      }
    }

    if (item.source) {
      try {
        item.source.stop(cutTime + fadeSeconds);
      } catch (error) {
        console.warn("Cutoff source stop failed:", error);
      }
    }

    playbackState.cutoffEvents.push({
      itemId: item.id,
      key: item.key,
      family: item.family,
      cutTimeSeconds: cutTime,
      fadeSeconds,
      reason: String(options.reason || "cutoff")
    });

    unregisterActivePlaybackItem(playbackState, item);

    return true;
  }

  function cutOffPlaybackItemsAtTime(playbackState, filter = {}, cutTimeSeconds = 0, options = {}) {
    const items = getActivePlaybackItemsAtTime(playbackState, cutTimeSeconds, filter);
    let count = 0;

    for (const item of items) {
      if (cutOffPlaybackItem(playbackState, item, cutTimeSeconds, options)) {
        count += 1;
      }
    }

    return count;
  }

  function cutOffFuturePlaybackItemsAfterTime(playbackState, filter = {}, cutTimeSeconds = 0, options = {}) {
    const items = getFuturePlaybackItemsAfterTime(playbackState, cutTimeSeconds, filter);
    let count = 0;

    for (const item of items) {
      if (cutOffPlaybackItem(playbackState, item, cutTimeSeconds, options)) {
        count += 1;
      }
    }

    return count;
  }

  function applyGenericCutoffAction(playbackState, {
    cutTimeSeconds = 0,
    filter = {},
    includeFutureScheduled = false,
    fadeSeconds = 0.01,
    reason = "generic_cutoff",
    blockNewActivationsUntilSeconds = null,
    blockFilter = null
  } = {}) {
    if (!playbackState) {
      return {
        activeCutCount: 0,
        futureCutCount: 0,
        blockWindow: null
      };
    }

    const activeCutCount = cutOffPlaybackItemsAtTime(playbackState, filter, cutTimeSeconds, {
      fadeSeconds,
      reason
    });

    const futureCutCount = includeFutureScheduled
      ? cutOffFuturePlaybackItemsAfterTime(playbackState, filter, cutTimeSeconds, {
          fadeSeconds,
          reason: `${reason}_future`
        })
      : 0;

    let blockWindow = null;

    if (Number.isFinite(Number(blockNewActivationsUntilSeconds))) {
      const activeBlockFilter = blockFilter || filter;

      blockWindow = addActivationBlockWindow(playbackState, {
        startsAtSeconds: cutTimeSeconds,
        endsAtSeconds: Number(blockNewActivationsUntilSeconds),
        kind: activeBlockFilter.kind || "",
        key: activeBlockFilter.key || "",
        family: activeBlockFilter.family || "",
        tag: activeBlockFilter.tag || "",
        reason
      });
    }

    return {
      activeCutCount,
      futureCutCount,
      blockWindow
    };
  }
  function cutOffMatchingPlaybackItems(playbackState, filter = {}, cutTimeSeconds = 0, options = {}) {
    const items = getActivePlaybackItems(playbackState, filter);
    let count = 0;

    for (const item of items) {
      if (cutOffPlaybackItem(playbackState, item, cutTimeSeconds, options)) {
        count += 1;
      }
    }

    return count;
  }

  function addActivationBlockWindow(playbackState, {
    startsAtSeconds = 0,
    endsAtSeconds = 0,
    kind = "",
    key = "",
    family = "",
    tag = "",
    reason = "blocked_window"
  } = {}) {
    if (!playbackState) return null;

    const window = {
      startsAtSeconds: Math.max(0, Number(startsAtSeconds) || 0),
      endsAtSeconds: Math.max(0, Number(endsAtSeconds) || 0),
      kind: normalizeRuleDecisionToken(kind),
      key: String(key || ""),
      family: normalizeRuleDecisionToken(family),
      tag: normalizeRuleDecisionToken(tag),
      reason: String(reason || "blocked_window")
    };

    if (window.endsAtSeconds < window.startsAtSeconds) {
      const temp = window.startsAtSeconds;
      window.startsAtSeconds = window.endsAtSeconds;
      window.endsAtSeconds = temp;
    }

    playbackState.blockedWindows.push(window);
    return window;
  }

  function getMatchingActivationBlockWindow(playbackState, context) {
    if (!playbackState || !context) return null;

    const startSeconds = Number(context.startSeconds ?? 0);
    const kind = normalizeRuleDecisionToken(context.kind);
    const key = String(context.itemKey || "");
    const itemTags = context.itemTags || new Set();

    for (const window of playbackState.blockedWindows) {
      if (startSeconds < window.startsAtSeconds || startSeconds >= window.endsAtSeconds) continue;
      if (window.kind && window.kind !== kind) continue;
      if (window.key && window.key !== key) continue;
      if (window.family && !itemTags.has(`family:${window.family}`) && !itemTags.has(window.family)) continue;
      if (window.tag && !itemTags.has(window.tag)) continue;

      return window;
    }

    return null;
  }

  function applyActivationBlockWindows(playbackState, context, decision) {
    const window = getMatchingActivationBlockWindow(playbackState, context);

    if (!window) return decision;

    return blockRuleDecision(decision, "activation_block_window", {
      reason: window.reason,
      startsAtSeconds: window.startsAtSeconds,
      endsAtSeconds: window.endsAtSeconds
    });
  }

  function isFamilyLockedByOtherItem(playbackState, family, itemId) {
    if (!playbackState || !family) return false;

    const normalizedFamily = normalizeRuleDecisionToken(family);
    const lockedItemId = playbackState.familyLocks.get(normalizedFamily);

    return Boolean(lockedItemId && lockedItemId !== itemId);
  }

  function applyFamilyLock(playbackState, context, decision, family) {
    if (!playbackState || !context || !family) return decision;

    if (isFamilyLockedByOtherItem(playbackState, family, context.lifecycleId || context.itemKey)) {
      return blockRuleDecision(decision, "family_locked", {
        family: normalizeRuleDecisionToken(family),
        lockedBy: playbackState.familyLocks.get(normalizeRuleDecisionToken(family))
      });
    }

    return decision;
  }
  function getRuleProfilePool() {
    const pools = catalog?.rulePools || {};

    return (
      pools.ruleProfiles ||
      pools.stemRules ||
      pools.activationRules ||
      {}
    );
  }

  function getRuleMapByName(pool, names) {
    if (!pool) return {};

    for (const name of names) {
      const value = pool[name];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
      }
    }

    return {};
  }

  function getRuleObjectFromMap(map, key) {
    if (!map || !key) return null;

    const exact = map[key];
    if (exact && typeof exact === "object" && !Array.isArray(exact)) {
      return exact;
    }

    const normalizedKey = normalizeRuleDecisionToken(key);

    for (const [mapKey, value] of Object.entries(map)) {
      if (
        normalizeRuleDecisionToken(mapKey) === normalizedKey &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        return value;
      }
    }

    return null;
  }

  function mergeRuleProfiles(...profiles) {
    const merged = {};

    for (const profile of profiles) {
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) continue;

      for (const [key, value] of Object.entries(profile)) {
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          merged[key] &&
          typeof merged[key] === "object" &&
          !Array.isArray(merged[key])
        ) {
          merged[key] = {
            ...merged[key],
            ...value
          };
        } else {
          merged[key] = value;
        }
      }
    }

    return merged;
  }

  function getRuleProfileForEntry(entry) {
    if (!entry) return {};

    const pool = getRuleProfilePool();

    const defaultRules = pool.default || pool.defaults || {};

    const byKey = getRuleMapByName(pool, [
      "byKey",
      "keys",
      "stems",
      "audio",
      "midi",
      "files"
    ]);

    const byFamily = getRuleMapByName(pool, [
      "byFamily",
      "families",
      "familyRules"
    ]);

    const byTag = getRuleMapByName(pool, [
      "byTag",
      "tags",
      "tagRules"
    ]);

    const keyRules = getRuleObjectFromMap(byKey, entry.key);
    const familyRules = getRuleObjectFromMap(byFamily, entry.family);

    const tagRules = [];

    for (const tag of entry.tags || []) {
      const tagRule = getRuleObjectFromMap(byTag, tag);
      if (tagRule) tagRules.push(tagRule);
    }

    return mergeRuleProfiles(
      defaultRules,
      ...tagRules,
      familyRules,
      keyRules
    );
  }

  function getMidiPatternSampleTag(pattern) {
    const samplePath = String(pattern?.samplePath || "");
    const fileName = samplePath.split(/[\\/]/).pop() || "";
    const cleanName = fileName.replace(/\.[^.]+$/, "");
    return normalizeRuleDecisionToken(cleanName);
  }

  function getMidiPatternRuleEntry(pattern) {
    if (!pattern) return null;

    const entry = getCatalogEntry(pattern.file);
    const sampleTag = getMidiPatternSampleTag(pattern);
    const tags = new Set(entry?.tags || []);

    if (sampleTag) tags.add(sampleTag);

    if (entry) {
      return {
        ...entry,
        tags: [...tags],
        midi: {
          ...(entry.midi || {}),
          samplePath: pattern.samplePath,
          noteCount: pattern.notes?.length ?? entry.midi?.noteCount ?? null,
          lengthBeats: pattern.lengthBeats ?? entry.midi?.lengthBeats ?? null
        }
      };
    }

    return {
      key: pattern.file,
      type: "midi",
      folder: "midi files",
      family: pattern.id || pattern.file,
      tags: [...tags, "midi"],
      midi: {
        samplePath: pattern.samplePath,
        noteCount: pattern.notes?.length ?? null,
        lengthBeats: pattern.lengthBeats ?? null
      }
    };
  }

  function getRuleProfileForMidiPattern(pattern) {
    return getRuleProfileForEntry(getMidiPatternRuleEntry(pattern));
  }

  function getRuleChance(profile, names, fallback = 0) {
    if (!profile) return clampProbability(fallback);

    const list = Array.isArray(names) ? names : [names];

    for (const name of list) {
      if (profile[name] !== undefined) {
        return clampProbability(profile[name], fallback);
      }
    }

    return clampProbability(fallback);
  }

  function getGlobalInclusionChance(profile, fallback = 0) {
    return getRuleChance(profile, [
      "globalInclusionChance",
      "globalChance",
      "inclusionChance",
      "globalSelectionChance"
    ], fallback);
  }

  function getActivationChance(profile, fallback = 0) {
    return getRuleChance(profile, [
      "activationChance",
      "activationChanceEach",
      "chance",
      "opportunityChance"
    ], fallback);
  }

  function getDropoutChance(profile, fallback = 0) {
    return getRuleChance(profile, [
      "dropoutChance",
      "dropOutChance",
      "dropoutBaseChance"
    ], fallback);
  }
  function getRuleValue(profile, names, fallback = null) {
    if (!profile) return fallback;

    const list = Array.isArray(names) ? names : [names];

    for (const name of list) {
      if (profile[name] !== undefined) {
        return profile[name];
      }
    }

    return fallback;
  }

  function getRuleArray(profile, names) {
    const value = getRuleValue(profile, names, []);

    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
  }

  function getRuleObject(profile, names, fallback = {}) {
    const value = getRuleValue(profile, names, fallback);

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }

    return fallback;
  }

  function getDropoutRuleConfig(profile) {
    const dropout = getRuleObject(profile, [
      "dropout",
      "dropOut",
      "dropoutRule"
    ], {});

    return {
      baseChance: getDropoutChance(profile, dropout.baseChance ?? dropout.chance ?? 0),
      increasePerActivation: clampProbability(
        dropout.increasePerActivation ??
        profile?.dropoutIncreasePerActivation ??
        profile?.dropoutChanceIncrease ??
        0
      ),
      maxChance: clampProbability(
        dropout.maxChance ??
        profile?.dropoutMaxChance ??
        1,
        1
      )
    };
  }

  function getCutoffRules(profile) {
    return getRuleArray(profile, [
      "cutoffRules",
      "cutoffs",
      "cutoff",
      "cuts"
    ]);
  }

  function getHardClashRules(profile) {
    return getRuleArray(profile, [
      "hardClashes",
      "hardClashRules",
      "clashes",
      "cannotPlayWith"
    ]);
  }

  function getSoftMultiplierRules(profile) {
    return getRuleArray(profile, [
      "softMultipliers",
      "softMultiplierRules",
      "activationMultipliers",
      "chanceMultipliers"
    ]);
  }

  function getTimedBlockRules(profile) {
    return getRuleArray(profile, [
      "timedBlocks",
      "timedBlockRules",
      "shutoffWindows",
      "blockedWindows",
      "blockActivationWindows"
    ]);
  }

  function getFamilyLockRules(profile) {
    return getRuleArray(profile, [
      "familyLocks",
      "oneOfGroups",
      "mutualExclusionGroups",
      "exclusiveFamilies"
    ]);
  }

  function getDependencyRules(profile) {
    return getRuleArray(profile, [
      "dependencies",
      "requires",
      "requiresActive",
      "requiresIncluded"
    ]);
  }

  function getDensityRules(profile) {
    return getRuleArray(profile, [
      "densityRules",
      "densityMultipliers",
      "density"
    ]);
  }

  function getTensionRules(profile) {
    return getRuleArray(profile, [
      "tensionRules",
      "tensionMultipliers",
      "tension"
    ]);
  }

  function getCrescendoRules(profile) {
    return getRuleArray(profile, [
      "crescendoRules",
      "crescendoMultipliers",
      "crescendo"
    ]);
  }
  function normalizeRuleTargetFilter(target = {}) {
    if (typeof target === "string") {
      return {
        key: "",
        family: "",
        tag: normalizeRuleDecisionToken(target),
        kind: "",
        type: "",
        sectionType: ""
      };
    }

    if (!target || typeof target !== "object") {
      return {
        key: "",
        family: "",
        tag: "",
        kind: "",
        type: "",
        sectionType: ""
      };
    }

    return {
      key: String(target.key || target.file || target.stem || ""),
      family: normalizeRuleDecisionToken(target.family || target.group || ""),
      tag: normalizeRuleDecisionToken(target.tag || target.hasTag || target.tagged || ""),
      kind: normalizeRuleDecisionToken(target.kind || ""),
      type: normalizeRuleDecisionToken(target.type || ""),
      sectionType: normalizeRuleDecisionToken(target.sectionType || target.section || "")
    };
  }

  function getRuleTargets(rule) {
    if (!rule) return [];

    if (Array.isArray(rule)) return rule.map(target => normalizeRuleTargetFilter(target));

    const rawTargets =
      rule.targets ||
      rule.target ||
      rule.items ||
      rule.item ||
      rule.with ||
      rule.against ||
      rule.cuts ||
      rule.blocks ||
      [];

    const targets = Array.isArray(rawTargets) ? rawTargets : [rawTargets];

    return targets.map(target => normalizeRuleTargetFilter(target));
  }

  function doesRuleTargetMatchEntry(target, entry) {
    if (!entry) return false;

    const filter = normalizeRuleTargetFilter(target);
    const tags = getEntryRuleDecisionTags(entry);

    if (filter.key && filter.key !== entry.key) return false;
    if (filter.family && normalizeRuleDecisionToken(entry.family) !== filter.family) return false;
    if (filter.tag && !tags.has(filter.tag)) return false;
    if (filter.kind && normalizeRuleDecisionToken(entry.type) !== filter.kind) return false;
    if (filter.type && normalizeRuleDecisionToken(entry.type) !== filter.type) return false;

    return Boolean(filter.key || filter.family || filter.tag || filter.kind || filter.type);
  }

  function doesRuleTargetMatchContext(target, context) {
    if (!context) return false;

    const filter = normalizeRuleTargetFilter(target);

    if (filter.key && filter.key !== context.itemKey) return false;
    if (filter.kind && normalizeRuleDecisionToken(context.kind) !== filter.kind) return false;
    if (filter.sectionType && normalizeRuleDecisionToken(context.sectionType) !== filter.sectionType) return false;

    if (filter.family) {
      const familyTag = `family:${filter.family}`;
      if (!context.itemTags?.has(familyTag) && !context.itemTags?.has(filter.family)) return false;
    }

    if (filter.tag && !context.itemTags?.has(filter.tag)) return false;

    return Boolean(filter.key || filter.family || filter.tag || filter.kind || filter.sectionType);
  }

  function doesRuleTargetMatchPlaybackItem(target, item) {
    if (!item) return false;

    const filter = normalizeRuleTargetFilter(target);

    if (filter.key && filter.key !== item.key) return false;
    if (filter.kind && normalizeRuleDecisionToken(item.kind) !== filter.kind) return false;
    if (filter.family && normalizeRuleDecisionToken(item.family) !== filter.family) return false;
    if (filter.tag && !item.tags.includes(filter.tag)) return false;

    return Boolean(filter.key || filter.family || filter.tag || filter.kind);
  }

  function getPlaybackFilterFromRuleTarget(target) {
    const filter = normalizeRuleTargetFilter(target);

    return {
      key: filter.key,
      family: filter.family,
      tag: filter.tag,
      kind: filter.kind
    };
  }

  function findActivePlaybackItemsForRuleTargets(playbackState, targets, timeSeconds = null) {
    const list = Array.isArray(targets) ? targets : [targets];
    const matches = [];

    for (const target of list) {
      const filter = getPlaybackFilterFromRuleTarget(target);
      const items = timeSeconds === null
        ? getActivePlaybackItems(playbackState, filter)
        : getActivePlaybackItemsAtTime(playbackState, timeSeconds, filter);

      for (const item of items) {
        if (!matches.some(existing => existing.id === item.id)) {
          matches.push(item);
        }
      }
    }

    return matches;
  }
  function applyHardClashRulesToDecision(playbackState, context, decision, rules = []) {
    if (!playbackState || !context || !decision || !Array.isArray(rules)) return decision;

    for (const rule of rules) {
      const targets = getRuleTargets(rule);
      if (!targets.length) continue;

      const activeMatches = findActivePlaybackItemsForRuleTargets(
        playbackState,
        targets,
        context.startSeconds
      );

      if (activeMatches.length) {
        return blockRuleDecision(decision, "hard_clash", {
          ruleId: rule.id || "",
          targets,
          activeMatches: activeMatches.map(item => ({
            id: item.id,
            key: item.key,
            family: item.family
          }))
        });
      }
    }

    return decision;
  }

  function applySoftMultiplierRulesToDecision(playbackState, context, decision, rules = []) {
    if (!playbackState || !context || !decision || !Array.isArray(rules)) return decision;

    for (const rule of rules) {
      const targets = getRuleTargets(rule);
      const multiplier = Number(rule.multiplier ?? rule.chanceMultiplier ?? rule.activationMultiplier ?? 1);

      if (!targets.length || !Number.isFinite(multiplier)) continue;

      const activeMatches = findActivePlaybackItemsForRuleTargets(
        playbackState,
        targets,
        context.startSeconds
      );

      if (activeMatches.length) {
        multiplyRuleDecisionChance(decision, multiplier, "soft_multiplier", {
          ruleId: rule.id || "",
          targets,
          activeMatches: activeMatches.map(item => ({
            id: item.id,
            key: item.key,
            family: item.family
          }))
        });
      }
    }

    return decision;
  }

  function applyDependencyRulesToDecision(playbackState, context, decision, rules = []) {
    if (!playbackState || !context || !decision || !Array.isArray(rules)) return decision;

    for (const rule of rules) {
      const targets = getRuleTargets(rule);
      if (!targets.length) continue;

      const activeMatches = findActivePlaybackItemsForRuleTargets(
        playbackState,
        targets,
        context.startSeconds
      );

      if (!activeMatches.length) {
        return blockRuleDecision(decision, "dependency_missing", {
          ruleId: rule.id || "",
          targets
        });
      }
    }

    return decision;
  }

  function applyTimedBlockRulesToDecision(playbackState, context, decision, rules = [], random = null) {
    if (!playbackState || !context || !decision || !Array.isArray(rules)) return decision;

    for (const rule of rules) {
      const targets = getRuleTargets(rule);
      const durationSeconds = Number(rule.durationSeconds ?? rule.seconds ?? 0);

      if (!targets.length || !Number.isFinite(durationSeconds) || durationSeconds <= 0) continue;

      const activeMatches = findActivePlaybackItemsForRuleTargets(
        playbackState,
        targets,
        context.startSeconds
      );

      const ruleChance = clampProbability(rule.chance ?? 1, 1);
      const ruleRoll = typeof random === "function"
        ? random()
        : (Number.isFinite(Number(rule.roll)) ? Number(rule.roll) : 0);

      if (activeMatches.length && ruleRoll < ruleChance) {
        const endSeconds = Number(context.startSeconds || 0) + durationSeconds;

        addActivationBlockWindow(playbackState, {
          startsAtSeconds: context.startSeconds,
          endsAtSeconds: endSeconds,
          kind: context.kind,
          key: context.itemKey,
          reason: rule.id || "timed_block_rule"
        });

        return blockRuleDecision(decision, "timed_block_rule", {
          ruleId: rule.id || "",
          untilSeconds: endSeconds
        });
      }
    }

    return decision;
  }

  function applyFamilyLockRulesToDecision(playbackState, context, decision, rules = []) {
    if (!playbackState || !context || !decision || !Array.isArray(rules)) return decision;

    for (const rule of rules) {
      const family = rule.family || rule.group || rule.id || "";

      if (!family) continue;

      applyFamilyLock(playbackState, context, decision, family);

      if (decision.blocked) {
        addRuleDecisionReason(decision, "family_lock_rule", {
          ruleId: rule.id || "",
          family: normalizeRuleDecisionToken(family)
        });
        return decision;
      }
    }

    return decision;
  }

  function applyCutoffRulesForAllowedDecision(playbackState, context, profile = {}) {
    if (!playbackState || !context || !profile) return [];

    const events = [];

    for (const rule of getCutoffRules(profile)) {
      const targets = getRuleTargets(rule);
      if (!targets.length) continue;

      const fadeSeconds = Math.max(0, Number(rule.fadeSeconds ?? rule.fade ?? 0.01));
      const includeFutureScheduled = Boolean(rule.includeFutureScheduled ?? rule.includeFuture ?? false);

      for (const target of targets) {
        const filter = getPlaybackFilterFromRuleTarget(target);
        const result = applyGenericCutoffAction(playbackState, {
          cutTimeSeconds: context.startSeconds,
          filter,
          includeFutureScheduled,
          fadeSeconds,
          reason: rule.id || "rule_profile_cutoff"
        });

        if (result.activeCutCount || result.futureCutCount || result.blockWindow) {
          events.push({
            ruleId: rule.id || "",
            target,
            activeCutCount: result.activeCutCount,
            futureCutCount: result.futureCutCount,
            blockWindow: result.blockWindow
          });
        }
      }
    }

    return events;
  }
  function applyRuleProfileToDecision(playbackState, context, decision, profile = {}, random = null) {
    applyActivationBlockWindows(playbackState, context, decision);
    if (decision.blocked) return decision;

    applyTimedBlockRulesToDecision(playbackState, context, decision, getTimedBlockRules(profile), random);
    if (decision.blocked) return decision;

    applyFamilyLockRulesToDecision(playbackState, context, decision, getFamilyLockRules(profile));
    if (decision.blocked) return decision;

    applyDependencyRulesToDecision(playbackState, context, decision, getDependencyRules(profile));
    if (decision.blocked) return decision;

    applyHardClashRulesToDecision(playbackState, context, decision, getHardClashRules(profile));
    if (decision.blocked) return decision;

    applySoftMultiplierRulesToDecision(playbackState, context, decision, getSoftMultiplierRules(profile));

    applyDensityRulesToDecision(context, decision, profile);
    applyTensionRulesToDecision(context, decision, profile);
    applyCrescendoRulesToDecision(context, decision, profile);

    return decision;
  }
  function resolveRuleProfileDecision({
    random,
    plan = null,
    playbackState = null,
    kind = "audio",
    key = "",
    entry = null,
    pattern = null,
    section = null,
    lifecycleStates = null,
    localBarIndex = null,
    startSeconds = null,
    baseChance = 1,
    profile = null
  } = {}) {
    const safeRandom = typeof random === "function" ? random : (() => 1);

    const activeProfile = profile || (
      kind === "midi"
        ? getRuleProfileForMidiPattern(pattern)
        : getRuleProfileForEntry(entry)
    );

    const context = createRuleDecisionContext({
      kind,
      key,
      entry,
      pattern,
      section,
      lifecycleStates,
      localBarIndex,
      startSeconds,
      baseChance
    });

    const decision = createRuleDecisionResult(context, {
      baseChance
    });

    applyLifecycleDropoutToDecision(safeRandom, lifecycleStates, context, decision, activeProfile);
    if (decision.droppedOut) {
      recordRuleDecisionDebug(plan, decision);

      return {
        allowed: false,
        context,
        decision,
        profile: activeProfile
      };
    }

    applyRuleProfileToDecision(playbackState, context, decision, activeProfile, safeRandom);

    const allowed = finalizeRuleDecision(safeRandom, decision);
    recordRuleDecisionDebug(plan, decision);

    return {
      allowed,
      context,
      decision,
      profile: activeProfile
    };
  }
  function createGlobalInclusionState() {
    return {
      decisions: new Map(),
      debug: []
    };
  }

  function getGlobalInclusionId(kind, key) {
    return `${normalizeRuleDecisionToken(kind)}:${String(key || "")}`;
  }

  function hasGlobalInclusionDecision(globalInclusionState, kind, key) {
    if (!globalInclusionState) return false;
    return globalInclusionState.decisions.has(getGlobalInclusionId(kind, key));
  }

  function getGlobalInclusionDecision(globalInclusionState, kind, key) {
    if (!globalInclusionState) return null;
    return globalInclusionState.decisions.get(getGlobalInclusionId(kind, key)) || null;
  }

  function setGlobalInclusionDecision(globalInclusionState, decision) {
    if (!globalInclusionState || !decision) return decision;

    const id = decision.id || getGlobalInclusionId(decision.kind, decision.key);
    const storedDecision = {
      ...decision,
      id
    };

    globalInclusionState.decisions.set(id, storedDecision);
    globalInclusionState.debug.push({ ...storedDecision });

    return storedDecision;
  }

  function resolveGlobalInclusionDecision({
    random,
    globalInclusionState,
    kind = "audio",
    key = "",
    entry = null,
    pattern = null,
    profile = null,
    fallbackChance = 0
  } = {}) {
    const itemKey = getRuleDecisionItemKey({ key, entry, pattern });
    const id = getGlobalInclusionId(kind, itemKey);

    if (globalInclusionState?.decisions?.has(id)) {
      return globalInclusionState.decisions.get(id);
    }

    const safeRandom = typeof random === "function" ? random : (() => 1);
    const activeProfile = profile || (
      kind === "midi"
        ? getRuleProfileForMidiPattern(pattern)
        : getRuleProfileForEntry(entry)
    );

    const globalChance = getGlobalInclusionChance(activeProfile, fallbackChance);
    const roll = safeRandom();
    const included = roll < globalChance;

    return setGlobalInclusionDecision(globalInclusionState, {
      id,
      kind,
      key: itemKey,
      included,
      globalChance,
      roll,
      profileSummary: {
        family: entry?.family || pattern?.id || "",
        tags: entry?.tags || (kind === "midi" ? ["midi"] : [])
      }
    });
  }

  function writeGlobalInclusionDebugToPlan(plan, globalInclusionState) {
    if (!plan || !globalInclusionState) return plan;

    plan.globalInclusionDebug = globalInclusionState.debug.map(item => ({ ...item }));

    return plan;
  }
  function createRequiredActivationState() {
    return {
      obligations: new Map(),
      debug: []
    };
  }

  function getRequiredActivationId(kind, key) {
    return `${normalizeRuleDecisionToken(kind)}:${String(key || "")}`;
  }

  function addRequiredActivationObligation(requiredActivationState, {
    kind = "audio",
    key = "",
    family = "",
    tag = "",
    reason = "",
    minActivations = 1,
    maxActivations = null,
    allowedSectionTypes = [],
    forbiddenSectionTypes = []
  } = {}) {
    if (!requiredActivationState) return null;

    const id = getRequiredActivationId(kind, key || family || tag);

    const obligation = {
      id,
      kind: normalizeRuleDecisionToken(kind),
      key: String(key || ""),
      family: normalizeRuleDecisionToken(family),
      tag: normalizeRuleDecisionToken(tag),
      reason: String(reason || "required_activation"),
      minActivations: Math.max(0, Number(minActivations) || 0),
      maxActivations: Number.isFinite(Number(maxActivations)) ? Math.max(0, Number(maxActivations)) : null,
      activationCount: 0,
      allowedSectionTypes: Array.isArray(allowedSectionTypes)
        ? allowedSectionTypes.map(type => normalizeRuleDecisionToken(type)).filter(Boolean)
        : [],
      forbiddenSectionTypes: Array.isArray(forbiddenSectionTypes)
        ? forbiddenSectionTypes.map(type => normalizeRuleDecisionToken(type)).filter(Boolean)
        : [],
      fulfilled: false
    };

    requiredActivationState.obligations.set(id, obligation);
    requiredActivationState.debug.push({
      action: "add",
      ...obligation
    });

    return obligation;
  }

  function getMatchingRequiredActivationObligations(requiredActivationState, context) {
    if (!requiredActivationState || !context) return [];

    const sectionType = normalizeRuleDecisionToken(context.sectionType);
    const itemTags = context.itemTags || new Set();

    return [...requiredActivationState.obligations.values()].filter(obligation => {
      if (obligation.fulfilled) return false;
      if (obligation.kind && obligation.kind !== normalizeRuleDecisionToken(context.kind)) return false;
      if (obligation.key && obligation.key !== context.itemKey) return false;
      if (obligation.family) {
        const familyTag = `family:${obligation.family}`;
        if (!itemTags.has(familyTag) && !itemTags.has(obligation.family)) return false;
      }
      if (obligation.tag && !itemTags.has(obligation.tag)) return false;
      if (obligation.allowedSectionTypes.length && !obligation.allowedSectionTypes.includes(sectionType)) return false;
      if (obligation.forbiddenSectionTypes.includes(sectionType)) return false;

      return true;
    });
  }

  function markRequiredActivationSatisfied(requiredActivationState, context) {
    const obligations = getMatchingRequiredActivationObligations(requiredActivationState, context);

    for (const obligation of obligations) {
      obligation.activationCount += 1;

      if (obligation.activationCount >= obligation.minActivations) {
        obligation.fulfilled = true;
      }

      requiredActivationState.debug.push({
        action: "activate",
        id: obligation.id,
        activationCount: obligation.activationCount,
        fulfilled: obligation.fulfilled,
        itemKey: context.itemKey,
        sectionId: context.sectionId
      });
    }

    return obligations;
  }

  function getUnfulfilledRequiredActivations(requiredActivationState) {
    if (!requiredActivationState) return [];

    return [...requiredActivationState.obligations.values()]
      .filter(obligation => !obligation.fulfilled);
  }

  function writeRequiredActivationDebugToPlan(plan, requiredActivationState) {
    if (!plan || !requiredActivationState) return plan;

    plan.requiredActivationDebug = {
      obligations: [...requiredActivationState.obligations.values()].map(item => ({ ...item })),
      events: requiredActivationState.debug.map(item => ({ ...item })),
      unfulfilled: getUnfulfilledRequiredActivations(requiredActivationState).map(item => ({ ...item }))
    };

    return plan;
  }
  function getRequiredActivationRules(profile) {
    return getRuleArray(profile, [
      "requiredActivations",
      "requiredActivationRules",
      "requiredActivation",
      "mustActivate",
      "mustAppear",
      "activationObligations"
    ]);
  }

  function normalizeRequiredActivationRule(rule, {
    kind = "audio",
    key = "",
    entry = null,
    pattern = null
  } = {}) {
    const target = normalizeRuleTargetFilter(rule?.target || rule || {});
    const itemKey = getRuleDecisionItemKey({ key, entry, pattern });

    return {
      kind: normalizeRuleDecisionToken(rule?.kind || target.kind || kind),
      key: String(rule?.key || rule?.file || target.key || itemKey || ""),
      family: normalizeRuleDecisionToken(rule?.family || rule?.group || target.family || entry?.family || pattern?.id || ""),
      tag: normalizeRuleDecisionToken(rule?.tag || target.tag || ""),
      reason: String(rule?.reason || rule?.id || "required_activation_rule"),
      minActivations: Math.max(1, Number(rule?.minActivations ?? rule?.minimum ?? 1) || 1),
      maxActivations: Number.isFinite(Number(rule?.maxActivations ?? rule?.maximum))
        ? Math.max(0, Number(rule.maxActivations ?? rule.maximum))
        : null,
      allowedSectionTypes: Array.isArray(rule?.allowedSectionTypes || rule?.allowedSections)
        ? (rule.allowedSectionTypes || rule.allowedSections)
        : [],
      forbiddenSectionTypes: Array.isArray(rule?.forbiddenSectionTypes || rule?.forbiddenSections)
        ? (rule.forbiddenSectionTypes || rule.forbiddenSections)
        : []
    };
  }

  function addRequiredActivationRulesFromProfile(requiredActivationState, {
    kind = "audio",
    key = "",
    entry = null,
    pattern = null,
    profile = null
  } = {}) {
    if (!requiredActivationState) return [];

    const activeProfile = profile || (
      kind === "midi"
        ? getRuleProfileForMidiPattern(pattern)
        : getRuleProfileForEntry(entry)
    );

    const rules = getRequiredActivationRules(activeProfile);
    const obligations = [];

    for (const rule of rules) {
      const normalized = normalizeRequiredActivationRule(rule, {
        kind,
        key,
        entry,
        pattern
      });

      const obligation = addRequiredActivationObligation(requiredActivationState, normalized);

      if (obligation) {
        obligations.push(obligation);
      }
    }

    return obligations;
  }
  function applyLifecycleDropoutToDecision(random, lifecycleStates, context, decision, profile = {}) {
    if (!lifecycleStates || !context || !decision || !context.lifecycleId) {
      return decision;
    }

    const dropoutConfig = getDropoutRuleConfig(profile);

    if (dropoutConfig.baseChance <= 0 && dropoutConfig.increasePerActivation <= 0) {
      return decision;
    }

    const state = getLifecycleState(lifecycleStates, context.lifecycleId);

    if (!state.activated) {
      return decision;
    }

    const dropoutChance = calculateLifecycleDropoutChance(state, dropoutConfig);

    if (chance(random, dropoutChance)) {
      dropoutLifecycleItem(lifecycleStates, context.lifecycleId);

      return markRuleDecisionDropout(decision, "lifecycle_dropout", {
        lifecycleId: context.lifecycleId,
        dropoutChance,
        activationCount: state.activationCount,
        dropoutCount: state.dropoutCount
      });
    }

    addRuleDecisionReason(decision, "lifecycle_dropout_survived", {
      lifecycleId: context.lifecycleId,
      dropoutChance,
      activationCount: state.activationCount,
      dropoutCount: state.dropoutCount
    });

    return decision;
  }
  function getSectionEnergyContext(section = {}) {
    const densityScore = Number(section.densityScore ?? section.density ?? 0);

    return {
      densityScore,
      densityBand: String(section.densityBand || section.densityLevel || getDensityBandFromScore(densityScore)),
      tensionValue: Number(section.tensionValue ?? section.tension ?? 0),
      tensionBand: String(section.tensionBand || section.tensionLevel || ""),
      isCrescendo: Boolean(section.isCrescendo || section.crescendo),
      isEmphasis: Boolean(section.isEmphasis || section.emphasis),
      sectionType: String(section.type || ""),
      sectionId: String(section.id || "")
    };
  }

  function getDensityBandFromScore(score) {
    const value = Number(score) || 0;

    if (value <= 3) return "low";
    if (value <= 6) return "medium";
    return "high";
  }

  function attachSectionEnergyContext(section, energy = {}) {
    if (!section) return section;

    const densityScore = Number(energy.densityScore ?? section.densityScore ?? 0);
    const tensionValue = Number(energy.tensionValue ?? section.tensionValue ?? 0);

    section.densityScore = densityScore;
    section.densityBand = String(energy.densityBand || section.densityBand || getDensityBandFromScore(densityScore));
    section.tensionValue = tensionValue;
    section.tensionBand = String(energy.tensionBand || section.tensionBand || "");
    section.isCrescendo = Boolean(energy.isCrescendo ?? section.isCrescendo ?? false);
    section.isEmphasis = Boolean(energy.isEmphasis ?? section.isEmphasis ?? false);

    return section;
  }

  function getEnergyRuleMultiplier(rule, energyContext) {
    if (!rule || !energyContext) return 1;

    if (rule.densityBand && String(rule.densityBand) !== energyContext.densityBand) return 1;
    if (rule.tensionBand && String(rule.tensionBand) !== energyContext.tensionBand) return 1;

    if (Number.isFinite(Number(rule.minDensity)) && energyContext.densityScore < Number(rule.minDensity)) return 1;
    if (Number.isFinite(Number(rule.maxDensity)) && energyContext.densityScore > Number(rule.maxDensity)) return 1;
    if (Number.isFinite(Number(rule.minTension)) && energyContext.tensionValue < Number(rule.minTension)) return 1;
    if (Number.isFinite(Number(rule.maxTension)) && energyContext.tensionValue > Number(rule.maxTension)) return 1;

    if (rule.requiresCrescendo && !energyContext.isCrescendo) return 1;
    if (rule.requiresEmphasis && !energyContext.isEmphasis) return 1;

    const multiplier = Number(rule.multiplier ?? rule.chanceMultiplier ?? rule.activationMultiplier ?? 1);

    return Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
  }
  function applyEnergyRulesToDecision(context, decision, rules = [], reasonCode = "energy_multiplier") {
    if (!context || !decision || !Array.isArray(rules)) return decision;

    const energyContext = getSectionEnergyContext(context.section);

    for (const rule of rules) {
      const multiplier = getEnergyRuleMultiplier(rule, energyContext);

      if (multiplier !== 1) {
        multiplyRuleDecisionChance(decision, multiplier, reasonCode, {
          ruleId: rule.id || "",
          energyContext
        });
      }
    }

    return decision;
  }

  function applyDensityRulesToDecision(context, decision, profile = {}) {
    return applyEnergyRulesToDecision(
      context,
      decision,
      getDensityRules(profile),
      "density_multiplier"
    );
  }

  function applyTensionRulesToDecision(context, decision, profile = {}) {
    return applyEnergyRulesToDecision(
      context,
      decision,
      getTensionRules(profile),
      "tension_multiplier"
    );
  }

  function applyCrescendoRulesToDecision(context, decision, profile = {}) {
    return applyEnergyRulesToDecision(
      context,
      decision,
      getCrescendoRules(profile),
      "crescendo_multiplier"
    );
  }
  function includeAudioByGlobalDecision({
    random,
    globalInclusionState = null,
    requiredActivationState = null,
    selectedAudio = null,
    key = "",
    entry = null,
    fallbackChance = 0,
    force = false,
    reason = ""
  } = {}) {
    if (!selectedAudio) return false;

    const activeEntry = entry || getCatalogEntry(key);
    if (!activeEntry?.key) return false;

    const profile = getRuleProfileForEntry(activeEntry);

    const decision = force
      ? setGlobalInclusionDecision(globalInclusionState, {
          kind: "audio",
          key: activeEntry.key,
          included: true,
          globalChance: 1,
          roll: 0,
          forced: true,
          reason: reason || "forced_global_selection",
          profileSummary: {
            family: activeEntry.family || "",
            tags: activeEntry.tags || []
          }
        })
      : resolveGlobalInclusionDecision({
          random,
          globalInclusionState,
          kind: "audio",
          key: activeEntry.key,
          entry: activeEntry,
          profile,
          fallbackChance
        });

    if (!decision?.included) return false;

    selectedAudio.add(activeEntry.key);

    addRequiredActivationRulesFromProfile(requiredActivationState, {
      kind: "audio",
      key: activeEntry.key,
      entry: activeEntry,
      profile
    });

    return true;
  }

  function includeMidiByGlobalDecision({
    random,
    globalInclusionState = null,
    requiredActivationState = null,
    selectedMidi = null,
    pattern = null,
    fallbackChance = 0,
    force = false,
    reason = ""
  } = {}) {
    if (!selectedMidi || !pattern?.file) return false;

    const profile = getRuleProfileForMidiPattern(pattern);

    const decision = force
      ? setGlobalInclusionDecision(globalInclusionState, {
          kind: "midi",
          key: pattern.file,
          included: true,
          globalChance: 1,
          roll: 0,
          forced: true,
          reason: reason || "forced_global_selection",
          profileSummary: {
            family: pattern.id || "",
            tags: ["midi"]
          }
        })
      : resolveGlobalInclusionDecision({
          random,
          globalInclusionState,
          kind: "midi",
          key: pattern.file,
          pattern,
          profile,
          fallbackChance
        });

    if (!decision?.included) return false;

    selectedMidi.add(pattern.file);

    addRequiredActivationRulesFromProfile(requiredActivationState, {
      kind: "midi",
      key: pattern.file,
      pattern,
      profile
    });

    return true;
  }
  function forceIncludeAudioSelection({
    random,
    globalInclusionState = null,
    requiredActivationState = null,
    selectedAudio = null,
    key = "",
    reason = ""
  } = {}) {
    const entry = getCatalogEntry(key);
    if (!entry) return false;

    return includeAudioByGlobalDecision({
      random,
      globalInclusionState,
      requiredActivationState,
      selectedAudio,
      key,
      entry,
      fallbackChance: 1,
      force: true,
      reason
    });
  }
  function shuffle(random, items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  async function loadJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return await response.json();
  }

  function toAssetUrl(path) {
    const encodedPath = path
      .split("/")
      .map(part => encodeURIComponent(part))
      .join("/");

    return `${rules.r2BaseUrl}/${encodedPath}`;
  }

  function applyRandomColourScheme() {
    const random = mulberry32(currentSeed);
    const scheme = chooseOne(random, rules.colourSchemes);

    document.documentElement.style.setProperty("--bg", scheme.background);
    document.documentElement.style.setProperty("--text", scheme.text);
    document.documentElement.style.setProperty("--button-bg", scheme.buttonBackground);
    document.documentElement.style.setProperty("--button-text", scheme.buttonText);
    document.documentElement.style.setProperty("--button-border", scheme.buttonBorder);
    document.documentElement.style.setProperty("--border-width", scheme.buttonBorderWidth);

    setStatus(`READY / SEED ${currentSeed} / ${scheme.name} / FULL BUILD`);
  }

  function getCatalogEntry(key) {
    return catalog.entriesByKey.get(key);
  }

  function entryHas(entry, text) {
    return entry.key.toLowerCase().includes(text.toLowerCase());
  }

  function isAudio(entry) {
    return entry.type === "audio";
  }

  function isMidi(entry) {
    return entry.type === "midi";
  }

  function isMidiSample(entry) {
    return entry.key.startsWith("midi files/samples/");
  }

  function isLikelyOneShot(entry) {
    const key = entry.key.toLowerCase();
    return (
      key.includes("crash") ||
      key.includes("snare") ||
      key.includes("rim") ||
      key.includes("kick") ||
      key.includes("beepipe") ||
      key.includes("typewriter") ||
      key.includes("rewind") ||
      key.includes("airhorn") ||
      key.includes("sfx")
    );
  }

  function isLyrix(entry) {
    return entry.folder === "lyrix" || entry.key.toLowerCase().includes("lyrix");
  }

  function isTrueBass(entry) {
    const key = entry.key.toLowerCase();
    return (
      key.includes("real_bass") ||
      key.includes("synth_bass") ||
      key.includes("nuva_bass") ||
      key.includes("grm_main_bass") ||
      key.includes("drop_bass")
    );
  }

  function isDrumMidiPattern(pattern) {
    const key = pattern.file.toLowerCase();
    return (
      key.includes("hats") ||
      key.includes("snare") ||
      key.includes("rims") ||
      key.includes("beepipes") ||
      key.includes("crash") ||
      key.includes("ride")
    );
  }

  function getMidiPatternRuleFamily(pattern) {
    const entry = getMidiPatternRuleEntry(pattern);
    return normalizeRuleDecisionToken(entry?.family || pattern?.id || pattern?.file || "");
  }

  function getMidiPatternRuleTags(pattern) {
    const entry = getMidiPatternRuleEntry(pattern);
    return new Set((entry?.tags || []).map(tag => normalizeRuleDecisionToken(tag)));
  }

  function getMidiPatternBaseId(pattern) {
    let base = String(pattern?.id || pattern?.file || "").replace(/\.mid$/i, "");

    const sampleSuffixes = [
      "ridehard",
      "ride04",
      "ride03",
      "beepipe",
      "crash",
      "snare",
      "jump",
      "done",
      "coin",
      "rim",
      "arp",
      "ch",
      "oh"
    ];

    for (const suffix of sampleSuffixes) {
      const ending = `_${suffix}`;
      if (base.endsWith(ending)) {
        return base.slice(0, -ending.length);
      }
    }

    return base;
  }

  function isJazzMidiHatPattern(pattern) {
    const family = getMidiPatternRuleFamily(pattern);
    const tags = getMidiPatternRuleTags(pattern);
    const key = String(pattern?.file || pattern?.id || "").toLowerCase();

    return (
      family === "jazz_hats" ||
      family === "jazz_rides" ||
      family === "jazz_ghost_rides" ||
      tags.has("jazz_hats") ||
      tags.has("jazz_rides") ||
      tags.has("jazz_ghost_rides") ||
      key.includes("jazz_")
    );
  }

  function isNormalMidiHatPattern(pattern) {
    const tags = getMidiPatternRuleTags(pattern);
    const key = String(pattern?.file || pattern?.id || "").toLowerCase();

    return tags.has("hats") && key.includes("hats") && !isJazzMidiHatPattern(pattern);
  }

  function getNormalMidiHatCompanionGroupId(pattern) {
    if (!isNormalMidiHatPattern(pattern)) return "";
    return normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));
  }

  function getNormalMidiHatChoiceGroupId(pattern) {
    if (!isNormalMidiHatPattern(pattern)) return "";

    const base = normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));

    if (base.startsWith("main_hats")) return "main_hats";
    if (base.startsWith("hats_hook_metal")) return "hook_hats";
    if (base.startsWith("hats_wiv_beepipes")) return "hats_wiv_beepipes";
    if (base.startsWith("holdit_hats_forlyrix")) return "holdit_hats_forlyrix";
    if (base.startsWith("holdit_hats")) return "holdit_hats";
    if (base.startsWith("lego_hats")) return "lego_hats";
    if (base.startsWith("messy_hats_fast_ends_in_main_hats")) return "messy_hats_fast_ends_in_main_hats";
    if (base.startsWith("messy_hats_fast")) return "messy_hats_fast";
    if (base.startsWith("messy_hats")) return "messy_hats";
    if (base.startsWith("speedy_hats")) return "speedy_hats";
    if (base.startsWith("trap_hats")) return "trap_hats";

    return base;
  }

  function getBaseActivationChance(entry) {
    const key = entry.key.toLowerCase();

    if (isMidiSample(entry)) return 0;
    if (entry.folder === "alternate downloads") return 0.005;

    if (key.includes("everything_intro")) return 0.01;
    if (key.includes("drop_")) return 0.1;
    if (key.includes("grm_")) return 0.08;
    if (key.includes("outburst")) return 0.08;

    if (isLyrix(entry)) return 0.08;
    if (isTrueBass(entry)) return 0.35;

    if (key.includes("synth")) return 0.35;
    if (key.includes("pad")) return 0.12;
    if (key.includes("vlins")) return 0.2;
    if (key.includes("glock")) return 0.08;
    if (key.includes("chimes")) return 0.12;
    if (key.includes("bagoo")) return 0.15;
    if (key.includes("floot")) return 0.15;
    if (key.includes("tbone")) return 0.18;
    if (key.includes("trumpet")) return 0.12;
    if (key.includes("accordian")) return 0.14;
    if (key.includes("cello")) return 0.14;
    if (key.includes("vox")) return 0.12;

    if (isLikelyOneShot(entry)) return 0.08;

    return 0.12;
  }

  function expandSelectedWetDryPairs(selectedAudio, random, globalInclusionState, requiredActivationState) {
    const wetDryPairs = catalog?.groups?.wetDryPairs || {};

    for (const pairName of Object.keys(wetDryPairs)) {
      const pair = wetDryPairs[pairName];
      const dryKeys = Array.isArray(pair.dry) ? pair.dry : [];
      const wetKeys = Array.isArray(pair.wet) ? pair.wet : [];
      const allPairKeys = [...dryKeys, ...wetKeys];

      const anySelected = allPairKeys.some(key => selectedAudio.has(key));

      if (anySelected) {
        for (const key of allPairKeys) {
          if (getCatalogEntry(key)) {
            forceIncludeAudioSelection({
              random,
              globalInclusionState,
              requiredActivationState,
              selectedAudio,
              key,
              reason: `forced_wet_dry_pair:${pairName}`
            });
          }
        }
      }
    }
  }

    function buildFullPlan(random) {
    const duration = Math.max(180, rules.songLengthSeconds || 180);

    const mainBpm = catalog.rulePools.timing.mainBpm;
    const grimeyBpm = catalog.rulePools.timing.grimeyBpm;

    const mainBeatSeconds = 60 / mainBpm;
    const mainBarSeconds = mainBeatSeconds * 4;

    const grimeyBeatSeconds = 60 / grimeyBpm;
    const grimeyBarSeconds = grimeyBeatSeconds * 4;

    const selectedAudio = new Set();
    const selectedMidi = new Set();

    const lifecycleStates = new Map();

    const globalInclusionState = createGlobalInclusionState();
    const requiredActivationState = createRequiredActivationState();

    const sectionTimeline = [];
    const resetPoints = [];
    const lyrixSectionUsage = new Map();
    const includedBridgeLyrixSections = selectIncludedBridgeLyrixSections(random);

    let cursorSeconds = 0;
    let cursorBars = 0;
    let currentGrid = {
      bpm: mainBpm,
      beatSeconds: mainBeatSeconds,
      barSeconds: mainBarSeconds,
      gridAnchorSeconds: 0,
      name: "main_56"
    };

    function addSection(type, bars, options = {}) {
      const startSeconds = cursorSeconds;
      const barSeconds = currentGrid.barSeconds;
      const durationSeconds = bars * barSeconds;
      const endSeconds = startSeconds + durationSeconds;

      const section = {
        id: `${sectionTimeline.length + 1}_${type}`,
        type,
        startSeconds,
        endSeconds,
        durationSeconds,
        bars,
        trackStartBar: cursorBars + 1,
        trackEndBar: cursorBars + bars,
        bpm: currentGrid.bpm,
        barSeconds,
        gridAnchorSeconds: currentGrid.gridAnchorSeconds,
        reset: Boolean(options.reset),
        tags: options.tags || [],
        lyrixSectionId: options.lyrixSectionId || null,
        lyrixSection: options.lyrixSection || null,
        lyrixActivationNumber: options.lyrixActivationNumber || 0,
        suppressLyrixLeadIn: Boolean(options.suppressLyrixLeadIn)
      };

      attachSectionEnergyContext(section);

      sectionTimeline.push(section);

      if (section.reset) {
        resetPoints.push({
          timeSeconds: startSeconds,
          reason: `${type}_section_start`
        });
      }

      cursorSeconds = endSeconds;
      cursorBars += bars;
      return section;
    }

    function enterGrimey() {
      currentGrid = {
        bpm: grimeyBpm,
        beatSeconds: grimeyBeatSeconds,
        barSeconds: grimeyBarSeconds,
        gridAnchorSeconds: cursorSeconds,
        name: "grimey_70"
      };
    }

    function exitGrimeyToNewMainGrid() {
      currentGrid = {
        bpm: mainBpm,
        beatSeconds: mainBeatSeconds,
        barSeconds: mainBarSeconds,
        gridAnchorSeconds: cursorSeconds,
        name: "main_56_after_grimey"
      };

      resetPoints.push({
        timeSeconds: cursorSeconds,
        reason: "grimey_exit_new_56_grid"
      });
    }

    // Intro / opening normal section.
    addSection("normal", 8, { reset: true, tags: ["opening"] });
    // everything_intro is rare but explicit.
    if (chance(random, catalog.rulePools.everythingIntro.globalInclusionChance ?? 0.01)) {
      const everythingIntroCandidates = catalog.rulePools.everythingIntro.candidates || [];
      const everythingIntro = chooseOne(random, everythingIntroCandidates);

      if (everythingIntro) {
        forceIncludeAudioSelection({
          random,
          globalInclusionState,
          requiredActivationState,
          selectedAudio,
          key: everythingIntro,
          reason: "forced_everything_intro_candidate"
        });
      }

      for (const ah of catalog.rulePools.everythingIntro.ahMains) {
        forceIncludeAudioSelection({
          random,
          globalInclusionState,
          requiredActivationState,
          selectedAudio,
          key: ah,
          reason: "forced_everything_intro_ah_main"
        });
      }

      if (catalog.rulePools.everythingIntro.crash) {
        forceIncludeAudioSelection({
          random,
          globalInclusionState,
          requiredActivationState,
          selectedAudio,
          key: catalog.rulePools.everythingIntro.crash,
          reason: "forced_everything_intro_crash"
        });
      }

      addSection("everything_intro", 8, {
        reset: true,
        tags: ["intro", "rare"]
      });
    }

    // Main body: build a section timeline instead of dumping everything randomly.
    while (cursorSeconds < duration - mainBarSeconds * 8) {
      const roll = random();

      if (roll < 0.08) {
        addSection("hook", 8, {
          reset: true,
          tags: ["hook"]
        });
        continue;
      }

      if (roll < 0.18) {
        const lyrixSection = chooseFirstPassLyrixSection(random, lyrixSectionUsage);

        if (lyrixSection) {
          console.log("[first-pass lyrix selected]", lyrixSection.id);
          const lyrixActivationNumber = (lyrixSectionUsage.get(lyrixSection.id) || 0) + 1;
          lyrixSectionUsage.set(lyrixSection.id, lyrixActivationNumber);

          if (canBridgePlayBeforeLyrixSection(lyrixSection)) {
            const bridgeLyrixSection = chooseBridgeLyrixSection(random, includedBridgeLyrixSections, lyrixSectionUsage);

            if (bridgeLyrixSection) {
              const bridgeLeadInBars = chooseSafeBridgeLeadInBars(random, lyrixSection);

              if (bridgeLeadInBars !== null) {
                console.log("[bridge lyrix selected]", bridgeLyrixSection.id, "before", lyrixSection.id);
                const bridgeActivationNumber = (lyrixSectionUsage.get(bridgeLyrixSection.id) || 0) + 1;
                const bridgeLengthBars = getLyrixSectionLengthBars(bridgeLyrixSection);
                const bridgeGapBars = Math.max(0, bridgeLeadInBars - bridgeLengthBars);

                lyrixSectionUsage.set(bridgeLyrixSection.id, bridgeActivationNumber);

                addSection("lyrix", bridgeLengthBars, {
                  reset: false,
                  tags: ["lyrix", "bridge_lyrix"],
                  lyrixSectionId: bridgeLyrixSection.id,
                  lyrixSection: bridgeLyrixSection,
                  lyrixActivationNumber: bridgeActivationNumber
                });

                for (const key of getLyrixSectionAudioFiles(bridgeLyrixSection)) {
                  forceIncludeAudioSelection({
                    random,
                    globalInclusionState,
                    requiredActivationState,
                    selectedAudio,
                    key,
                    reason: "forced_bridge_lyrix_section"
                  });
                }

                if (bridgeGapBars > 0) {
                  addSection("normal", bridgeGapBars, {
                    reset: false,
                    tags: ["normal", "bridge_gap"]
                  });
                }
              }
            }
          }
          addSection("lyrix", getLyrixSectionLengthBars(lyrixSection), {
            reset: true,
            tags: ["lyrix", "lyrix_rules_first_pass"],
            lyrixSectionId: lyrixSection.id,
            lyrixSection,
            lyrixActivationNumber
          });

          for (const key of getLyrixSectionAudioFiles(lyrixSection)) {
            forceIncludeAudioSelection({
              random,
              globalInclusionState,
              requiredActivationState,
              selectedAudio,
              key,
              reason: "forced_lyrix_section"
            });
          }


          if (lyrixSection.repeatImmediatelyChance && chance(random, Number(lyrixSection.repeatImmediatelyChance) || 0)) {
            const repeatCountsAsSeparateOccasion = lyrixSection.repeatCountsAsSeparateOccasion !== false;
            const currentUsage = lyrixSectionUsage.get(lyrixSection.id) || 0;
            const maxOccasions = Number(lyrixSection.maxSeparateOccasions) || Infinity;

            if (!repeatCountsAsSeparateOccasion || currentUsage < maxOccasions) {
              const repeatActivationNumber = repeatCountsAsSeparateOccasion ? currentUsage + 1 : currentUsage;

              if (repeatCountsAsSeparateOccasion) {
                lyrixSectionUsage.set(lyrixSection.id, repeatActivationNumber);
              }

              addSection("lyrix", getLyrixSectionLengthBars(lyrixSection), {
                reset: true,
                tags: ["lyrix", "lyrix_rules_first_pass", "repeat_immediate"],
                lyrixSectionId: lyrixSection.id,
                lyrixSection,
                lyrixActivationNumber: repeatActivationNumber,
                suppressLyrixLeadIn: true
              });

              for (const key of getLyrixSectionAudioFiles(lyrixSection)) {
                forceIncludeAudioSelection({
                  random,
                  globalInclusionState,
                  requiredActivationState,
                  selectedAudio,
                  key,
                  reason: "forced_lyrix_section_repeat_immediate"
                });
              }
            }
          }
          continue;
        }

        addSection("normal", 8, {
          reset: false,
          tags: ["normal", "lyrix_roll_no_first_pass_choice"]
        });
        continue;
      }

      if (roll < 0.23 && chance(random, catalog.rulePools.drop.globalInclusionChance ?? 0.1)) {
        addSection("drop", 4, {
          reset: true,
          tags: ["drop", "major_reset"]
        });

        for (const key of catalog.rulePools.drop.files) {
          forceIncludeAudioSelection({
            random,
            globalInclusionState,
            requiredActivationState,
            selectedAudio,
            key,
            reason: "forced_drop_section"
          });
        }
        continue;
      }

      if (roll < 0.28) {
        addSection("outburst_intro", 4, {
          reset: true,
          tags: ["outburst", "major_reset"]
        });

        addSection("outburst_main", 8, {
          reset: false,
          tags: ["outburst"]
        });

        for (const key of catalog.rulePools.outburst.files) {
          forceIncludeAudioSelection({
            random,
            globalInclusionState,
            requiredActivationState,
            selectedAudio,
            key,
            reason: "forced_outburst_section"
          });
        }
        continue;
      }

      if (roll < 0.34) {
        addSection("grimey_entry", 2, {
          reset: true,
          tags: ["grimey", "major_reset"]
        });

        enterGrimey();

        addSection("grimey", 8, {
          reset: false,
          tags: ["grimey", "tempo_70"]
        });

        exitGrimeyToNewMainGrid();

        for (const key of catalog.rulePools.grimey.files) {
          forceIncludeAudioSelection({
            random,
            globalInclusionState,
            requiredActivationState,
            selectedAudio,
            key,
            reason: "forced_grimey_section"
          });
        }
        continue;
      }

      addSection("normal", 8, {
        reset: false,
        tags: ["normal"]
      });
    }

    addSection("ending", 8, {
      reset: true,
      tags: ["ending"]
    });

    const audioEntries = catalog.entries.filter(entry => isAudio(entry) && !isMidiSample(entry));
    const midiPatternPool = midiPatterns.patterns.filter(isDrumMidiPattern);

    // Keep important foundations available.
    const foundationCandidates = [
      "samples/synth_main_odd (consolidated).wav",
      "samples/synth_bass_odd_x2 (consolidated).wav",
      "samples/crash_metal_odd_metal (consolidated).wav"
    ];

    for (const key of foundationCandidates) {
      const entry = getCatalogEntry(key);

      includeAudioByGlobalDecision({
        random,
        globalInclusionState,
        requiredActivationState,
        selectedAudio,
        key,
        entry,
        fallbackChance: 0.65,
        reason: "foundation_candidate"
      });
    }

    // Select section-relevant audio instead of selecting everything equally.
    for (const section of sectionTimeline) {
      const matchingEntries = audioEntries.filter(entry => {
        const key = entry.key.toLowerCase();

        const hookSection = isHookSection(section);
        const hookKey = isHookKey(entry.key);
        const allowNonHookInHook = key.includes("window_wipe");

        if (hookKey && !hookSection) return false;
        if (hookSection && !hookKey && !allowNonHookInHook) return false;

        if (hookSection) return true;
        if (section.type.includes("lyrix")) {
          if (section.lyrixSectionId) return false;
          return isLyrix(entry);
        }
        if (section.type.includes("drop")) return key.includes("drop_") || key.includes("dropped_");
        if (section.type.includes("outburst")) return key.includes("outburst");
        if (section.type.includes("grimey")) return key.includes("grm_") || key.includes("rewind_sfx");

        return (
          key.includes("synth") ||
          key.includes("bass") ||
          key.includes("pad") ||
          key.includes("chimes") ||
          key.includes("glock") ||
          key.includes("bagoo") ||
          key.includes("floot") ||
          key.includes("vlins") ||
          key.includes("vox")
        );
      });

      const shuffled = shuffle(random, matchingEntries);

      for (const entry of shuffled.slice(0, 12)) {
        const chanceMultiplier = section.type === "normal" ? 0.65 : 1.0;
        const p = Math.min(0.9, getBaseActivationChance(entry) * chanceMultiplier);

        includeAudioByGlobalDecision({
          random,
          globalInclusionState,
          requiredActivationState,
          selectedAudio,
          entry,
          fallbackChance: p,
          reason: `section_selection:${section.type}`
        });
      }
    }

    // MIDI pattern selection by section.
    for (const section of sectionTimeline) {
      const sectionSelectedMidi = new Set();
      const sectionMidi = midiPatternPool.filter(pattern => {
        const key = pattern.file.toLowerCase();

        const hookSection = isHookSection(section);
        const hookKey = isHookKey(pattern.file);

        if (hookKey && !hookSection) return false;
        if (hookSection && !hookKey) return false;

        if (hookSection) return true;
        if (section.type.includes("grimey")) return key.includes("hats") || key.includes("snare") || key.includes("rims");
        if (section.type.includes("drop")) return key.includes("crash") || key.includes("snare");
        if (section.type.includes("outburst")) return key.includes("crash") || key.includes("hats");
        return key.includes("main_hats") || key.includes("snare") || key.includes("rims") || key.includes("hats");
      });

      const normalHatGroupsByChoice = new Map();
      const nonNormalMidi = [];

      for (const pattern of sectionMidi) {
        if (!isNormalMidiHatPattern(pattern)) {
          nonNormalMidi.push(pattern);
          continue;
        }

        const baseId = normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));

        // messy_hats_addin is a progressive add-in system, not a normal hat choice.
        if (baseId.startsWith("messy_hats_addin")) {
          continue;
        }

        const choiceGroupId = getNormalMidiHatChoiceGroupId(pattern);
        const companionGroupId = getNormalMidiHatCompanionGroupId(pattern);

        if (!choiceGroupId || !companionGroupId) {
          nonNormalMidi.push(pattern);
          continue;
        }

        if (!normalHatGroupsByChoice.has(choiceGroupId)) {
          normalHatGroupsByChoice.set(choiceGroupId, new Map());
        }

        const companionGroups = normalHatGroupsByChoice.get(choiceGroupId);

        if (!companionGroups.has(companionGroupId)) {
          companionGroups.set(companionGroupId, []);
        }

        companionGroups.get(companionGroupId).push(pattern);
      }

      const normalHatChoiceWeights = new Map([
        ["trap_hats", 2],
        ["holdit_hats", 2],
        ["lego_hats", 4],
        ["main_hats", 40],
        ["messy_hats_fast", 1],
        ["messy_hats", 20],
        ["messy_hats_fast_ends_in_main_hats", 1],
        ["speedy_hats", 30],
        ["hook_hats", 40],
        ["hats_wiv_beepipes", 4],
        ["holdit_hats_forlyrix", 2]
      ]);

      const availableHatChoices = [...normalHatGroupsByChoice.keys()]
        .map(choiceGroupId => ({
          choiceGroupId,
          weight: normalHatChoiceWeights.get(choiceGroupId) || 1
        }))
        .filter(item => item.weight > 0);

      if (availableHatChoices.length) {
        const totalWeight = availableHatChoices.reduce((total, item) => total + item.weight, 0);
        let roll = random() * totalWeight;
        let chosenChoice = availableHatChoices[availableHatChoices.length - 1].choiceGroupId;

        for (const item of availableHatChoices) {
          roll -= item.weight;
          if (roll <= 0) {
            chosenChoice = item.choiceGroupId;
            break;
          }
        }

        const companionGroups = normalHatGroupsByChoice.get(chosenChoice);
        let chosenPatterns = [];

        if (chosenChoice === "main_hats") {
          const mainCh = (companionGroups.get("main_hats_ch_metal") || [])
            .filter(pattern => pattern.file === "midi files/main_hats_ch_metal_ch.mid");

          const mainOhChoices = [
            ...(companionGroups.get("main_hats_oh_metal") || [])
              .filter(pattern => pattern.file === "midi files/main_hats_oh_metal_oh.mid"),
            ...(companionGroups.get("main_hats_oh_cont_metal") || [])
              .filter(pattern => pattern.file === "midi files/main_hats_oh_cont_metal_oh.mid")
          ];

          chosenPatterns = [...mainCh];

          if (mainOhChoices.length && random() >= 0.1) {
            chosenPatterns.push(chooseOne(random, mainOhChoices));
          }

          if (!chosenPatterns.length) {
            chosenPatterns = chooseOne(random, [...companionGroups.values()]) || [];
          }
        } else {
          chosenPatterns = chooseOne(random, [...companionGroups.values()]) || [];
        }

        for (const pattern of chosenPatterns.filter(Boolean)) {
          const included = includeMidiByGlobalDecision({
            random,
            globalInclusionState,
            requiredActivationState,
            selectedMidi,
            pattern,
            fallbackChance: 1,
            force: true,
            reason: `normal_hat_group:${chosenChoice}`
          });

          if (included) {
            sectionSelectedMidi.add(pattern.file);
          }
        }
      }

      const nonNormalLimit = sectionSelectedMidi.size > 0 ? 2 : 3;

      for (const pattern of shuffle(random, nonNormalMidi).slice(0, nonNormalLimit)) {
        let p = 0.35;
        const key = pattern.file.toLowerCase();

        if (key.includes("snare")) p = 0.45;
        if (key.includes("rims")) p = 0.35;
        if (key.includes("hook")) p = 0.45;
        if (key.includes("jazz")) p = 0.18;
        if (key.includes("messy")) p = 0.18;

        const included = includeMidiByGlobalDecision({
          random,
          globalInclusionState,
          requiredActivationState,
          selectedMidi,
          pattern,
          fallbackChance: p,
          reason: `section_selection:${section.type}`
        });

        if (included) {
          sectionSelectedMidi.add(pattern.file);
        }
      }

      section.selectedMidi = [...sectionSelectedMidi];
    }

    if (selectedMidi.size === 0) {
      const fallback = midiPatterns.patterns.find(pattern => pattern.file === "midi files/main_hats_ch_metal_ch.mid");
      if (fallback) {
        const included = includeMidiByGlobalDecision({
          random,
          globalInclusionState,
          requiredActivationState,
          selectedMidi,
          pattern: fallback,
          fallbackChance: 1,
          force: true,
          reason: "forced_midi_fallback"
        });

        if (included) {
          for (const section of sectionTimeline) {
            if (!midiMatchesSection(fallback, section)) continue;
            if (!Array.isArray(section.selectedMidi)) section.selectedMidi = [];
            if (!section.selectedMidi.includes(fallback.file)) {
              section.selectedMidi.push(fallback.file);
            }
          }
        }
      }
    }

    expandSelectedWetDryPairs(selectedAudio, random, globalInclusionState, requiredActivationState);

    for (const key of selectedAudio) {
      const lifecycleId = getAudioLifecycleId(key);
      setLifecycleEligible(lifecycleStates, lifecycleId);
    }

    for (const key of selectedMidi) {
      const lifecycleId = getMidiLifecycleId(key);
      setLifecycleEligible(lifecycleStates, lifecycleId);
    }

    return {
      selectedAudio: [...selectedAudio],
      selectedMidi: [...selectedMidi],
      lifecycleStates: [...lifecycleStates.values()],
      globalInclusionDebug: globalInclusionState.debug.map(item => ({ ...item })),
      requiredActivationDebug: {
        obligations: [...requiredActivationState.obligations.values()].map(item => ({ ...item })),
        events: requiredActivationState.debug.map(item => ({ ...item })),
        unfulfilled: getUnfulfilledRequiredActivations(requiredActivationState).map(item => ({ ...item }))
      },
      sectionTimeline,
      resetPoints
    };
  }

  async function fetchAndDecode(offlineContext, path) {
    const url = toAssetUrl(path);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Audio fetch failed: ${response.status} ${path}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return await offlineContext.decodeAudioData(arrayBuffer);
  }

  function scheduleBuffer(offlineContext, destination, buffer, startTime, gainValue = 1, offset = 0) {
    if (!buffer) return null;
    if (startTime >= offlineContext.length / offlineContext.sampleRate) return null;

    const source = offlineContext.createBufferSource();
    const gain = offlineContext.createGain();

    const safeStartTime = Math.max(0, startTime);
    const safeOffset = Math.max(0, offset);
    const playableDuration = Math.max(0, buffer.duration - safeOffset);

    source.buffer = buffer;
    gain.gain.value = gainValue;

    source.connect(gain);
    gain.connect(destination);

    source.start(safeStartTime, safeOffset);

    return {
      scheduled: true,
      source,
      gainNode: gain,
      buffer,
      startTime: safeStartTime,
      offset: safeOffset,
      duration: playableDuration,
      endTime: safeStartTime + playableDuration,
      gainValue
    };
  }

  function scheduleAudioBufferWithPlaybackState({
    offlineContext,
    destination,
    buffer,
    startTime,
    gainValue = 1,
    offset = 0,
    playbackState = null,
    key = "",
    entry = null,
    section = null,
    family = ""
  } = {}) {
    const scheduleHandle = scheduleBuffer(
      offlineContext,
      destination,
      buffer,
      startTime,
      gainValue,
      offset
    );

    registerScheduledPlaybackHandle(playbackState, {
      kind: "audio",
      key,
      entry,
      scheduleHandle,
      section,
      family
    });

    return scheduleHandle;
  }
  function scheduleMidiPattern({
    offlineContext,
    destination,
    pattern,
    buffers,
    barStart,
    beatSeconds,
    gainValue,
    playbackState = null,
    section = null
  }) {
    const sampleBuffer = buffers.get(pattern.samplePath);
    if (!sampleBuffer) return 0;

    const entry = getMidiPatternRuleEntry(pattern);
    let scheduledCount = 0;

    for (const note of pattern.notes) {
      const start = barStart + note.beats * beatSeconds;
      const velocityGain = Math.max(0.05, note.velocity01 ?? 0.7);
      const scheduled = scheduleBuffer(offlineContext, destination, sampleBuffer, start, gainValue * velocityGain);

      if (scheduled) {
        scheduledCount += 1;

        registerScheduledPlaybackHandle(playbackState, {
          kind: "midi",
          key: pattern.file,
          entry,
          scheduleHandle: scheduled,
          section,
          family: entry?.family || pattern.id || ""
        });
      }
    }

    return scheduledCount;
  }

   function audioMatchesSection(entry, section) {
    const key = entry.key.toLowerCase();
    const type = section.type;

    const hookSection = isHookSection(section);
    const hookKey = isHookKey(entry.key);
    const allowNonHookInHook = key.includes("window_wipe");

    if (hookKey && !hookSection) return false;
    if (hookSection && !hookKey && !allowNonHookInHook) return false;

    if (entry.folder === "alternate downloads") return type === "normal";

    if (key.includes("everything_intro")) return type === "everything_intro";
    if (hookSection) {
      return true;
    }

    if (type.includes("lyrix")) {
      return isLyrix(entry) || key.includes("breathe_vox") || key.includes("vox");
    }

    if (type.includes("drop")) {
      return key.includes("drop_") || key.includes("dropped_");
    }

    if (type.includes("outburst")) {
      return key.includes("outburst");
    }

    if (type.includes("grimey")) {
      return key.includes("grm_") || key.includes("rewind_sfx");
    }

    if (type === "ending") {
      return (
        key.includes("outro") ||
        key.includes("crash") ||
        key.includes("pad") ||
        key.includes("chimes") ||
        key.includes("glock")
      );
    }

        if (isLyrix(entry)) return false;

    return (
      key.includes("synth") ||
      key.includes("bass") ||
      key.includes("pad") ||
      key.includes("chimes") ||
      key.includes("glock") ||
      key.includes("bagoo") ||
      key.includes("floot") ||
      key.includes("vlins") ||
      key.includes("breathe_vox") ||
      key.includes("random_vox") ||
      key.includes("other_vox") ||
      key.includes("wierd_vox") ||
      key.includes("cello") ||
      key.includes("accordian") ||
      key.includes("clarinet") ||
      key.includes("tbone") ||
      key.includes("trumpet")
    );
  }

  function midiMatchesSection(pattern, section) {
    const key = pattern.file.toLowerCase();
    const type = section.type;

    const hookSection = isHookSection(section);
    const hookKey = isHookKey(pattern.file);

    if (hookKey && !hookSection) return false;
    if (hookSection && !hookKey) return false;

    if (hookSection) {
      return true;
    }

    if (type.includes("grimey")) {
      return key.includes("hats") || key.includes("snare") || key.includes("rims");
    }

    if (type.includes("drop")) {
      return key.includes("crash") || key.includes("snare") || key.includes("rims");
    }

    if (type.includes("outburst")) {
      return key.includes("crash") || key.includes("hats") || key.includes("snare");
    }

    if (type.includes("lyrix")) {
      return key.includes("holdit_hats") || key.includes("main_hats") || key.includes("snare");
    }

    if (type === "ending") {
      return key.includes("crash") || key.includes("jazz") || key.includes("hats");
    }

    return (
      key.includes("main_hats") ||
      key.includes("snare") ||
      key.includes("rims") ||
      key.includes("hats") ||
      key.includes("ride")
    );
  }

  function sectionGainForAudio(entry, section) {
    const key = entry.key.toLowerCase();

    if (isTrueBass(entry)) return 0.55;
    if (isLyrix(entry)) return 0.72;
    if (key.includes("drop_")) return 0.65;
    if (key.includes("outburst")) return 0.7;
    if (key.includes("grm_")) return 0.68;
    if (key.includes("crash")) return 0.45;
    if (key.includes("pad")) return 0.38;
    if (key.includes("chimes") || key.includes("glock")) return 0.35;
    if (key.includes("vox")) return 0.5;

    return section.type === "normal" ? 0.38 : 0.45;
  }
  function getLyrixGroupKeys(entry) {
    if (!isLyrix(entry)) return [entry.key];

    const groupProps = catalog.groups.numberedGroups.PSObject
      ? []
      : null;

    // Browser JSON object path:
    const numberedGroups = catalog.groups.numberedGroups || {};
    const entryKey = entry.key;

    for (const groupName of Object.keys(numberedGroups)) {
      const group = numberedGroups[groupName];

      if (!Array.isArray(group)) continue;

      const keys = group.map(item => item.key || item);

      if (keys.includes(entryKey)) {
        return keys;
      }
    }

    return [entry.key];
  }

  function scheduleLyrixPathWithPlaybackState({
    offlineContext,
    destination,
    path,
    buffer,
    startTime,
    gainValue = 0.72,
    playbackState = null,
    section = null
  } = {}) {
    if (!path || !buffer) return null;

    const entry = getCatalogEntry(path) || {
      key: path,
      folder: "lyrix",
      type: "audio",
      family: "lyrix",
      tags: ["audio", "lyrix"]
    };

    const lyrixProfile = getRuleProfileForEntry(entry);

    applyCutoffRulesForAllowedDecision(playbackState, {
      entry,
      section,
      startSeconds: startTime
    }, lyrixProfile);

    return scheduleAudioBufferWithPlaybackState({
      offlineContext,
      destination,
      buffer,
      startTime,
      gainValue,
      playbackState,
      key: path,
      entry,
      section,
      family: entry.family || "lyrix"
    });
  }

  function scheduleExplicitLyrixSection({ offlineContext, destination, section, random, playbackState = null, buffers }) {
    const lyrixSection = section.lyrixSection;
    if (!lyrixSection?.parts?.length) return false;

    let start = section.startSeconds;
    const leadIn = lyrixSection.leadIn || null;

    const shouldSkipLeadIn =
      section.suppressLyrixLeadIn ||
      (leadIn?.firstActivationOnly && Number(section.lyrixActivationNumber || 1) > 1);

    if (leadIn && !shouldSkipLeadIn) {
      const leadInChance = leadIn.chance === undefined ? 1 : Number(leadIn.chance);

      if (chance(random, leadInChance)) {
        const leadInStart = Math.max(0, section.startSeconds - (Number(leadIn.startsBeforeBars) || 0) * section.barSeconds);
        const leadInGain = Number(leadIn.gain) || 0.72;

        if (leadIn.file) {
          const leadInBuffer = buffers.get(leadIn.file);
          scheduleLyrixPathWithPlaybackState({
            offlineContext,
            destination,
            path: leadIn.file,
            buffer: leadInBuffer,
            startTime: leadInStart,
            gainValue: leadInGain,
            playbackState,
            section
          });
        }

        if (leadIn.files?.dry) {
          const leadInDryBuffer = buffers.get(leadIn.files.dry);
          scheduleLyrixPathWithPlaybackState({
            offlineContext,
            destination,
            path: leadIn.files.dry,
            buffer: leadInDryBuffer,
            startTime: leadInStart,
            gainValue: leadInGain,
            playbackState,
            section
          });
        }

        if (leadIn.files?.wet) {
          const leadInWetBuffer = buffers.get(leadIn.files.wet);
          scheduleLyrixPathWithPlaybackState({
            offlineContext,
            destination,
            path: leadIn.files.wet,
            buffer: leadInWetBuffer,
            startTime: leadInStart,
            gainValue: leadInGain,
            playbackState,
            section
          });
        }
      }
    }

    const partStartTimes = new Map();

    for (const part of lyrixSection.parts) {
      partStartTimes.set(Number(part.part) || 1, start);
      let activeDryPath = part.dry || null;
      const replacementRule = lyrixSection.part3ReplacementRule;

      if (replacementRule && Number(part.part) === Number(replacementRule.targetPart)) {
        const replacementChance = Number(replacementRule.chance) || 0;

        if (replacementRule.replaces === "dry" && replacementRule.replacementFile && chance(random, replacementChance)) {
          activeDryPath = replacementRule.replacementFile;
        }
      }

      const dryBuffer = activeDryPath ? buffers.get(activeDryPath) : null;
      const wetBuffer = part.wet && !part.dryOnly ? buffers.get(part.wet) : null;
      const singleBuffer = part.file ? buffers.get(part.file) : null;
      const gain = Number(part.gain) || 0.72;

      scheduleLyrixPathWithPlaybackState({
        offlineContext,
        destination,
        path: activeDryPath,
        buffer: dryBuffer,
        startTime: start,
        gainValue: gain,
        playbackState,
        section
      });

      scheduleLyrixPathWithPlaybackState({
        offlineContext,
        destination,
        path: part.wet,
        buffer: wetBuffer,
        startTime: start,
        gainValue: gain,
        playbackState,
        section
      });

      scheduleLyrixPathWithPlaybackState({
        offlineContext,
        destination,
        path: part.file,
        buffer: singleBuffer,
        startTime: start,
        gainValue: gain,
        playbackState,
        section
      });

      if (dryBuffer) {
        start += dryBuffer.duration;
      } else if (singleBuffer) {
        start += singleBuffer.duration;
      } else if (wetBuffer) {
        start += wetBuffer.duration;
      }
    }


    const adlibs = lyrixSection.adlibs ? [].concat(lyrixSection.adlibs) : [];

    for (const adlib of adlibs) {
      let adlibStart = null;

      if (adlib.part) {
        adlibStart = partStartTimes.get(Number(adlib.part));
      } else if (adlib.startsWhen && String(adlib.startsWhen).includes("_lyrix_starts")) {
        adlibStart = section.startSeconds;
      }


      if (typeof adlibStart !== "number") continue;

      const activationChance = adlib.activationChance === undefined ? 1 : Number(adlib.activationChance);
      if (!chance(random, activationChance)) continue;

      if (adlib.file) {
        const adlibBuffer = buffers.get(adlib.file);
        scheduleLyrixPathWithPlaybackState({
          offlineContext,
          destination,
          path: adlib.file,
          buffer: adlibBuffer,
          startTime: adlibStart,
          gainValue: 0.72,
          playbackState,
          section
        });
      }

      if (adlib.files?.dry) {
        const dryAdlibBuffer = buffers.get(adlib.files.dry);
        scheduleLyrixPathWithPlaybackState({
          offlineContext,
          destination,
          path: adlib.files.dry,
          buffer: dryAdlibBuffer,
          startTime: adlibStart,
          gainValue: 0.72,
          playbackState,
          section
        });
      }

      if (adlib.files?.wet) {
        const wetAdlibBuffer = buffers.get(adlib.files.wet);
        scheduleLyrixPathWithPlaybackState({
          offlineContext,
          destination,
          path: adlib.files.wet,
          buffer: wetAdlibBuffer,
          startTime: adlibStart,
          gainValue: 0.72,
          playbackState,
          section
        });
      }
    }
    return true;
  }

  function scheduleLyrixGroupInSection({ offlineContext, destination, key, random, playbackState = null, section, buffers }) {
    const entry = getCatalogEntry(key);
    if (!entry || !isLyrix(entry)) return false;

    const groupKeys = getLyrixGroupKeys(entry)
      .filter(groupKey => buffers.has(groupKey))
      .sort((a, b) => {
        const aEntry = getCatalogEntry(a);
        const bEntry = getCatalogEntry(b);
        const aPart = aEntry?.partNumber || 1;
        const bPart = bEntry?.partNumber || 1;
        return aPart - bPart;
      });

    if (!groupKeys.length) return false;

    let start = section.startSeconds;

    for (const groupKey of groupKeys) {
      const buffer = buffers.get(groupKey);
      if (!buffer) continue;

      scheduleLyrixPathWithPlaybackState({
        offlineContext,
        destination,
        path: groupKey,
        buffer,
        startTime: start,
        gainValue: 0.72,
        playbackState,
        section
      });

      start += buffer.duration;
    }

    return true;
  }
  function scheduleAudioStemInSection({ offlineContext, destination, key, buffer, random, plan = null, lifecycleStates = null, playbackState = null, section }) {
    const entry = getCatalogEntry(key);
    if (!entry || !buffer) return 0;
    if (!audioMatchesSection(entry, section)) return 0;

    const keyLower = key.toLowerCase();
    const gain = sectionGainForAudio(entry, section);

    if (entry.folder === "alternate downloads") {
      if (chance(random, 0.005)) {
        return scheduleAudioBufferWithPlaybackState({
          offlineContext,
          destination,
          buffer,
          startTime: section.startSeconds,
          gainValue: 0.8,
          playbackState,
          key,
          entry,
          section
        }) ? 1 : 0;
      }
      return 0;
    }

    if (keyLower.includes("everything_intro")) {
      return scheduleAudioBufferWithPlaybackState({
        offlineContext,
        destination,
        buffer,
        startTime: section.startSeconds,
        gainValue: gain,
        playbackState,
        key,
        entry,
        section
      }) ? 1 : 0;
    }

    if (keyLower.includes("drop_") || keyLower.includes("dropped_")) {
      const localBar = Math.floor(random() * Math.max(1, section.bars));
      return scheduleAudioBufferWithPlaybackState({
        offlineContext,
        destination,
        buffer,
        startTime: section.startSeconds + localBar * section.barSeconds,
        gainValue: gain,
        playbackState,
        key,
        entry,
        section
      }) ? 1 : 0;
    }

    if (keyLower.includes("outburst")) {
      return scheduleAudioBufferWithPlaybackState({
        offlineContext,
        destination,
        buffer,
        startTime: section.startSeconds,
        gainValue: gain,
        playbackState,
        key,
        entry,
        section
      }) ? 1 : 0;
    }

    if (keyLower.includes("grm_") || keyLower.includes("rewind_sfx")) {
      const localBar = Math.floor(random() * Math.max(1, section.bars));
      return scheduleAudioBufferWithPlaybackState({
        offlineContext,
        destination,
        buffer,
        startTime: section.startSeconds + localBar * section.barSeconds,
        gainValue: gain,
        playbackState,
        key,
        entry,
        section
      }) ? 1 : 0;
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

    const audioProfile = getRuleProfileForEntry(entry);

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
        }
      }
    }

    return scheduledCount;
  }

  function schedulePlan({ offlineContext, destination, buffers, plan, random, duration }) {
    const sections = plan.sectionTimeline || [];
    const lifecycleStates = createLifecycleMapFromPlan(plan);
    const playbackState = createPlaybackRuleState();

    for (const section of sections) {
      expirePlaybackItemsAtTime(playbackState, section.startSeconds);
      const sectionMidiKeys = Array.isArray(section.selectedMidi) ? section.selectedMidi : plan.selectedMidi;
      const sectionMidi = sectionMidiKeys
        .map(file => midiPatterns.patterns.find(item => item.file === file))
        .filter(Boolean)
        .filter(pattern => midiMatchesSection(pattern, section));

      for (const pattern of sectionMidi) {
        const midiLifecycleId = getMidiLifecycleId(pattern.file);

        if (!isLifecycleIdEligible(lifecycleStates, midiLifecycleId)) continue;

        const repeatEveryBars = pattern.lengthBeats > 8 ? 4 : 2;
        const repeatEverySeconds = section.barSeconds * repeatEveryBars;

        for (let t = section.startSeconds; t < section.endSeconds; t += repeatEverySeconds) {
          const localBarIndex = Math.round((t - section.startSeconds) / section.barSeconds);

          if (!isBarOpportunityAllowedForKey(pattern.file, section, localBarIndex)) {
            continue;
          }

          const midiProfile = getRuleProfileForMidiPattern(pattern);
          const midiBaseChance = getActivationChance(midiProfile, 0.7);

          const midiDecisionResult = resolveRuleProfileDecision({
            random,
            plan,
            playbackState,
            kind: "midi",
            pattern,
            section,
            lifecycleStates,
            localBarIndex,
            startSeconds: t,
            baseChance: midiBaseChance,
            profile: midiProfile
          });

          if (midiDecisionResult.allowed) {
            applyCutoffRulesForAllowedDecision(playbackState, midiDecisionResult.context, midiProfile);
            const scheduledCount = scheduleMidiPattern({
              offlineContext,
              destination,
              pattern,
              buffers,
              barStart: t,
              beatSeconds: section.barSeconds / 4,
              gainValue: 0.62,
              playbackState,
              section
            });

            if (scheduledCount > 0) {
              activateLifecycleItem(
                lifecycleStates,
                midiLifecycleId,
                `${section.id}:${t}`
              );
            }
          }
        }
      }

      if (section.lyrixSectionId) {
        scheduleExplicitLyrixSection({
          offlineContext,
          destination,
          section,
          random,
          playbackState,
          buffers
        });
        continue;
      }

      if (section.type.includes("lyrix") && !section.lyrixSectionId) {
        const hasAnySelectedLyrix = plan.selectedAudio.some(key => {
          const entry = getCatalogEntry(key);
          return entry && isLyrix(entry);
        });

        if (!hasAnySelectedLyrix) {
          const lyrixCandidates = catalog.entries.filter(entry =>
            isLyrix(entry) &&
            !entry.key.toLowerCase().includes("outburst") &&
            !entry.key.toLowerCase().includes("grm_")
          );

          const chosenLyrix = chooseOne(random, lyrixCandidates);

          if (chosenLyrix) {
            plan.selectedAudio.push(chosenLyrix.key);
            setLifecycleEligible(lifecycleStates, getAudioLifecycleId(chosenLyrix.key));
          }
        }
      }

            const lyrixKeysForThisSection = plan.selectedAudio.filter(key => {
        const entry = getCatalogEntry(key);
        return entry && isLyrix(entry) && audioMatchesSection(entry, section);
      });

      const chosenLyrixKeyForSection =
        section.type.includes("lyrix") && lyrixKeysForThisSection.length
          ? chooseOne(random, lyrixKeysForThisSection)
          : null;

      const scheduledLyrixGroupIds = new Set();

      for (const key of plan.selectedAudio) {
        const entry = getCatalogEntry(key);
        const audioLifecycleId = getAudioLifecycleId(key);

        if (!isLifecycleIdEligible(lifecycleStates, audioLifecycleId)) continue;


        if (entry && isLyrix(entry)) {
          if (key !== chosenLyrixKeyForSection) continue;

          const groupId = getLyrixGroupKeys(entry).slice().sort().join("|");
          if (scheduledLyrixGroupIds.has(groupId)) continue;
          scheduledLyrixGroupIds.add(groupId);
        }

        const scheduledCount = scheduleAudioStemInSection({
          offlineContext,
          destination,
          key,
          buffer: buffers.get(key),
          random,
          plan,
          lifecycleStates,
          playbackState,
          section
        });

        if (scheduledCount > 0) {
          activateLifecycleItem(
            lifecycleStates,
            audioLifecycleId,
            `${section.id}:${key}`
          );
        }
      }
    }

    expirePlaybackItemsAtTime(playbackState, duration);

    plan.playbackRuleDebug = {
      activeItemsRemaining: playbackState.activeItems.size,
      blockedWindows: playbackState.blockedWindows.map(window => ({ ...window })),
      cutoffEvents: playbackState.cutoffEvents.map(event => ({ ...event })),
      familyLocks: [...playbackState.familyLocks.entries()].map(([family, itemId]) => ({
        family,
        itemId
      }))
    };

    writeLifecycleMapToPlan(plan, lifecycleStates);
  }

  async function renderTrack(format) {
    const random = mulberry32(currentSeed);
    const sampleRate = rules.sampleRate || 44100;
    const duration = Math.max(180, rules.songLengthSeconds || 180);

    setStatus(`BUILDING FULL PLAN / SEED ${currentSeed}`);

    const plan = buildFullPlan(random);

    const neededPaths = new Set();

    for (const key of plan.selectedAudio) neededPaths.add(key);

    for (const midiFile of plan.selectedMidi) {
      const pattern = midiPatterns.patterns.find(item => item.file === midiFile);
      if (pattern) neededPaths.add(pattern.samplePath);
    }

    const paths = [...neededPaths];

    setStatus(`LOADING AUDIO / ${paths.length} FILES / SEED ${currentSeed}`);

    const offlineContext = new OfflineAudioContext(
      2,
      Math.ceil(duration * sampleRate),
      sampleRate
    );

    const masterGain = offlineContext.createGain();
    masterGain.gain.value = rules.masterGain ?? 0.72;
    masterGain.connect(offlineContext.destination);

    const buffers = new Map();

    for (const path of paths) {
      buffers.set(path, await fetchAndDecode(offlineContext, path));
    }

currentRenderBuffers = buffers;

    setStatus(`RENDERING ${format.toUpperCase()} / AUDIO ${plan.selectedAudio.length} / MIDI ${plan.selectedMidi.length}`);

    schedulePlan({
      offlineContext,
      destination: masterGain,
      buffers,
      plan,
      random,
      duration
    });

    const renderedBuffer = await offlineContext.startRendering();

    if (format === "wav") {
      const wavBlob = audioBufferToWavBlob(renderedBuffer);
      downloadBlob(wavBlob, `test-project-2-full-seed-${currentSeed}.wav`);
    }

    if (format === "mp3") {
      await ensureLameJs();
      const mp3Blob = audioBufferToMp3Blob(renderedBuffer);
      downloadBlob(mp3Blob, `test-project-2-full-seed-${currentSeed}.mp3`);
    }

    currentSeed = makeSeed();
    applyRandomColourScheme();
  }

  function audioBufferToWavBlob(buffer) {
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;

    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = buffer.getChannelData(channel)[i];
        const clamped = Math.max(-1, Math.min(1, sample));
        view.setInt16(
          offset,
          clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
          true
        );
        offset += 2;
      }
    }

    return new Blob([view], { type: "audio/wav" });
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  async function ensureLameJs() {
    if (window.lamejs) return;

    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load lamejs for MP3 export"));
      document.head.appendChild(script);
    });
  }

  function audioBufferToMp3Blob(buffer) {
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const encoder = new lamejs.Mp3Encoder(numberOfChannels, sampleRate, 320);
    const blockSize = 1152;
    const mp3Chunks = [];

    const left = buffer.getChannelData(0);
    const right = numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i += blockSize) {
      const leftChunk = floatTo16Bit(left.subarray(i, i + blockSize));
      const rightChunk = floatTo16Bit(right.subarray(i, i + blockSize));
      const mp3Buffer = encoder.encodeBuffer(leftChunk, rightChunk);

      if (mp3Buffer.length > 0) {
        mp3Chunks.push(new Uint8Array(mp3Buffer));
      }
    }

    const endBuffer = encoder.flush();

    if (endBuffer.length > 0) {
      mp3Chunks.push(new Uint8Array(endBuffer));
    }

    return new Blob(mp3Chunks, { type: "audio/mpeg" });
  }

  function floatTo16Bit(floatArray) {
    const output = new Int16Array(floatArray.length);

    for (let i = 0; i < floatArray.length; i++) {
      const clamped = Math.max(-1, Math.min(1, floatArray[i]));
      output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }

    return output;
  }

  function downloadBlob(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  }

  async function playButtonSound() {
    try {
      const random = mulberry32(currentSeed + 999);
      const buttonSounds = catalog?.rulePools?.ui?.buttonSounds || [];
      const sound = chooseOne(random, buttonSounds);

      if (!sound) return;

      const context = new AudioContext();
      const response = await fetch(toAssetUrl(sound));
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(arrayBuffer);

      const source = context.createBufferSource();
      const gain = context.createGain();

      source.buffer = buffer;
      gain.gain.value = Math.pow(10, -6 / 20);

      source.connect(gain);
      gain.connect(context.destination);
      source.start();
    } catch (error) {
      console.warn("Button sound failed:", error);
    }
  }

  async function init() {
    try {
      rules = await loadJson(rulesPath);
      catalog = await loadJson(catalogPath);
      midiPatterns = await loadJson(midiPatternsPath);
      lyrixRules = await loadJson(lyrixRulesPath);
      console.log("[lyrix-rules loaded]", { version: lyrixRules?.version, sections: lyrixRules?.sections?.length, specialSystems: lyrixRules?.specialSystems?.length });

      catalog.entriesByKey = new Map(catalog.allKeys.map(key => {
        const entry = catalog.entries?.find(item => item.key === key);
        return [key, entry];
      }));

      // Fallback if catalog.entries is not included in full catalog.
      if (!catalog.entries || !catalog.entries.length) {
        const registry = await loadJson("data/stem-registry.json");
        catalog.entries = registry.entries;
        catalog.entriesByKey = new Map(registry.entries.map(entry => [entry.key, entry]));
      }

      applyRandomColourScheme();

      if (attributionLink) {
        attributionLink.href = "#";
      }

      wavButton.addEventListener("click", () => {
        playButtonSound();
        renderTrack("wav").catch(error => {
          console.error(error);
          setStatus(`ERROR: ${error.message}`);
        });
      });

      mp3Button.addEventListener("click", () => {
        playButtonSound();
        renderTrack("mp3").catch(error => {
          console.error(error);
          setStatus(`ERROR: ${error.message}`);
        });
      });
    } catch (error) {
      console.error(error);
      setStatus(`ERROR: ${error.message}`);
    }
  }

  init();
})();
