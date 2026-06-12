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
    "gromit_2",
    "kachow",
    "fall",
    "phones",
    "shade",
    "tits",
    "swoosh",
    "nosound",
    "weed_1",
    "weed_2",
    "clockout",
    "holdit",
    "intrusive",
    "scooby",
    "buf"
  ]);


  function getLyrixSectionLengthBars(section) {
    return Number(
      section.lengthBars ||
      section.activationPointLengthBars ||
      section.logicalLengthBars ||
      section.lengthBarsWithoutContinuation ||
      section.defaultLengthBars ||
      section.maxLengthBars ||
      0
    );
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
      (
        (Array.isArray(section.parts) && section.parts.length > 0) ||
        (Array.isArray(section.coreFiles) && section.coreFiles.length > 0)
      )
    );

    if (!candidates.length) return null;

    const totalWeight = candidates.reduce((sum, section) =>
      sum + Math.max(0, Number(section.globalInclusionChance) || 0),
      0
    );

    if (totalWeight <= 0) return null;

    let roll = random() * totalWeight;

    for (const section of candidates) {
      roll -= Math.max(0, Number(section.globalInclusionChance) || 0);
      if (roll <= 0) return section;
    }

    return candidates[candidates.length - 1];
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

  function getLyrixTensionRange(tensionLabel) {
    const label = String(tensionLabel || "").toLowerCase();

    if (label === "highest") return [0.8, 1];
    if (label === "high") return [0.5, 0.8];
    if (label === "medium_high") return [0.2, 0.5];
    if (label === "neutral" || label === "medium") return [0, 0];
    if (label === "medium_low") return [-0.2, -0.5];
    if (label === "low") return [-0.5, -0.8];
    if (label === "lowest") return [-0.8, -1];

    return null;
  }

  function chooseTensionValueFromRange(random, range) {
    if (!Array.isArray(range) || range.length < 2) return 0;

    const start = Number(range[0]);
    const end = Number(range[1]);

    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    if (start === end) return start;

    return start + (end - start) * random();
  }

  function getLyrixSectionEnergyOptions(random, lyrixSection) {
    const tensionBand = String(lyrixSection?.tensionLabel || "").toLowerCase();
    const tensionRange = getLyrixTensionRange(tensionBand);

    if (!tensionRange) return {};

    return {
      tensionValue: chooseTensionValueFromRange(random, tensionRange),
      tensionBand
    };
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
    if (!section) return files;

    for (const coreFile of section.coreFiles || []) {
      files.push(coreFile);
    }

    for (const adlibFile of section.adlibRule?.files || []) {
      files.push(adlibFile);
    }

    if (!section?.parts) return [...new Set(files)];

    for (const part of section.parts) {
      if (part.dry) files.push(part.dry);
      if (part.wet && !part.dryOnly) files.push(part.wet);
      if (part.file) files.push(part.file);
    }

    if (section.mainLyrix) {
      if (section.mainLyrix.dry) files.push(section.mainLyrix.dry);
      if (section.mainLyrix.wet) files.push(section.mainLyrix.wet);
    }


    const adlibs = section.adlibs ? [].concat(section.adlibs) : [];

    for (const adlib of adlibs) {
      if (adlib.file) files.push(adlib.file);
      if (adlib.files?.dry) files.push(adlib.files.dry);
      if (adlib.files?.wet) files.push(adlib.files.wet);
    }
    if (section.part3ReplacementRule?.replacementFile) files.push(section.part3ReplacementRule.replacementFile);

    const finalSceneSwapFiles = section.lastPartRule?.ifFinalPartNotOmitted?.sceneSwapFiles;
    if (finalSceneSwapFiles?.dry) files.push(finalSceneSwapFiles.dry);
    if (finalSceneSwapFiles?.wet) files.push(finalSceneSwapFiles.wet);

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
  function normalizeOpportunityRuleValues(value) {
    if (value === undefined || value === null) return [];
    return (Array.isArray(value) ? value : [value])
      .map(item => normalizeRuleDecisionToken(item))
      .filter(Boolean);
  }

  function opportunityRuleHasAnyMatch(ruleValues, actualValues) {
    const wanted = normalizeOpportunityRuleValues(ruleValues);
    if (!wanted.length) return true;

    const actual = new Set(normalizeOpportunityRuleValues(actualValues));
    return wanted.some(value => actual.has(value));
  }

  function opportunityRuleHasAllMatches(ruleValues, actualValues) {
    const wanted = normalizeOpportunityRuleValues(ruleValues);
    if (!wanted.length) return true;

    const actual = new Set(normalizeOpportunityRuleValues(actualValues));
    return wanted.every(value => actual.has(value));
  }

  function isActivationOpportunityRuleAllowedForBar(rule, section, localBarIndex) {
    if (!rule || rule.enabled === false) return false;

    const sectionType = normalizeRuleDecisionToken(section?.type || "");
    const sectionTags = getSectionRuleDecisionTags(section);
    const trackBarNumber = getTrackBarNumber(section, localBarIndex);
    const bars = Math.max(0, Number(section?.bars || 0));
    const barsFromSectionEnd = Math.max(0, bars - localBarIndex - 1);

    const allowedSectionTypes =
      rule.sectionTypes ??
      rule.allowedSectionTypes ??
      rule.types ??
      null;

    if (allowedSectionTypes !== null && !opportunityRuleHasAnyMatch(allowedSectionTypes, [sectionType])) {
      return false;
    }

    const allowedSectionTags =
      rule.sectionTags ??
      rule.allowedSectionTags ??
      null;

    if (allowedSectionTags !== null && !opportunityRuleHasAnyMatch(allowedSectionTags, sectionTags)) {
      return false;
    }

    const requiredSectionTags =
      rule.requiredSectionTags ??
      rule.requiresSectionTags ??
      null;

    if (requiredSectionTags !== null && !opportunityRuleHasAllMatches(requiredSectionTags, sectionTags)) {
      return false;
    }

    const blockedSectionTags =
      rule.blockedSectionTags ??
      rule.excludedSectionTags ??
      rule.unlessSectionTags ??
      null;

    if (blockedSectionTags !== null && opportunityRuleHasAnyMatch(blockedSectionTags, sectionTags)) {
      return false;
    }

    const allowedLocalBars =
      rule.localBarIndexes ??
      rule.allowedLocalBarIndexes ??
      rule.localBars ??
      null;

    if (allowedLocalBars !== null) {
      const allowed = new Set((Array.isArray(allowedLocalBars) ? allowedLocalBars : [allowedLocalBars]).map(Number));
      if (!allowed.has(localBarIndex)) return false;
    }

    const allowedTrackBars =
      rule.trackBarNumbers ??
      rule.allowedTrackBarNumbers ??
      null;

    if (allowedTrackBars !== null) {
      const allowed = new Set((Array.isArray(allowedTrackBars) ? allowedTrackBars : [allowedTrackBars]).map(Number));
      if (!allowed.has(trackBarNumber)) return false;
    }

    if (Number.isFinite(Number(rule.minLocalBarIndex)) && localBarIndex < Number(rule.minLocalBarIndex)) {
      return false;
    }

    if (Number.isFinite(Number(rule.maxLocalBarIndex)) && localBarIndex > Number(rule.maxLocalBarIndex)) {
      return false;
    }

    if (Number.isFinite(Number(rule.minBarsFromSectionEnd)) && barsFromSectionEnd < Number(rule.minBarsFromSectionEnd)) {
      return false;
    }

    if (Number.isFinite(Number(rule.maxBarsFromSectionEnd)) && barsFromSectionEnd > Number(rule.maxBarsFromSectionEnd)) {
      return false;
    }

    return true;
  }

  function isActivationOpportunityAllowedForProfile(profile, section, localBarIndex) {
    const rules = getActivationOpportunityRules(profile);
    if (!Array.isArray(rules) || !rules.length) return true;

    const activeRules = rules.filter(rule => rule && rule.enabled !== false);
    if (!activeRules.length) return true;

    return activeRules.some(rule => isActivationOpportunityRuleAllowedForBar(rule, section, localBarIndex));
  }

  function getAllowedLocalBarIndexesForKey(key, section, profile = null) {
    const bars = Math.max(0, Number(section?.bars || 0));
    const indexes = [];

    for (let localBarIndex = 0; localBarIndex < bars; localBarIndex++) {
      if (
        isBarOpportunityAllowedForKey(key, section, localBarIndex) &&
        isActivationOpportunityAllowedForProfile(profile, section, localBarIndex)
      ) {
        indexes.push(localBarIndex);
      }
    }

    return indexes;
  }

  function hasExplicitOddEvenTimingToken(value) {
    return /(?:^|[\/_\-\s])(?:odd|even)(?:[._\-\s]|$)/i.test(String(value || ""));
  }

  function shouldAllowEveryBarActiveContinuationForAudio(entry) {
    const key = String(entry?.key || "").toLowerCase();
    const tags = new Set((Array.isArray(entry?.tags) ? entry.tags : []).map(tag => String(tag).toLowerCase()));
    const isExplicitContinuous =
      tags.has("continuous") ||
      tags.has("cont") ||
      /(?:^|[\/_\-\s])cont(?:[._\-\s]|$)/i.test(key);

    // Delay layers follow their source/dependent rules; do not turn them into every-bar continuations.
    if (key.includes("dlay") || key.includes("delay")) return false;

    // #cont is an explicit continuation instruction, even when the filename also contains odd/even.
    // This fixes cont stems such as synth_cont_odd and rhodes_replace-synth_cont_odd staying stuck every other bar.
    if (isExplicitContinuous) return true;

    // Explicit odd/even timing must still be respected for non-cont material.
    // Example: glock_odd without glock_ext_even should stay every other bar.
    if (hasExplicitOddEvenTimingToken(key)) return false;

    return (
      key.includes("glock") ||
      key.includes("chimes") ||
      key.includes("heartbeats") ||
      key.includes("vinyl") ||
      key.includes("hippy_synth") ||
      key.includes("shaker") ||
      key.includes("accbreath") ||
      key.includes("pad_1") ||
      key.includes("pad_2") ||
      key.includes("pad_wiv-bass") ||
      key.includes("pad_wiv_bass")
    );
  }

  function shouldAllowEveryBarActiveContinuationForMidi(pattern) {
    const file = String(pattern?.file || "").toLowerCase();
    const isExplicitContinuous =
      keyHasFilenameToken(file, "cont") ||
      /(?:^|[\\/_\-\s])cont(?:[._\-\s]|$)/i.test(file);

    // Explicit cont MIDI should continue every bar, even when the filename also has odd/even.
    if (isExplicitContinuous) return true;

    // Main hats without odd/even can continue every bar.
    // MIDI files that explicitly say odd/even but not cont keep that timing restriction.
    return file.includes("hats") && !hasExplicitOddEvenTimingToken(file);
  }

  function isContinuationAwareBarAllowedForKey({
    key,
    section,
    localBarIndex,
    profile = null,
    lifecycleStates = null,
    lifecycleId = "",
    allowEveryBarContinuation = false
  }) {
    if (
      isBarOpportunityAllowedForKey(key, section, localBarIndex) &&
      isActivationOpportunityAllowedForProfile(profile, section, localBarIndex)
    ) {
      return true;
    }

    if (!allowEveryBarContinuation) return false;

    const lifecycleState = lifecycleStates && lifecycleId
      ? getLifecycleState(lifecycleStates, lifecycleId)
      : null;

    if (!lifecycleState?.activated) return false;

    // Once active, continuous material and hats can continue on each bar,
    // but section/profile restrictions still apply.
    return isActivationOpportunityAllowedForProfile(profile, section, localBarIndex);
  }

  function getContinuationAwareAllowedLocalBarIndexesForKey({
    key,
    section,
    profile = null,
    lifecycleStates = null,
    lifecycleId = "",
    allowEveryBarContinuation = false
  }) {
    const bars = Math.max(0, Number(section?.bars || 0));
    const indexes = [];

    for (let localBarIndex = 0; localBarIndex < bars; localBarIndex++) {
      if (
        isContinuationAwareBarAllowedForKey({
          key,
          section,
          localBarIndex,
          profile,
          lifecycleStates,
          lifecycleId,
          allowEveryBarContinuation
        })
      ) {
        indexes.push(localBarIndex);
      }
    }

    return indexes;
  }

  function chooseAllowedLocalBarIndexForKey(random, key, section, profile = null) {
    const allowedIndexes = getAllowedLocalBarIndexesForKey(key, section, profile);
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
  function normalizeLifecycleContinuationKey(key) {
    const raw = String(key || "").trim();

    let value = raw
      .toLowerCase()
      .replace(/\s*\(consolidated\)\s*/gi, "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/#\d+/g, "");

    const isExplicitExt = /(?:^|[\/_\-\s])ext(?=[._\-\s()]|$)/i.test(value);

    value = value
      .replace(/(?:^|[\/_\-\s])cont(?=[._\-\s()]|$)/gi, "_")
      .replace(/(?:^|[\/_\-\s])ext(?=[._\-\s()]|$)/gi, "_")
      .replace(/[\/\\_\-\s]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

    if (isExplicitExt) {
      value = value
        .replace(/(^|_)bagoo_even($|_)/g, "$1bagoo_odd$2")
        .replace(/(^|_)glock_even_dlay($|_)/g, "$1glock_odd_dlay$2")
        .replace(/(^|_)glock_even($|_)/g, "$1glock_odd$2")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
    }

    return value || raw;
  }

  function getAudioLifecycleId(key) {
    return "audio:" + normalizeLifecycleContinuationKey(key);
  }

  function getMidiLifecycleId(key) {
    return "midi:" + normalizeLifecycleContinuationKey(key);
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
      groupedActivationDecisions: new Map(),
      trueBassSystem: null,
      centralInstrumentFamilySystems: new Map(),
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

  function playbackItemHasTag(item, tag) {
    const normalizedTag = normalizeRuleDecisionToken(tag);
    return Array.isArray(item?.tags) && item.tags.some(value => normalizeRuleDecisionToken(value) === normalizedTag);
  }

  function isAtmospherePlaybackItem(item) {
    return playbackItemHasTag(item, "atmosphere") || playbackItemHasTag(item, "family:atmosphere");
  }

  function isLyrixPlaybackItem(item) {
    return playbackItemHasTag(item, "lyrix") ||
      playbackItemHasTag(item, "folder:lyrix") ||
      normalizeRuleDecisionToken(item?.family) === "lyrix";
  }

  function shouldCutForLyrixSecondBarRule(item) {
    return item && !isAtmospherePlaybackItem(item) && !isLyrixPlaybackItem(item);
  }

  function applyLyrixSecondBarCutoffRule(playbackState, section, lyrixSection, random) {
    const rule = lyrixSection?.secondBarCutoffRule;
    if (!playbackState || !section || !rule) return null;

    const appliesAtSectionBar = Math.max(1, Number(rule.appliesAtSectionBar) || 2);
    const cutTimeSeconds = section.startSeconds + (appliesAtSectionBar - 1) * section.barSeconds;
    const blockEndSeconds = Math.min(section.endSeconds, cutTimeSeconds + section.barSeconds);
    const fadeSeconds = Math.max(0, Number(rule.fadeSeconds ?? 0.01));

    let activeCutCount = 0;
    const activeItems = getActivePlaybackItemsAtTime(playbackState, cutTimeSeconds, {});

    for (const item of activeItems) {
      if (!shouldCutForLyrixSecondBarRule(item)) continue;

      if (cutOffPlaybackItem(playbackState, item, cutTimeSeconds, {
        fadeSeconds,
        reason: `${lyrixSection.id || "lyrix"}_second_bar_cutoff`
      })) {
        activeCutCount += 1;
      }
    }

    let futureCutCount = 0;
    const forceFutureDropoutChance = clampProbability(rule.forceNonAtmosphereDropoutChance ?? 0);

    if (chance(random, forceFutureDropoutChance)) {
      const futureItems = getFuturePlaybackItemsAfterTime(playbackState, cutTimeSeconds, {})
        .filter(item => Number(item.startSeconds) < section.endSeconds)
        .filter(shouldCutForLyrixSecondBarRule);

      for (const item of futureItems) {
        if (cutOffPlaybackItem(playbackState, item, cutTimeSeconds, {
          fadeSeconds,
          reason: `${lyrixSection.id || "lyrix"}_second_bar_forced_dropout`
        })) {
          futureCutCount += 1;
        }
      }
    }

    const blockWindow = rule.blockNewStemActivations
      ? addActivationBlockWindow(playbackState, {
          startsAtSeconds: cutTimeSeconds,
          endsAtSeconds: blockEndSeconds,
          reason: `${lyrixSection.id || "lyrix"}_second_bar_block_new_activations`
        })
      : null;

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
    const concatArrayFields = new Set([
      "hardClashRules",
      "softMultiplierRules",
      "cutoffRules",
      "dependentActivationRules",
      "groupedActivationRules",
      "energyBaseChanceRules",
      "crescendoRules",
      "activationOpportunityRules"
    ]);

    for (const profile of profiles) {
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) continue;

      for (const [key, value] of Object.entries(profile)) {
        if (concatArrayFields.has(key) && Array.isArray(value) && Array.isArray(merged[key])) {
          merged[key] = [
            ...merged[key],
            ...value
          ];
        } else if (
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

  function escapeRulePatternForRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function doesRuleKeyPatternMatch(pattern, key) {
    const patternText = String(pattern || "");
    const targetKey = String(key || "");

    if (!patternText || !targetKey) return false;

    if (patternText.startsWith("regex:")) {
      try {
        return new RegExp(patternText.slice("regex:".length)).test(targetKey);
      } catch (error) {
        return false;
      }
    }

    if (patternText.startsWith("/") && patternText.lastIndexOf("/") > 0) {
      const finalSlashIndex = patternText.lastIndexOf("/");
      const source = patternText.slice(1, finalSlashIndex);
      const flags = patternText.slice(finalSlashIndex + 1);

      try {
        return new RegExp(source, flags).test(targetKey);
      } catch (error) {
        return false;
      }
    }

    if (patternText.includes("*") || patternText.includes("?")) {
      const source = "^" + escapeRulePatternForRegExp(patternText)
        .replace(/\\\*/g, ".*")
        .replace(/\\\?/g, ".") + "$";

      try {
        return new RegExp(source).test(targetKey);
      } catch (error) {
        return false;
      }
    }

    return targetKey.includes(patternText);
  }

  function getRuleObjectsMatchingKeyPatterns(patternMap, key) {
    const matches = [];

    for (const [pattern, rules] of Object.entries(patternMap || {})) {
      if (!rules || typeof rules !== "object") continue;
      if (doesRuleKeyPatternMatch(pattern, key)) matches.push(rules);
    }

    return matches;
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

    const byKeyPattern = getRuleMapByName(pool, [
      "byKeyPattern",
      "byKeyPatterns",
      "keyPatterns",
      "filenamePatterns",
      "filePatterns"
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
    const keyPatternRules = getRuleObjectsMatchingKeyPatterns(byKeyPattern, entry.key);
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
      ...keyPatternRules,
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
    const baseProfile = getRuleProfileForEntry(getMidiPatternRuleEntry(pattern));

    if (!isNormalMidiHatPattern(pattern)) {
      return baseProfile;
    }

    const choiceGroupId = getNormalMidiHatChoiceGroupId(pattern);
    const dropoutChance = choiceGroupId === "holdit_hats_forlyrix"
      ? 0.3
      : getNormalHatPatternDropoutChance(choiceGroupId);

    return mergeRuleProfiles(baseProfile, {
      dropoutChance
    });
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


  function getGroupedActivationRules(profile) {
    return getRuleArray(profile, [
      "groupedActivation",
      "groupedActivations",
      "groupedActivationRules",
      "activationGroups",
      "groupedWith"
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

  function getDependentActivationRules(profile) {
    return getRuleArray(profile, [
      "dependentActivationRules",
      "dependentActivations",
      "activationFollowers",
      "followerActivations",
      "activatesTargets"
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

  function getActivationOpportunityRules(profile) {
    return getRuleArray(profile, [
      "activationOpportunityRules",
      "opportunityRules",
      "allowedOpportunityRules",
      "allowedActivationOpportunityRules"
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
  function summarizePlaybackRuleMatch(item) {
    return {
      id: item.id,
      key: item.key,
      family: item.family,
      kind: item.kind,
      tags: item.tags
    };
  }

  function getDependentActivationConditionTargets(rule, fieldNames = []) {
    const containers = [
      rule,
      rule?.condition,
      rule?.conditions,
      rule?.when
    ].filter(container => container && typeof container === "object" && !Array.isArray(container));

    const targets = [];

    for (const container of containers) {
      for (const fieldName of fieldNames) {
        const rawTargets = container[fieldName];

        if (rawTargets === undefined || rawTargets === null) continue;

        const list = Array.isArray(rawTargets) ? rawTargets : [rawTargets];

        for (const rawTarget of list) {
          const target = normalizeRuleTargetFilter(rawTarget);

          if (target.key || target.family || target.tag || target.kind || target.type || target.sectionType) {
            targets.push(target);
          }
        }
      }
    }

    return targets;
  }

  function checkDependentActivationRuleConditions(playbackState, rule, timeSeconds) {
    const requiredTargets = getDependentActivationConditionTargets(rule, [
      "requiredActive",
      "requiredActiveTargets",
      "requiredActiveItems",
      "requiresActive",
      "onlyIfActive",
      "ifActive"
    ]);

    const blockedTargets = getDependentActivationConditionTargets(rule, [
      "blockedActive",
      "blockedActiveTargets",
      "blockedActiveItems",
      "blockedIfActive",
      "blockedByActive",
      "unlessActive",
      "withoutActive"
    ]);

    if (!requiredTargets.length && !blockedTargets.length) {
      return {
        allowed: true,
        reason: "",
        requiredTargets,
        blockedTargets,
        requiredMatches: [],
        blockedMatches: [],
        missingRequiredTargets: []
      };
    }

    if (!playbackState) {
      return {
        allowed: false,
        reason: "missing_playback_state",
        requiredTargets,
        blockedTargets,
        requiredMatches: [],
        blockedMatches: [],
        missingRequiredTargets: requiredTargets
      };
    }

    const requiredMatches = [];
    const missingRequiredTargets = [];

    for (const target of requiredTargets) {
      const matches = findActivePlaybackItemsForRuleTargets(playbackState, [target], timeSeconds);

      if (!matches.length) {
        missingRequiredTargets.push(target);
        continue;
      }

      requiredMatches.push(...matches.map(summarizePlaybackRuleMatch));
    }

    if (missingRequiredTargets.length) {
      return {
        allowed: false,
        reason: "missing_required_active",
        requiredTargets,
        blockedTargets,
        requiredMatches,
        blockedMatches: [],
        missingRequiredTargets
      };
    }

    const blockedMatches = findActivePlaybackItemsForRuleTargets(
      playbackState,
      blockedTargets,
      timeSeconds
    ).map(summarizePlaybackRuleMatch);

    if (blockedMatches.length) {
      return {
        allowed: false,
        reason: "blocked_active",
        requiredTargets,
        blockedTargets,
        requiredMatches,
        blockedMatches,
        missingRequiredTargets: []
      };
    }

    return {
      allowed: true,
      reason: "",
      requiredTargets,
      blockedTargets,
      requiredMatches,
      blockedMatches,
      missingRequiredTargets: []
    };
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
      return `${groupId}:section:${sectionId}`;
    }

    if (scope === "bar" || scope === "opportunity") {
      return `${groupId}:bar:${sectionId}:${localBarIndex}`;
    }

    if (scope === "time") {
      return `${groupId}:time:${startSeconds}`;
    }

    return `${groupId}:opportunity:${sectionId}:${localBarIndex}`;
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

  function cutoffContextIsCrash(context = {}) {
    const key = String(context?.itemKey || context?.key || "").toLowerCase();
    const tags = context?.itemTags instanceof Set ? context.itemTags : new Set();

    return (
      key.includes("crash") ||
      tags.has("crash") ||
      tags.has("family:crash") ||
      tags.has("jazz_crash") ||
      tags.has("rev_crash")
    );
  }

  function cutoffTargetIsBeepipe(target = {}) {
    return /beepipe|beepipes/i.test(JSON.stringify(target || {}));
  }

  function shouldSkipCutoffRuleForContextTarget(context = {}, target = {}) {
    if (!cutoffContextIsCrash(context)) return false;
    return cutoffTargetIsBeepipe(target);
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
        if (shouldSkipCutoffRuleForContextTarget(context, target)) continue;

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


    applyEnergyBaseChanceRulesToDecision(context, decision, getEnergyBaseChanceRules(profile));

    applyGroupedActivationRulesToDecision(
      playbackState,
      context,
      decision,
      getGroupedActivationRules(profile),
      random
    );
    if (decision.blocked) return decision;

    applyDensityRulesToDecision(context, decision, profile);
    applyTensionRulesToDecision(context, decision, profile);
    applyCrescendoRulesToDecision(context, decision, profile);

    return decision;
  }

  function isRepeatableLifecycleContinuationContext(context = {}, profile = {}) {
    if (!context?.lifecycleState?.activated) return false;

    const kind = String(context.kind || "");
    const key = String(context.itemKey || "").toLowerCase();
    const tags = context.itemTags instanceof Set
      ? context.itemTags
      : new Set(Array.isArray(context.itemTags) ? context.itemTags : []);

    const hasTag = (tag) => tags.has(String(tag || "").toLowerCase());

    if (!key) return false;

    if (hasTag("oneshot") || hasTag("one_shot") || hasTag("one-shot")) return false;

    if (
      hasTag("lyrix") ||
      key.startsWith("lyrix/") ||
      key.includes("_lyrix")
    ) {
      return false;
    }

    if (
      key.includes("advert") ||
      key.includes("song_blown_up") ||
      key.includes("secret_message") ||
      key.includes("pimp_triplets") ||
      key.includes("harmonia")
    ) {
      return false;
    }

    if (
      key.includes("rewind") ||
      key.includes("airhorn") ||
      key.includes("typewriter") ||
      key.includes("slackjaw") ||
      key.includes("ui_") ||
      key.includes("button")
    ) {
      return false;
    }

    if (
      key.includes("crash") ||
      key.includes("rev_crash") ||
      key.includes("crash_layer")
    ) {
      return false;
    }

    if (kind === "midi") {
      return true;
    }

    if (kind === "audio") {
      const entryType = String(context.entry?.type || "");
      return !entryType || entryType === "audio";
    }

    return false;
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
    profile = null,
    allowLifecycleContinuation = false
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

    if (decision.blocked) {
      recordRuleDecisionDebug(plan, decision);

      return {
        allowed: false,
        context,
        decision,
        profile: activeProfile
      };
    }

    const shouldContinueActiveLifecycle =
      context.lifecycleState?.activated &&
      (
        allowLifecycleContinuation ||
        isRepeatableLifecycleContinuationContext(context, activeProfile)
      );

    if (shouldContinueActiveLifecycle) {
      decision.allowed = true;
      decision.roll = null;
      decision.baseChance = 1;
      decision.chanceMultiplier = 1;
      decision.finalChance = 1;

      addRuleDecisionReason(decision, "active_repeatable_lifecycle_continues_without_activation_reroll", {
        lifecycleId: context.lifecycleId,
        itemKey: context.itemKey
      });

      recordRuleDecisionDebug(plan, decision);

      return {
        allowed: true,
        context,
        decision,
        profile: activeProfile
      };
    }

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

  function getEnergyBaseChanceRules(profile) {
    return getRuleArray(profile, [
      "energyBaseChanceRules",
      "energyActivationChanceRules",
      "baseActivationChanceRules",
      "activationChanceRules"
    ]);
  }

  function doesEnergyBaseChanceRuleMatch(rule, energyContext) {
    if (!rule || !energyContext) return false;

    if (rule.densityBand && String(rule.densityBand) !== energyContext.densityBand) return false;
    if (rule.tensionBand && String(rule.tensionBand) !== energyContext.tensionBand) return false;

    if (Number.isFinite(Number(rule.minDensity)) && energyContext.densityScore < Number(rule.minDensity)) return false;
    if (Number.isFinite(Number(rule.maxDensity)) && energyContext.densityScore > Number(rule.maxDensity)) return false;
    if (Number.isFinite(Number(rule.exclusiveMinDensity ?? rule.minDensityExclusive)) && energyContext.densityScore <= Number(rule.exclusiveMinDensity ?? rule.minDensityExclusive)) return false;
    if (Number.isFinite(Number(rule.exclusiveMaxDensity ?? rule.maxDensityExclusive)) && energyContext.densityScore >= Number(rule.exclusiveMaxDensity ?? rule.maxDensityExclusive)) return false;

    if (Number.isFinite(Number(rule.minTension)) && energyContext.tensionValue < Number(rule.minTension)) return false;
    if (Number.isFinite(Number(rule.maxTension)) && energyContext.tensionValue > Number(rule.maxTension)) return false;
    if (Number.isFinite(Number(rule.exclusiveMinTension ?? rule.minTensionExclusive)) && energyContext.tensionValue <= Number(rule.exclusiveMinTension ?? rule.minTensionExclusive)) return false;
    if (Number.isFinite(Number(rule.exclusiveMaxTension ?? rule.maxTensionExclusive)) && energyContext.tensionValue >= Number(rule.exclusiveMaxTension ?? rule.maxTensionExclusive)) return false;

    if (rule.requiresCrescendo && !energyContext.isCrescendo) return false;
    if (rule.requiresEmphasis && !energyContext.isEmphasis) return false;

    return true;
  }

  function setRuleDecisionBaseChance(decision, baseChance, code, details = {}) {
    if (!decision) return decision;

    decision.baseChance = clampProbability(baseChance, 1);
    decision.finalChance = clampProbability(decision.baseChance * decision.chanceMultiplier);

    return addRuleDecisionReason(decision, code, {
      baseChance: decision.baseChance,
      ...details
    });
  }

  function applyEnergyBaseChanceRulesToDecision(context, decision, rules = [], reasonCode = "energy_base_chance") {
    if (!context || !decision || !Array.isArray(rules)) return decision;

    const energyContext = getSectionEnergyContext(context.section);

    for (const rule of rules) {
      if (!doesEnergyBaseChanceRuleMatch(rule, energyContext)) continue;

      const rawChance = rule.baseChance ?? rule.activationChance ?? rule.chance ?? rule.finalChance;

      if (!Number.isFinite(Number(rawChance))) continue;

      setRuleDecisionBaseChance(decision, rawChance, reasonCode, {
        ruleId: rule.id || "",
        energyContext
      });
    }

    return decision;
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
  function expandDependentActivationTargets({
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
              reason: `dependent_activation_target:${sourceEntry.key}`
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

  function createFallbackCatalogEntryFromKey(key) {
    const activeKey = String(key || "");

    if (!activeKey) return null;
    if (!Array.isArray(catalog?.allKeys) || !catalog.allKeys.includes(activeKey)) return null;

    const fileName = activeKey.split("/").pop() || activeKey;
    const cleanName = fileName.replace(/\.[^.]+$/, "");
    const folder = activeKey.includes("/") ? activeKey.split("/")[0] : "";
    const extension = (fileName.match(/\.([^.]+)$/) || [])[1] || "";
    const type = extension.toLowerCase() === "mid"
      ? "midi"
      : ["wav", "mp3", "ogg", "flac", "aif", "aiff"].includes(extension.toLowerCase())
        ? "audio"
        : "unknown";

    const filenameTags = cleanName
      .toLowerCase()
      .replace(/\s*\(consolidated\)\s*/g, "")
      .replace(/#/g, " part_")
      .split(/[^a-z0-9~]+/i)
      .map(tag => tag.trim())
      .filter(Boolean);

    const tags = [...new Set([
      type,
      folder,
      ...filenameTags
    ].filter(Boolean))];

    return {
      key: activeKey,
      type,
      folder,
      family: cleanName,
      tags,
      fallbackFromAllKeys: true
    };
  }

  function getCatalogEntry(key) {
    const activeKey = String(key || "");
    const directEntry = catalog.entriesByKey.get(activeKey);

    if (directEntry) return directEntry;

    const fallbackEntry = createFallbackCatalogEntryFromKey(activeKey);

    if (fallbackEntry) {
      catalog.entriesByKey.set(activeKey, fallbackEntry);
      return fallbackEntry;
    }

    return null;
  }

  function getAllCatalogEntries() {
    const entryKeys = Array.isArray(catalog?.entries)
      ? catalog.entries.map(entry => entry?.key).filter(Boolean)
      : [];

    const keys = entryKeys.length
      ? entryKeys
      : (Array.isArray(catalog?.allKeys) ? catalog.allKeys : []);

    return keys
      .map(key => getCatalogEntry(key))
      .filter(Boolean);
  }

  function getFileStemWithoutExtension(key) {
    return String(key || "")
      .split("/")
      .pop()
      .replace(/\.[^.]+$/, "")
      .replace(/\s*\(consolidated\)\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getExplicitPartNumberFromKey(key) {
    const match = String(key || "").match(/(?:^|[\s_#-])#?(\d+)(?=\s*(?:\(|\.|$))/);
    const hashMatch = String(key || "").match(/#\s*(\d+)/);

    if (hashMatch) return Number(hashMatch[1]);
    if (match && /#/.test(match[0])) return Number(match[1]);

    return null;
  }

  function getAudioSequenceRootKey(key) {
    const activeKey = String(key || "");
    const folder = activeKey.includes("/") ? activeKey.split("/")[0] : "";

    const stem = getFileStemWithoutExtension(activeKey)
      .replace(/\s*#\s*\d+\s*$/i, "")
      .replace(/[_\s-]+(?:odd|even|x\d+(?:\.\d+)?)+$/gi, "")
      .replace(/[_\s-]+(?:odd|even|x\d+(?:\.\d+)?)+$/gi, "")
      .replace(/[_\s-]+(?:odd|even|x\d+(?:\.\d+)?)+$/gi, "")
      .replace(/\s+/g, " ")
      .replace(/[_\s-]+$/g, "")
      .trim()
      .toLowerCase();

    return `${folder}/${stem}`;
  }

  function getAudioSequencePartNumber(entry) {
    const explicitPart = Number(entry?.partNumber || getExplicitPartNumberFromKey(entry?.key));

    if (Number.isFinite(explicitPart) && explicitPart > 0) {
      return explicitPart;
    }

    return 1;
  }

  function buildAudioSequenceGroups() {
    const groups = new Map();

    for (const entry of getAllCatalogEntries()) {
      if (!entry || !isAudio(entry) || isLyrix(entry)) continue;

      const key = entry.key;
      const partNumber = getAudioSequencePartNumber(entry);
      const rootKey = getAudioSequenceRootKey(key);

      if (!rootKey) continue;

      if (!groups.has(rootKey)) {
        groups.set(rootKey, []);
      }

      groups.get(rootKey).push({
        key,
        entry,
        partNumber
      });
    }

    for (const [rootKey, items] of groups.entries()) {
      const uniqueByPart = new Map();

      for (const item of items) {
        if (!uniqueByPart.has(item.partNumber)) {
          uniqueByPart.set(item.partNumber, item);
        }
      }

      const sorted = [...uniqueByPart.values()]
        .sort((a, b) => a.partNumber - b.partNumber);

      groups.set(rootKey, sorted);
    }

    return groups;
  }

  function getAudioSequenceGroups() {
    if (!catalog.audioSequenceGroups) {
      catalog.audioSequenceGroups = buildAudioSequenceGroups();
    }

    return catalog.audioSequenceGroups;
  }

  function getAudioSequenceForEntry(entry) {
    if (!entry?.key || isLyrix(entry)) return [];

    const groups = getAudioSequenceGroups();
    const rootKey = getAudioSequenceRootKey(entry.key);
    const group = groups.get(rootKey) || [];

    return group;
  }

  function isFirstAudioSequencePart(entry) {
    const sequence = getAudioSequenceForEntry(entry);

    if (sequence.length <= 1) return true;

    return sequence[0]?.key === entry?.key;
  }

  function isIndependentNumberedAudioPartsEntry(entry) {
    const key = String(entry?.key || "").toLowerCase();
    const tags = Array.isArray(entry?.tags) ? entry.tags.map(tag => String(tag).toLowerCase()) : [];

    return (
      tags.includes("independent_parts") ||
      key.includes("breathe_vox_stutter") ||
      key.includes("synth_glitch")
    );
  }

  function getNormalNumberedAudioSequenceForEntry(entry) {
    if (!entry || !isAudio(entry) || isLyrix(entry)) return [];
    if (isIndependentNumberedAudioPartsEntry(entry)) return [];

    const sequence = getAudioSequenceForEntry(entry);

    if (sequence.length <= 1) return [];
    if (sequence[0]?.partNumber !== 1) return [];
    if (!sequence.some(item => item.partNumber > 1)) return [];

    return sequence;
  }

  function shouldScheduleNormalAudioSequenceAsGroup(entry) {
    const sequence = getNormalNumberedAudioSequenceForEntry(entry);

    return Boolean(sequence.length && sequence[0]?.key === entry?.key);
  }

  function shouldSkipIndividualNormalAudioSequencePart(entry) {
    const sequence = getNormalNumberedAudioSequenceForEntry(entry);

    return Boolean(sequence.length && sequence[0]?.key !== entry?.key);
  }

  function getForcedNumberedSequenceTestKey() {
    const rawValue = getRuleUrlParam("forceNumberedSequence") || getRuleUrlParam("forceSequence");

    if (!rawValue) return "";

    const value = String(rawValue).trim();
    const normalized = value.toLowerCase().replace(/\s+/g, "_");

    const aliases = {
      "synth_downsampled": "samples/synth_downsampled_odd_xtra (consolidated).wav",
      "downsampled": "samples/synth_downsampled_odd_xtra (consolidated).wav",
      "gtar_1": "samples/gtar_1 #2 (consolidated).wav",
      "ah_highest": "samples/ah_highest_main (consolidated).wav",
      "trumpet_hook": "samples/trumpet_hook_odd_x4 (consolidated).wav"
    };

    if (aliases[normalized]) return aliases[normalized];
    if (getCatalogEntry(value)) return value;

    return "";
  }

  function expandSelectedAudioSequences({
    random,
    selectedAudio = null,
    globalInclusionState = null,
    requiredActivationState = null
  } = {}) {
    if (!selectedAudio) return 0;

    let addedCount = 0;
    const selectedKeys = [...selectedAudio];

    for (const selectedKey of selectedKeys) {
      const selectedEntry = getCatalogEntry(selectedKey);
      const sequence = getNormalNumberedAudioSequenceForEntry(selectedEntry);

      if (!sequence.length) continue;

      for (const item of sequence) {
        const hadKey = selectedAudio.has(item.key);

        forceIncludeAudioSelection({
          random,
          globalInclusionState,
          requiredActivationState,
          selectedAudio,
          key: item.key,
          reason: `forced_audio_sequence:${getAudioSequenceRootKey(selectedEntry.key)}`
        });

        if (!hadKey && selectedAudio.has(item.key)) {
          addedCount += 1;
        }
      }
    }

    return addedCount;
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

  function getTrueBassFamily(entryOrKey) {
    const key = typeof entryOrKey === "string"
      ? entryOrKey.toLowerCase()
      : String(entryOrKey?.key || "").toLowerCase();

    if (!key) return "";
    if (key.includes("real_bass")) return "real_bass";
    if (key.includes("synth_bass")) return "synth_bass";
    if (key.includes("nuva_bass")) return "nuva_bass";

    const isLowCello =
      key.includes("cello") &&
      !key.includes("cello_high") &&
      !key.includes("wiv-bass") &&
      !key.includes("wiv_bass");

    if (isLowCello) return "low_cello";

    return "";
  }

  function isTrueBass(entry) {
    return Boolean(getTrueBassFamily(entry));
  }

  function shouldUseTrueBassCentralScheduler(entry, section) {
    return Boolean(
      entry &&
      section &&
      section.type === "normal" &&
      !isHookSection(section) &&
      isTrueBass(entry)
    );
  }

  function getCentralInstrumentFamily(entryOrKey) {
    const key = typeof entryOrKey === "string"
      ? entryOrKey.toLowerCase()
      : String(entryOrKey?.key || "").toLowerCase();

    const family = typeof entryOrKey === "string"
      ? ""
      : normalizeRuleDecisionToken(entryOrKey?.family || "");

    if (family === "gtar" || key.includes("/gtar_")) return "gtar";

    if ((family === "sax" || key.includes("/sax_")) && !key.includes("hook")) {
      return "sax";
    }

    return "";
  }

  function isCentralInstrumentFamilyEntry(entry) {
    return Boolean(getCentralInstrumentFamily(entry));
  }

  function isCentralInstrumentFamilyFirstPartCandidate(entry) {
    return Boolean(
      entry &&
      isAudio(entry) &&
      !isLyrix(entry) &&
      entry.folder === "samples" &&
      getCentralInstrumentFamily(entry) &&
      !String(entry.key || "").toLowerCase().includes("hook") &&
      isFirstAudioSequencePart(entry)
    );
  }

  function getCentralInstrumentFamilyConfig(family) {
    if (family === "gtar") {
      return {
        family,
        globalInclusionChance: 0.3,
        activationChance: 0.1,
        dropoutChance: 0.5,
        shutoffChance: 0,
        shutoffEveryBars: 12,
        shutoffLengthBars: 12
      };
    }

    if (family === "sax") {
      return {
        family,
        globalInclusionChance: 0.6,
        activationChance: 0.3,
        dropoutChance: 0.5,
        shutoffChance: 0,
        shutoffEveryBars: 12,
        shutoffLengthBars: 12
      };
    }

    return null;
  }

  function getCentralInstrumentFamilyCandidateEntries(family) {
    return getAllCatalogEntries().filter(entry =>
      isCentralInstrumentFamilyFirstPartCandidate(entry) &&
      getCentralInstrumentFamily(entry) === family
    );
  }

  function selectedAudioHasTrueBassFamily(selectedAudio, family) {
    if (!selectedAudio) return false;

    for (const key of selectedAudio) {
      const entry = getCatalogEntry(key);
      if (getTrueBassFamily(entry) === family) return true;
    }

    return false;
  }

  function isTrueBassCentralCandidateForSection(entry, section) {
    if (!shouldUseTrueBassCentralScheduler(entry, section)) return false;

    const key = entry.key.toLowerCase();

    // Section-specific bass material is handled by its own section systems, not normal true-bass scheduling.
    if (key.includes("grm_")) return false;
    if (key.includes("drop_") || key.includes("dropped_")) return false;
    if (key.includes("outburst")) return false;
    if (key.includes("hook")) return false;

    return audioMatchesSection(entry, section);
  }

  function getTrueBassFamilyWeight(family) {
    if (family === "nuva_bass") return 0.2;
    if (family === "real_bass") return 0.3;
    if (family === "synth_bass") return 0.25;
    if (family === "low_cello") return 0.25;
    return 0;
  }

  function chooseWeightedTrueBassItem(random, items, getWeight) {
    const weighted = items
      .map(item => ({
        item,
        weight: Math.max(0, Number(getWeight(item)) || 0)
      }))
      .filter(item => item.weight > 0);

    if (!weighted.length) return null;

    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = random() * total;

    for (const weightedItem of weighted) {
      roll -= weightedItem.weight;
      if (roll <= 0) return weightedItem.item;
    }

    return weighted[weighted.length - 1].item;
  }

  function getOrCreateTrueBassSystemState(playbackState, random, plan) {
    if (!playbackState) return null;
    if (playbackState.trueBassSystem) return playbackState.trueBassSystem;

    const familiesInVersion = new Set();

    for (const key of plan?.selectedAudio || []) {
      const entry = getCatalogEntry(key);
      const family = getTrueBassFamily(entry);
      if (family) familiesInVersion.add(family);
    }

    let includedFamilies = [...familiesInVersion].filter(family => getTrueBassFamilyWeight(family) > 0);
    let excludedFamily = "";
    let nuvaOnly = false;

    if (includedFamilies.includes("nuva_bass") && random() < 0.05) {
      includedFamilies = ["nuva_bass"];
      nuvaOnly = true;
    } else if (includedFamilies.length > 1 && random() < 0.5) {
      excludedFamily = chooseOne(random, includedFamilies);
      includedFamilies = includedFamilies.filter(family => family !== excludedFamily);
    }

    playbackState.trueBassSystem = {
      includedFamilies,
      excludedFamily,
      nuvaOnly,
      activeFamily: "",
      nextAllowedStartSeconds: -Infinity,
      debug: []
    };

    return playbackState.trueBassSystem;
  }

  function getTrueBassCandidatesForOpportunity({ plan, buffers, section, localBarIndex }) {
    const candidates = [];

    for (const key of plan?.selectedAudio || []) {
      const entry = getCatalogEntry(key);
      if (!entry || !isTrueBassCentralCandidateForSection(entry, section)) continue;
      if (!buffers?.get(key)) continue;

      const profile = getRuleProfileForEntry(entry);
      const allowedBars = getAllowedLocalBarIndexesForKey(key, section, profile);

      if (!allowedBars.includes(localBarIndex)) continue;

      candidates.push({
        key,
        entry,
        profile,
        family: getTrueBassFamily(entry)
      });
    }

    return candidates;
  }

  function chooseTrueBassCandidateFromFamily(random, candidates, family) {
    const familyCandidates = candidates.filter(candidate => candidate.family === family);
    if (!familyCandidates.length) return null;

    return chooseOne(random, familyCandidates);
  }

  function scheduleTrueBassSystemInSection({
    offlineContext,
    destination,
    buffers,
    plan,
    random,
    playbackState,
    lifecycleStates,
    section
  }) {
    if (!section || section.type !== "normal") return 0;

    const system = getOrCreateTrueBassSystemState(playbackState, random, plan);
    if (!system || !system.includedFamilies.length) return 0;

    let scheduledCount = 0;

    if (!Array.isArray(section.trueBassSystemDebug)) {
      section.trueBassSystemDebug = [];
    }

    for (let localBarIndex = 0; localBarIndex < section.bars; localBarIndex += 1) {
      const startSeconds = section.startSeconds + localBarIndex * section.barSeconds;

      if (startSeconds < system.nextAllowedStartSeconds - 0.001) {
        continue;
      }

      const candidates = getTrueBassCandidatesForOpportunity({
        plan,
        buffers,
        section,
        localBarIndex
      }).filter(candidate => system.includedFamilies.includes(candidate.family));

      if (!candidates.length) continue;

      const availableFamilies = [...new Set(candidates.map(candidate => candidate.family))];

      if (system.activeFamily && !availableFamilies.includes(system.activeFamily)) {
        system.activeFamily = "";
      }

      if (system.activeFamily) {
        if (random() < 0.01) {
          section.trueBassSystemDebug.push({
            event: "true_bass_family_dropout",
            family: system.activeFamily,
            localBarIndex,
            startSeconds,
            dropoutChance: 0.01
          });

          system.activeFamily = "";
        } else if (
          (system.activeFamily === "real_bass" || system.activeFamily === "synth_bass") &&
          random() < 0.005
        ) {
          const interchangeTarget = system.activeFamily === "real_bass" ? "synth_bass" : "real_bass";

          if (
            system.includedFamilies.includes(interchangeTarget) &&
            availableFamilies.includes(interchangeTarget)
          ) {
            section.trueBassSystemDebug.push({
              event: "true_bass_real_synth_interchange",
              fromFamily: system.activeFamily,
              toFamily: interchangeTarget,
              localBarIndex,
              startSeconds,
              interchangeChance: 0.005
            });

            system.activeFamily = interchangeTarget;
          }
        }
      }

      if (!system.activeFamily) {
        if (random() >= 0.9) {
          section.trueBassSystemDebug.push({
            event: "true_bass_target_coverage_gap",
            localBarIndex,
            startSeconds,
            targetCoverageChance: 0.9
          });

          continue;
        }

        const chosenFamily = chooseWeightedTrueBassItem(
          random,
          availableFamilies,
          family => getTrueBassFamilyWeight(family)
        );

        if (!chosenFamily) continue;

        system.activeFamily = chosenFamily;

        section.trueBassSystemDebug.push({
          event: "true_bass_family_activated",
          family: system.activeFamily,
          localBarIndex,
          startSeconds,
          targetCoverageChance: 0.9
        });
      }

      const candidate = chooseTrueBassCandidateFromFamily(random, candidates, system.activeFamily);
      if (!candidate) continue;

      const buffer = buffers.get(candidate.key);
      if (!buffer) continue;

      const scheduled = scheduleAudioBufferWithPlaybackState({
        offlineContext,
        destination,
        buffer,
        startTime: startSeconds,
        gainValue: sectionGainForAudio(candidate.entry, section),
        playbackState,
        key: candidate.key,
        entry: candidate.entry,
        section
      });

      if (!scheduled) continue;

      scheduledCount += 1;
      // True bass scheduling is bar/opportunity based.
      // Do not treat quiet exported file tails as logical overlap unless a definition explicitly says to.
      system.nextAllowedStartSeconds = startSeconds + section.barSeconds;

      const lifecycleId = getAudioLifecycleId(candidate.key);

      if (lifecycleStates && lifecycleId) {
        activateLifecycleItem(
          lifecycleStates,
          lifecycleId,
          `${section.id}:${candidate.key}:${localBarIndex}:true_bass_family_system`
        );
      }

      section.trueBassSystemDebug.push({
        event: "true_bass_stem_scheduled",
        family: system.activeFamily,
        key: candidate.key,
        localBarIndex,
        startSeconds,
        endTime: scheduled.endTime
      });
    }

    return scheduledCount;
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

  const JAZZ_HOOK_HATS_RIDE04_FILE = "midi files/jazz_hats_metal_hook_even_~_ride04.mid";
  const JAZZ_HOOK_HATS_RIDEHARD_FILE = "midi files/jazz_hats_metal_hook_even_~_ridehard.mid";
  const JAZZ_GHOST_RIDES_FILE = "midi files/jazz_ghost_rides_metal_ride04.mid";
  const JAZZ_RIDE_WITH_HATS_FILE = "midi files/jazz_rides_wiv-jazz-hats_metal_ridehard.mid";
  const JAZZ_RIDE_WITH_HATS_AND_CRASH_FILE = "midi files/jazz_ride_wiv-jazz_hats_wiv-jazz_crash_metal_odd_ridehard.mid";

  function isJazzRideWithHatsVariantPattern(pattern) {
    const file = String(pattern?.file || "");
    return file === JAZZ_RIDE_WITH_HATS_FILE || file === JAZZ_RIDE_WITH_HATS_AND_CRASH_FILE;
  }

  function isHookJazzHatsPattern(pattern) {
    const file = String(pattern?.file || "");
    return file === JAZZ_HOOK_HATS_RIDE04_FILE || file === JAZZ_HOOK_HATS_RIDEHARD_FILE;
  }

  function getHookJazzHatsPairFromSectionMidi(sectionMidi) {
    const ride04 = sectionMidi.find(pattern => pattern.file === JAZZ_HOOK_HATS_RIDE04_FILE);
    const ridehard = sectionMidi.find(pattern => pattern.file === JAZZ_HOOK_HATS_RIDEHARD_FILE);
    return ride04 && ridehard ? [ride04, ridehard] : [];
  }

  function sectionHasScheduledJazzCrash(section) {
    const scheduledAudioKeys = Array.isArray(section?.scheduledAudioKeys) ? section.scheduledAudioKeys : [];
    const scheduledAudio = Array.isArray(section?.scheduledAudio) ? section.scheduledAudio : [];

    if (scheduledAudioKeys.some(key => String(key).toLowerCase().includes("jazz_crash"))) {
      return true;
    }

    return scheduledAudio.some(item => {
      const key = String(item?.key || "").toLowerCase();
      const tags = Array.isArray(item?.tags) ? item.tags.map(tag => normalizeRuleDecisionToken(tag)) : [];

      return key.includes("jazz_crash") || tags.includes("jazz_crash");
    });
  }

  function chooseJazzRideWithHatsVariantForSection(section, sectionMidi) {
    const defaultRide = sectionMidi.find(pattern => pattern.file === JAZZ_RIDE_WITH_HATS_FILE);
    const crashRide = sectionMidi.find(pattern => pattern.file === JAZZ_RIDE_WITH_HATS_AND_CRASH_FILE);

    return sectionHasScheduledJazzCrash(section) && crashRide ? crashRide : defaultRide;
  }

  function isJazzMidiHatPattern(pattern) {
    const family = getMidiPatternRuleFamily(pattern);
    const tags = getMidiPatternRuleTagList(pattern).map(tag => normalizeRuleDecisionToken(tag));
    const key = String(pattern?.file || pattern?.id || "").toLowerCase();

    return (
      family === "jazz_hats" ||
      family === "jazz_rides" ||
      family === "jazz_ghost_rides" ||
      tags.includes("jazz_hats") ||
      tags.includes("jazz_rides") ||
      tags.includes("jazz_ghost_rides") ||
      key.includes("jazz_")
    );
  }

  function isNormalMidiHatPattern(pattern) {
    const tags = getMidiPatternRuleTagList(pattern).map(tag => normalizeRuleDecisionToken(tag));
    const key = String(pattern?.file || pattern?.id || "").toLowerCase();

    return tags.includes("hats") && key.includes("hats") && !isJazzMidiHatPattern(pattern);
  }

  function getNormalMidiHatCompanionGroupId(pattern) {
    if (!isNormalMidiHatPattern(pattern)) return "";
    return normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));
  }

  function getNormalHatPatternDropoutChance(choiceGroupId) {
  if (
    choiceGroupId === "trap_hats" ||
    choiceGroupId === "holdit_hats" ||
    choiceGroupId === "messy_hats_fast" ||
    choiceGroupId === "messy_hats_fast_ends_in_main_hats"
  ) {
    return 0.2;
  }

  return 0.02;
}
function getNormalHatChoiceWeight(choiceGroupId, section) {
  const baseWeights = new Map([
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

  let weight = baseWeights.get(choiceGroupId) || 1;
  const sectionTension = Number.isFinite(section?.tension) ? section.tension : 0;

  if (sectionTension > 0.2) {
    if (choiceGroupId === "messy_hats") weight *= 0.9;
    if (choiceGroupId === "speedy_hats") weight *= 1.1;
  } else if (sectionTension < 0.2) {
    if (choiceGroupId === "messy_hats") weight *= 1.1;
    if (choiceGroupId === "speedy_hats") weight *= 0.9;
  }

  return weight;
}
function isRimMidiPattern(pattern) {
  const entry = getMidiPatternRuleEntry(pattern);
  const tags = getMidiPatternRuleTagList(pattern);
  const baseId = normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));
  const key = normalizeRuleDecisionToken(entry?.key || pattern?.file || "");
  const hasRimTag = tags.some(tag => normalizeRuleDecisionToken(tag) === "rim");

  return hasRimTag || baseId.includes("rim") || key.includes("rim");
}

function isExtraRimMidiPattern(pattern) {
  const baseId = normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));
  const key = normalizeRuleDecisionToken(pattern?.file || "");

  return baseId.startsWith("rims_xtra") || key.includes("rims_xtra");
}

function isRimsDrumsRimMidiPattern(pattern) {
  const baseId = normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));
  const key = normalizeRuleDecisionToken(pattern?.file || "");

  return baseId === "rims_drums_rim" || key.includes("rims_drums_rim");
}

function midiFileTriggersRimsDrumsRimFirstNoteMute(file) {
  const rawKey = String(file || "").toLowerCase();
  const key = normalizeRuleDecisionToken(file || "");

  return (
    key.includes("pre_snare") ||
    key.includes("presnare") ||
    rawKey.includes("pre-snare") ||
    key.includes("snare_xtra") ||
    key.includes("jazz_crash") ||
    key.includes("crash")
  );
}

function isMainHookSection(section) {
  return String(section?.type || "").toLowerCase() === "hook";
}

function isHookDrumsSkipIntroSection(section) {
  return String(section?.type || "").toLowerCase() === "hook_drums_skip_intro";
}

function isHookStartedAfterDrumsSkipIntro(section) {
  return Array.isArray(section?.tags) && section.tags.some(tag =>
    String(tag || "").toLowerCase() === "hook_drums_skip_intro"
  );
}

function shouldUseHookIntroCrash(section) {
  return isMainHookSection(section) && !isHookStartedAfterDrumsSkipIntro(section);
}

function isSectionForcedAudioStartKey(section, key) {
  return Array.isArray(section?.forcedAudioStartKeys) && section.forcedAudioStartKeys.includes(key);
}

function getOrCreateCentralInstrumentFamilySystemState(playbackState, family) {
  if (!playbackState) return null;

  if (!playbackState.centralInstrumentFamilySystems) {
    playbackState.centralInstrumentFamilySystems = new Map();
  }

  if (!playbackState.centralInstrumentFamilySystems.has(family)) {
    playbackState.centralInstrumentFamilySystems.set(family, {
      family,
      active: false,
      lastActivatedKey: "",
      nextAllowedStartSeconds: -Infinity,
      blockedUntilTrackBar: 0,
      lastShutoffBlockIndex: -1
    });
  }

  return playbackState.centralInstrumentFamilySystems.get(family);
}

function recordCentralInstrumentFamilyDebug(section, event) {
  if (!section) return;

  if (!Array.isArray(section.centralInstrumentFamilyDebug)) {
    section.centralInstrumentFamilyDebug = [];
  }

  section.centralInstrumentFamilyDebug.push(event);
}

function applyCentralInstrumentFamilyShutoff({
  state,
  family,
  section,
  localBarIndex,
  random
} = {}) {
  const config = getCentralInstrumentFamilyConfig(family);
  if (!state || !config || !section) return false;

  const trackBar = Math.max(1, Number(section.trackStartBar || 1) + Number(localBarIndex || 0));
  const blockLength = Math.max(1, Number(config.shutoffEveryBars) || 12);
  const blockIndex = Math.floor((trackBar - 1) / blockLength);
  const blockStartTrackBar = blockIndex * blockLength + 1;

  if (state.lastShutoffBlockIndex !== blockIndex) {
    state.lastShutoffBlockIndex = blockIndex;

    const roll = typeof random === "function" ? random() : 1;
    const shutoff = roll < config.shutoffChance;

    if (shutoff) {
      state.blockedUntilTrackBar = blockStartTrackBar + Math.max(1, Number(config.shutoffLengthBars) || 12);
      state.active = false;
    }

    recordCentralInstrumentFamilyDebug(section, {
      event: "central_instrument_family_12_bar_shutoff_roll",
      family,
      trackBar,
      blockStartTrackBar,
      roll,
      shutoffChance: config.shutoffChance,
      shutoff,
      blockedUntilTrackBar: state.blockedUntilTrackBar
    });
  }

  return trackBar < state.blockedUntilTrackBar;
}

function getCentralInstrumentFamilyCandidatesForOpportunity({
  plan,
  buffers,
  section,
  localBarIndex,
  family
} = {}) {
  const candidates = [];

  if (!section || section.type !== "normal") return candidates;

  for (const key of plan?.selectedAudio || []) {
    const entry = getCatalogEntry(key);
    if (!entry || !isCentralInstrumentFamilyFirstPartCandidate(entry)) continue;
    if (getCentralInstrumentFamily(entry) !== family) continue;
    if (!buffers?.get(key)) continue;

    const profile = getRuleProfileForEntry(entry);
    const allowedBars = getAllowedLocalBarIndexesForKey(key, section, profile);

    if (!allowedBars.includes(localBarIndex)) continue;

    candidates.push({
      key,
      entry,
      profile,
      family
    });
  }

  return candidates;
}

function scheduleCentralInstrumentFamilyCandidate({
  offlineContext,
  destination,
  buffers,
  random,
  plan = null,
  playbackState = null,
  lifecycleStates = null,
  section,
  candidate,
  startSeconds,
  decisionContext = null
} = {}) {
  if (!candidate?.entry || !section) return { scheduledCount: 0, endTime: startSeconds };

  const sequence = getNormalNumberedAudioSequenceForEntry(candidate.entry);
  const sequenceItems = sequence.length && sequence[0]?.key === candidate.entry.key
    ? sequence
    : [{ key: candidate.key, entry: candidate.entry, partNumber: 1 }];

  let scheduledCount = 0;
  let partStartSeconds = startSeconds;
  let latestEndTime = startSeconds;

  for (const sequenceItem of sequenceItems) {
    const partEntry = sequenceItem.entry || getCatalogEntry(sequenceItem.key);
    const partBuffer = buffers?.get(sequenceItem.key);

    if (!partEntry || !partBuffer) continue;

    const scheduled = scheduleAudioBufferWithPlaybackState({
      offlineContext,
      destination,
      buffer: partBuffer,
      startTime: partStartSeconds,
      gainValue: sectionGainForAudio(partEntry, section),
      playbackState,
      key: sequenceItem.key,
      entry: partEntry,
      section,
      family: getCentralInstrumentFamily(partEntry)
    });

    if (!scheduled?.scheduled) continue;

    scheduledCount += 1;
    latestEndTime = Math.max(latestEndTime, scheduled.endTime);

    recordSectionScheduledAudio(section, {
      key: sequenceItem.key,
      entry: partEntry,
      scheduleHandle: scheduled,
      family: getCentralInstrumentFamily(partEntry)
    });

    if (lifecycleStates) {
      activateLifecycleItem(
        lifecycleStates,
        getAudioLifecycleId(sequenceItem.key),
        `${section.id}:${sequenceItem.key}:central_instrument_family_system`
      );
    }

    scheduleDependentActivationFollowersForAudio({
      offlineContext,
      destination,
      buffers,
      random,
      plan,
      playbackState,
      lifecycleStates,
      section,
      sourceContext: decisionContext,
      sourceProfile: getRuleProfileForEntry(partEntry),
      sourceKey: sequenceItem.key,
      startSeconds: partStartSeconds
    });

    partStartSeconds = scheduled.endTime;
  }

  return {
    scheduledCount,
    endTime: latestEndTime
  };
}

function scheduleCentralInstrumentFamilySystemsInSection({
  offlineContext,
  destination,
  buffers,
  plan,
  random,
  playbackState,
  lifecycleStates,
  section
} = {}) {
  if (!section || section.type !== "normal") return 0;

  let scheduledCount = 0;

  for (let localBarIndex = 0; localBarIndex < section.bars; localBarIndex += 1) {
    const startSeconds = section.startSeconds + localBarIndex * section.barSeconds;

    for (const family of ["sax", "gtar"]) {
      const config = getCentralInstrumentFamilyConfig(family);
      const state = getOrCreateCentralInstrumentFamilySystemState(playbackState, family);

      if (!config || !state) continue;

      const candidates = getCentralInstrumentFamilyCandidatesForOpportunity({
        plan,
        buffers,
        section,
        localBarIndex,
        family
      });

      if (!candidates.length) continue;

      if (applyCentralInstrumentFamilyShutoff({
        state,
        family,
        section,
        localBarIndex,
        random
      })) {
        recordCentralInstrumentFamilyDebug(section, {
          event: "central_instrument_family_blocked_by_12_bar_shutoff",
          family,
          localBarIndex,
          startSeconds,
          blockedUntilTrackBar: state.blockedUntilTrackBar
        });
        continue;
      }

      if (startSeconds < state.nextAllowedStartSeconds - 0.001) {
        continue;
      }

      if (state.active) {
        const dropoutRoll = typeof random === "function" ? random() : 1;

        if (dropoutRoll < config.dropoutChance) {
          state.active = false;

          recordCentralInstrumentFamilyDebug(section, {
            event: "central_instrument_family_dropout",
            family,
            localBarIndex,
            startSeconds,
            dropoutRoll,
            dropoutChance: config.dropoutChance
          });

          continue;
        }
      }

      let baseChance = state.active ? 1 : config.activationChance;

      if (
        family === "gtar" &&
        getActivePlaybackItemsAtTime(playbackState, startSeconds, { family: "real_bass" }).length
      ) {
        baseChance = clampProbability(baseChance * 2);
      }

      const candidate = chooseOne(random, candidates);
      if (!candidate) continue;

      const decisionResult = resolveRuleProfileDecision({
        random,
        plan,
        playbackState,
        kind: "audio",
        key: candidate.key,
        entry: candidate.entry,
        section,
        lifecycleStates,
        localBarIndex,
        startSeconds,
        baseChance,
        profile: candidate.profile,
        allowLifecycleContinuation: true
      });

      if (!decisionResult.allowed) {
        if (state.active) state.active = false;

        recordCentralInstrumentFamilyDebug(section, {
          event: "central_instrument_family_decision_blocked",
          family,
          key: candidate.key,
          localBarIndex,
          startSeconds,
          reasonCodes: decisionResult.decision?.reasonCodes || []
        });

        continue;
      }

      const scheduled = scheduleCentralInstrumentFamilyCandidate({
        offlineContext,
        destination,
        buffers,
        random,
        plan,
        playbackState,
        lifecycleStates,
        section,
        candidate,
        startSeconds,
        decisionContext: decisionResult.context
      });

      if (scheduled.scheduledCount <= 0) continue;

      scheduledCount += scheduled.scheduledCount;
      state.active = true;
      state.lastActivatedKey = candidate.key;

      const gapBars = family === "gtar"
        ? Math.floor((typeof random === "function" ? random() : 0) * 3)
        : 0;

      state.nextAllowedStartSeconds = scheduled.endTime + gapBars * section.barSeconds;

      recordCentralInstrumentFamilyDebug(section, {
        event: "central_instrument_family_scheduled",
        family,
        key: candidate.key,
        localBarIndex,
        startSeconds,
        endTime: scheduled.endTime,
        scheduledCount: scheduled.scheduledCount,
        gapBars,
        nextAllowedStartSeconds: state.nextAllowedStartSeconds
      });
    }
  }

  return scheduledCount;
}

function getHookSynthBassSequenceKeys(section = null) {
  const keys = Array.isArray(section?.forcedHookSynthBassSequenceKeys)
    ? section.forcedHookSynthBassSequenceKeys
    : [
        "samples/synth_bass_1_hook_odd_x4 (consolidated).wav",
        "samples/synth_bass_1_hook #2 (consolidated).wav",
        "samples/synth_bass_1_hook #3 (consolidated).wav",
        "samples/synth_bass_2_hook_x4_even (consolidated).wav"
      ];

  return keys.filter(Boolean);
}

function isHookSynthBassSequenceKey(section, key) {
  return getHookSynthBassSequenceKeys(section).includes(key);
}

function isHookSynthBassSequenceTriggerKey(section, key) {
  return getHookSynthBassSequenceKeys(section)[0] === key;
}

function isCrashKey(key) {
  return String(key || "").toLowerCase().includes("crash");
}

function isFirstBarAfterHookDrumsSkipIntro(section, localBarIndex = null) {
  return isHookStartedAfterDrumsSkipIntro(section) && Number(localBarIndex) === 0;
}

function shouldBlockHookAfterSkipFirstBarAudioKey(key, section, localBarIndex = null) {
  return isFirstBarAfterHookDrumsSkipIntro(section, localBarIndex) && isCrashKey(key);
}

function shouldBlockHookAfterSkipFirstBarMidiPattern(pattern, section, localBarIndex = null) {
  return isFirstBarAfterHookDrumsSkipIntro(section, localBarIndex) && isCrashKey(pattern?.file);
}

function isFirstActiveHookBar(section, localBarIndex = null) {
  return isMainHookSection(section) && Number(localBarIndex) === 0;
}

function isHookCrashIntroMidiPattern(pattern) {
  return pattern?.file === "midi files/crash_small_hook_intro_metal_odd_crash.mid";
}

function isNormalHookCrashMidiPattern(pattern) {
  return pattern?.file === "midi files/crash_hook_metal_odd_crash.mid";
}

function isHookHatsMidiPattern(pattern) {
  const file = String(pattern?.file || "").toLowerCase();

  return file.startsWith("midi files/hats_hook_metal_");
}

function shouldSkipMidiPatternAtSectionBar(pattern, section, localBarIndex = null) {
  if (!isFirstActiveHookBar(section, localBarIndex)) {
    return false;
  }

  if (shouldBlockHookAfterSkipFirstBarMidiPattern(pattern, section, localBarIndex)) {
    return true;
  }

  // First active hook bar uses crash_small_hook_intro instead of the normal hook crash.
  return isNormalHookCrashMidiPattern(pattern);
}

function getSectionMidiAllowedNoteIndexes(section, file) {
  const rules = section?.midiAllowedNoteIndexes || {};
  const indexes = rules[file];

  if (!Array.isArray(indexes)) return null;

  return new Set(indexes.map(Number));
}

function isSectionForcedMidiPattern(section, file) {
  return Array.isArray(section?.forcedMidi) && section.forcedMidi.includes(file);
}

function getSectionMidiForcedLocalBars(section, file) {
  const rules = section?.midiForcedLocalBars || {};
  const bars = rules[file];

  if (!Array.isArray(bars)) return null;

  return new Set(bars.map(Number));
}

function isForcedMidiLocalBarAllowed(section, file, localBarIndex) {
  const allowedBars = getSectionMidiForcedLocalBars(section, file);

  return !allowedBars || allowedBars.has(Number(localBarIndex));
}

function addForcedMidiToSection(section, sectionSelectedMidi, selectedMidi, midiPatternPool, file, options = {}) {
  const pattern = midiPatternPool.find(item => item.file === file);

  if (!pattern) return false;

  sectionSelectedMidi.add(file);
  selectedMidi.add(file);

  section.forcedMidi = Array.isArray(section.forcedMidi) ? section.forcedMidi : [];
  if (!section.forcedMidi.includes(file)) {
    section.forcedMidi.push(file);
  }

  if (Array.isArray(options.localBars)) {
    section.midiForcedLocalBars = section.midiForcedLocalBars || {};
    section.midiForcedLocalBars[file] = options.localBars.map(Number);
  }

  if (Array.isArray(options.allowedNoteIndexes)) {
    section.midiAllowedNoteIndexes = section.midiAllowedNoteIndexes || {};
    section.midiAllowedNoteIndexes[file] = options.allowedNoteIndexes.map(Number);
  }

  return true;
}

function shouldSkipMidiPatternNote(pattern, noteIndex, section, localBarIndex = null) {
  const allowedNoteIndexes = getSectionMidiAllowedNoteIndexes(section, pattern?.file);

  if (allowedNoteIndexes && !allowedNoteIndexes.has(Number(noteIndex))) {
    return true;
  }

  if (
    noteIndex === 0 &&
    isFirstActiveHookBar(section, localBarIndex) &&
    isHookHatsMidiPattern(pattern)
  ) {
    return true;
  }

  if (noteIndex !== 0) {
    return false;
  }

  if (!isRimsDrumsRimMidiPattern(pattern)) {
    return false;
  }

  const selectedMidi = Array.isArray(section?.selectedMidi) ? section.selectedMidi : [];

  return selectedMidi.some(file =>
    file !== pattern.file && midiFileTriggersRimsDrumsRimFirstNoteMute(file)
  );
}

function getMidiPatternRuleTagList(pattern) {
  const rawTags = getMidiPatternRuleTags(pattern);

  if (Array.isArray(rawTags)) {
    return rawTags;
  }

  if (rawTags instanceof Set) {
    return [...rawTags];
  }

  if (typeof rawTags === "string") {
    return [rawTags];
  }

  return [];
}
function isBeepipes1MidiPattern(pattern) {
  const entry = getMidiPatternRuleEntry(pattern);
  const tags = getMidiPatternRuleTagList(pattern);
  const baseId = normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));
  const key = normalizeRuleDecisionToken(entry?.key || pattern?.file || "");
  const hasBeepipes1Tag = tags.some(tag =>
    normalizeRuleDecisionToken(tag).includes("beepipes_1")
  );

  return hasBeepipes1Tag || baseId.includes("beepipes_1") || key.includes("beepipes_1");
}

function getBeepipes1DensityChanceMultiplier(section = {}) {
  const densityScore = Number(section.densityScore ?? section.density ?? 0);

  if (densityScore > 6) {
    return 0.5;
  }

  if (densityScore > 3) {
    return 0.75;
  }

  return 1;
}
function isBeepipesMidiPattern(pattern) {
  const entry = getMidiPatternRuleEntry(pattern);
  const tags = getMidiPatternRuleTagList(pattern);
  const baseId = normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));
  const key = normalizeRuleDecisionToken(entry?.key || pattern?.file || "");
  const hasBeepipesTag = tags.some(tag =>
    normalizeRuleDecisionToken(tag).includes("beepipes")
  );

  return hasBeepipesTag || baseId.includes("beepipes") || key.includes("beepipes");
}

function isSnarePatternMidiPattern(pattern) {
  const baseId = normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));
  const key = normalizeRuleDecisionToken(pattern?.file || "");

  return baseId.startsWith("snare_pattern") || key.includes("snare_pattern");
}

function midiPatternClashesWithSelectedSection(pattern, selectedMidiFiles, midiPatternPool) {
  const selectedPatterns = [...selectedMidiFiles]
    .map(file => midiPatternPool.find(item => item.file === file))
    .filter(Boolean);

  for (const selectedPattern of selectedPatterns) {
    if (
      isBeepipesGhostsMidiPattern(pattern) &&
      isRimMidiPattern(selectedPattern)
    ) {
      return true;
    }

    if (
      isBeepipesGhostsMidiPattern(selectedPattern) &&
      isRimMidiPattern(pattern)
    ) {
      return true;
    }

    if (
      isBeepipes2MidiPattern(pattern) &&
      isBeepipesMidiPattern(selectedPattern) &&
      !isBeepipes2MidiPattern(selectedPattern)
    ) {
      return true;
    }

    if (
      isBeepipes2MidiPattern(selectedPattern) &&
      isBeepipesMidiPattern(pattern) &&
      !isBeepipes2MidiPattern(pattern)
    ) {
      return true;
    }

    if (
      isBeepipesMidiPattern(pattern) &&
      isSnarePatternMidiPattern(selectedPattern)
    ) {
      return true;
    }

    if (
      isBeepipesMidiPattern(selectedPattern) &&
      isSnarePatternMidiPattern(pattern)
    ) {
      return true;
    }

    if (
      isBeepipesMidiPattern(pattern) &&
      isExtraRimMidiPattern(selectedPattern)
    ) {
      return true;
    }

    if (
      isBeepipesMidiPattern(selectedPattern) &&
      isExtraRimMidiPattern(pattern)
    ) {
      return true;
    }
  }

  return false;
}
function isBeepipesGhostsMidiPattern(pattern) {
  const entry = getMidiPatternRuleEntry(pattern);
  const tags = getMidiPatternRuleTagList(pattern);
  const baseId = normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));
  const key = normalizeRuleDecisionToken(entry?.key || pattern?.file || "");
  const hasGhostTag = tags.some(tag => {
    const normalisedTag = normalizeRuleDecisionToken(tag);
    return normalisedTag.includes("beepipes_ghosts") || normalisedTag === "ghosts";
  });

  return hasGhostTag || baseId.includes("beepipes_ghosts") || key.includes("beepipes_ghosts");
}
function isBeepipes2MidiPattern(pattern) {
  const entry = getMidiPatternRuleEntry(pattern);
  const tags = getMidiPatternRuleTagList(pattern);
  const baseId = normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));
  const key = normalizeRuleDecisionToken(entry?.key || pattern?.file || "");
  const hasBeepipes2Tag = tags.some(tag =>
    normalizeRuleDecisionToken(tag).includes("beepipes_2")
  );

  return hasBeepipes2Tag || baseId.includes("beepipes_2") || key.includes("beepipes_2");
}
function normalHatChoiceClashesWithMidiPattern(choiceGroupId, pattern) {
  if (!choiceGroupId) return false;

  if (isBeepipes2MidiPattern(pattern) && choiceGroupId !== "hats_wiv_beepipes") {
    return true;
  }

  if (choiceGroupId === "holdit_hats" && isRimMidiPattern(pattern)) {
    return true;
  }

  if (!isExtraRimMidiPattern(pattern)) {
    return false;
  }

  if (
    choiceGroupId === "main_hats" ||
    choiceGroupId === "trap_hats" ||
    choiceGroupId === "lego_hats" ||
    choiceGroupId === "messy_hats" ||
    choiceGroupId === "messy_hats_fast" ||
    choiceGroupId === "messy_hats_fast_ends_in_main_hats"
  ) {
    return true;
  }

  if (choiceGroupId === "speedy_hats") {
    const baseId = normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));
    return baseId.startsWith("rims_xtra_1");
  }

  return false;
}
function shouldExcludeNormalMidiHatFromGenericPicker(pattern, choiceGroupId = null) {
  const baseId = normalizeRuleDecisionToken(getMidiPatternBaseId(pattern));
  const groupId = choiceGroupId || getNormalMidiHatChoiceGroupId(pattern);

  if (baseId.startsWith("messy_hats_addin")) {
    return true;
  }

  if (baseId.startsWith("speedy_hats_cont")) {
    return true;
  }

  if (groupId === "hats_wiv_beepipes") {
    return true;
  }

  if (groupId === "hook_hats") {
    return true;
  }

  if (groupId === "holdit_hats_forlyrix") {
    return true;
  }

  return false;
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
    // Alternate downloads are secret/rare full-file systems, not normal stem candidates.
    if (entry.folder === "alternate downloads") return 0;

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

  function includeCentralInstrumentFamilySelections({
    random,
    selectedAudio = null,
    globalInclusionState = null,
    requiredActivationState = null
  } = {}) {
    if (!selectedAudio) return 0;

    let addedCount = 0;

    for (const family of ["sax", "gtar"]) {
      const config = getCentralInstrumentFamilyConfig(family);
      const candidates = getCentralInstrumentFamilyCandidateEntries(family);

      if (!config || !candidates.length) continue;

      let globalChance = config.globalInclusionChance;

      if (family === "gtar" && selectedAudioHasTrueBassFamily(selectedAudio, "real_bass")) {
        globalChance = clampProbability(globalChance * 1.5);
      }

      const roll = typeof random === "function" ? random() : 1;
      const included = roll < globalChance;

      setGlobalInclusionDecision(globalInclusionState, {
        kind: "audio_family",
        key: `central_instrument_family:${family}`,
        included,
        globalChance,
        roll,
        profileSummary: {
          family,
          tags: ["instrument", family, "central_instrument_family"]
        }
      });

      if (!included) continue;

      for (const entry of candidates) {
        const hadKey = selectedAudio.has(entry.key);

        forceIncludeAudioSelection({
          random,
          globalInclusionState,
          requiredActivationState,
          selectedAudio,
          key: entry.key,
          reason: `central_instrument_family_inclusion:${family}`
        });

        if (!hadKey && selectedAudio.has(entry.key)) {
          addedCount += 1;
        }
      }
    }

    return addedCount;
  }

  function recordSectionPlannedAudio(section, entry) {
    if (!section || !entry?.key) return;

    if (!Array.isArray(section.plannedAudio)) section.plannedAudio = [];
    if (!Array.isArray(section.plannedAudioKeys)) section.plannedAudioKeys = [];

    if (!section.plannedAudioKeys.includes(entry.key)) {
      section.plannedAudioKeys.push(entry.key);
      section.plannedAudio.push({
        key: entry.key,
        family: getEntryPrimaryFamily(entry),
        tags: getEntryPlaybackTags(entry)
      });
    }
  }

    function getRuleUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return String(params.get(name) || "").trim();
  }

  function getRuleUrlBooleanFlag(...names) {
    return names.some(name => {
      const rawValue = getRuleUrlParam(name);

      if (!rawValue && !new URLSearchParams(window.location.search).has(name)) {
        return false;
      }

      const value = rawValue.toLowerCase();

      return value === "" || value === "1" || value === "true" || value === "yes";
    });
  }

  function chooseHookStartDecision(random) {
    const forceHookStart = getRuleUrlBooleanFlag("forceHookStart", "forceSongStartHook");
    const disableHookStart = getRuleUrlBooleanFlag("noHookStart", "disableHookStart");
    const forcedMethod = getRuleUrlParam("forceHookStartMethod").toLowerCase();

    if (disableHookStart) {
      return {
        startsInHook: false,
        method: "disabled"
      };
    }

    const startsInHook = forceHookStart || chance(random, 0.1);

    if (!startsInHook) {
      return {
        startsInHook: false,
        method: "normal_song_start"
      };
    }

    const method = forcedMethod === "skip" || forcedMethod === "hook_drums_skip_intro"
      ? "hook_drums_skip_intro"
      : forcedMethod === "normal" || forcedMethod === "normal_hook_start"
        ? "normal_hook_start"
        : chance(random, 0.5)
          ? "normal_hook_start"
          : "hook_drums_skip_intro";

    return {
      startsInHook: true,
      method,
      forceGlobalFadeIn: method === "normal_hook_start",
      disableGlobalFadeIn: method === "hook_drums_skip_intro",
      source: forceHookStart ? "forced_url" : "random_10_percent"
    };
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
    const hookStartDecision = chooseHookStartDecision(random);

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

      const inferredLyrixEnergy = getLyrixSectionEnergyOptions(random, options.lyrixSection);

      attachSectionEnergyContext(section, {
        densityScore: options.densityScore ?? inferredLyrixEnergy.densityScore,
        densityBand: options.densityBand ?? inferredLyrixEnergy.densityBand,
        tensionValue: options.tensionValue ?? inferredLyrixEnergy.tensionValue,
        tensionBand: options.tensionBand ?? inferredLyrixEnergy.tensionBand,
        isCrescendo: options.isCrescendo ?? inferredLyrixEnergy.isCrescendo,
        isEmphasis: options.isEmphasis ?? inferredLyrixEnergy.isEmphasis
      });

      if (options.lyrixSection?.crescendoRule?.allowCrescendosDuringSection === false) {
        section.isCrescendo = false;
        section.crescendo = false;
      }

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

    if (hookStartDecision.startsInHook) {
      console.log("[hook start decision]", hookStartDecision);

      if (hookStartDecision.method === "hook_drums_skip_intro") {
        addSection("hook_drums_skip_intro", 2, {
          reset: true,
          tags: ["hook", "hook_intro", "hook_drums_skip_intro", "section_intro"]
        });

        forceIncludeAudioSelection({
          random,
          globalInclusionState,
          requiredActivationState,
          selectedAudio,
          key: "samples/hook_drums_skip_intro.wav",
          reason: "forced_hook_drums_skip_intro_song_start"
        });
      }

      const songStartHookSection = addSection("hook", 8, {
        reset: true,
        tags: ["hook", "song_start_hook", hookStartDecision.method]
      });

      const hookSynthBassSequenceKeys = [
        "samples/synth_bass_1_hook_odd_x4 (consolidated).wav",
        "samples/synth_bass_1_hook #2 (consolidated).wav",
        "samples/synth_bass_1_hook #3 (consolidated).wav",
        "samples/synth_bass_2_hook_x4_even (consolidated).wav"
      ];

      songStartHookSection.forcedHookSynthBassSequenceKeys = hookSynthBassSequenceKeys;
      songStartHookSection.forcedAudioStartKeys = [
        hookSynthBassSequenceKeys[0]
      ];

      for (const key of hookSynthBassSequenceKeys) {
        forceIncludeAudioSelection({
          random,
          globalInclusionState,
          requiredActivationState,
          selectedAudio,
          key,
          reason: "forced_song_start_hook_synth_bass_sequence"
        });
      }
    } else {
      addSection("normal", 8, { reset: true, tags: ["normal"] });

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
            reset: false,
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
                reset: false,
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
        const outburstLyrixSection = (lyrixRules?.sections || []).find(section =>
          section?.id === "outburst_lyrix" ||
          (section?.kind === "conditionalBeatSectionLyrix" && section?.beatSectionId === "outburst")
        ) || null;

        const outburstLyrixActivationNumber = outburstLyrixSection
          ? (lyrixSectionUsage.get(outburstLyrixSection.id) || 0) + 1
          : 0;

        if (outburstLyrixSection) {
          lyrixSectionUsage.set(outburstLyrixSection.id, outburstLyrixActivationNumber);
        }

        addSection("outburst_intro", 4, {
          reset: true,
          tags: ["outburst", "major_reset"],
          lyrixSectionId: outburstLyrixSection?.id || null,
          lyrixSection: outburstLyrixSection,
          lyrixActivationNumber: outburstLyrixActivationNumber
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

    const audioEntries = getAllCatalogEntries().filter(entry => isAudio(entry) && !isMidiSample(entry));
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
        if ((section.type === "normal" || (section.type.includes("lyrix") && section.lyrixSectionId)) && isCentralInstrumentFamilyEntry(entry)) return false;
        return audioMatchesSection(entry, section);
      });

      const shuffled = shuffle(random, matchingEntries);
      const selectionLimit = section.type === "normal" || section.type === "ending" ? 24 : 12;

      for (const entry of shuffled.slice(0, selectionLimit)) {
        const chanceMultiplier = section.type === "normal" ? 0.65 : 1.0;
        const p = Math.min(0.9, getBaseActivationChance(entry) * chanceMultiplier);

        const included = includeAudioByGlobalDecision({
          random,
          globalInclusionState,
          requiredActivationState,
          selectedAudio,
          entry,
          fallbackChance: p,
          reason: `section_selection:${section.type}`
        });

        if (included) {
          recordSectionPlannedAudio(section, entry);
        }
      }
    }

    includeCentralInstrumentFamilySelections({
      random,
      selectedAudio,
      globalInclusionState,
      requiredActivationState
    });

    // central_instrument_family_selection_inserted_before_hats
    let activeNormalHatChoice = null;
    let forcedNextNormalHatChoice = null;
    let messyEndsInMainMustResolve = false;
    let messyHatsActivationCount = 0;
    let messyHatsAddinStarted = false;
    let messyHatsAddinNoteCount = 0;
    let normalHatsSystemWasActive = false;
    let jazzHatsActive = false;
    let jazzHatsBarsActive = 0;

    // MIDI pattern selection by section.
    for (const section of sectionTimeline) {
      const sectionSelectedMidi = new Set();

      if (shouldUseHookIntroCrash(section)) {
        const hookIntroCrashPattern = midiPatternPool.find(pattern => isHookCrashIntroMidiPattern(pattern));

        if (hookIntroCrashPattern) {
          sectionSelectedMidi.add(hookIntroCrashPattern.file);
          selectedMidi.add(hookIntroCrashPattern.file);
        }
      }

      if (String(section.type || "") === "hook_drums_skip_intro") {
        addForcedMidiToSection(
          section,
          sectionSelectedMidi,
          selectedMidi,
          midiPatternPool,
          "midi files/beepipes_1_drums_hook_~.mid",
          {
            localBars: [0],
            allowedNoteIndexes: [3]
          }
        );
      }

      if (isHookStartedAfterDrumsSkipIntro(section)) {
        addForcedMidiToSection(
          section,
          sectionSelectedMidi,
          selectedMidi,
          midiPatternPool,
          "midi files/beepipes_1_drums_hook_~.mid",
          {
            localBars: [0],
            allowedNoteIndexes: [0, 2]
          }
        );
      }

      const sectionMidi = midiPatternPool.filter(pattern => {
        const key = pattern.file.toLowerCase();

        if (isHookDrumsSkipIntroSection(section)) {
          return pattern.file === "midi files/beepipes_1_drums_hook_~.mid";
        }

        const hookSection = isHookSection(section);
        const hookKey = isHookKey(pattern.file);

        if (hookKey && !hookSection) return false;
        if (hookSection && !hookKey) return false;

        if (hookSection) return true;
        if (section.type.includes("grimey")) return key.includes("grm_") || key.includes("grimey");
        if (section.type.includes("drop")) return key.includes("crash") || key.includes("snare");
        if (section.type.includes("outburst")) {
          if (key.includes("messy_hats")) return false;
          return key.includes("crash") || key.includes("hats");
        }
        return key.includes("main_hats") || key.includes("snare") || key.includes("rims") || key.includes("hats") || isBeepipesMidiPattern(pattern);
      });

      const normalHatGroupsByChoice = new Map();
      const nonNormalMidi = [];

      for (const pattern of sectionMidi) {
        if (isJazzMidiHatPattern(pattern)) {
          // Jazz hats/rides use their own takeover system, not the generic normal MIDI picker.
          continue;
        }

        if (!isNormalMidiHatPattern(pattern)) {
          nonNormalMidi.push(pattern);
          continue;
        }

        const choiceGroupId = getNormalMidiHatChoiceGroupId(pattern);
        const companionGroupId = getNormalMidiHatCompanionGroupId(pattern);

        if (shouldExcludeNormalMidiHatFromGenericPicker(pattern, choiceGroupId)) {
          continue;
        }

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

      const hookJazzHatsPair = getHookJazzHatsPairFromSectionMidi(sectionMidi);
      const jazzHatsPattern = isHookSection(section)
        ? hookJazzHatsPair[0]
        : sectionMidi.find(pattern =>
            pattern.file === "midi files/jazz_hats_metal_ride03.mid"
          );
      const jazzHatPatternsForSection = hookJazzHatsPair.length
        ? hookJazzHatsPair
        : [jazzHatsPattern].filter(Boolean);
      const jazzRideWithHatsPattern = midiPatternPool.find(pattern =>
        pattern.file === "midi files/jazz_rides_wiv-jazz-hats_metal_ridehard.mid"
      );
      const jazzRideWithHatsAndCrashPattern = midiPatternPool.find(pattern =>
        pattern.file === JAZZ_RIDE_WITH_HATS_AND_CRASH_FILE
      );
      const jazzGhostRidePattern = midiPatternPool.find(pattern =>
        pattern.file === JAZZ_GHOST_RIDES_FILE
      );
      const sectionTensionForJazz = Number(section.tensionValue ?? section.tension ?? 0);
      const sectionBarsForJazz = Math.max(1, Number(section.lengthBars ?? section.bars ?? 1));
      let jazzHatsActiveForSection = false;

      if (sectionTensionForJazz > 0.2 || !jazzHatsPattern) {
        jazzHatsActive = false;
        jazzHatsBarsActive = 0;
      } else {
        const jazzHatsCanContinue = jazzHatsActive && (jazzHatsBarsActive < 4 || random() >= 0.05);
        const jazzHatsCanStart = !jazzHatsActive && random() < 0.015;

        jazzHatsActiveForSection = jazzHatsCanContinue || jazzHatsCanStart;
        jazzHatsActive = jazzHatsActiveForSection;
        jazzHatsBarsActive = jazzHatsActiveForSection ? jazzHatsBarsActive + sectionBarsForJazz : 0;
      }

      if (jazzHatsActiveForSection) {
        for (const jazzPattern of [...jazzHatPatternsForSection, jazzRideWithHatsPattern, jazzRideWithHatsAndCrashPattern, jazzGhostRidePattern].filter(Boolean)) {
          const jazzIncluded = includeMidiByGlobalDecision({
            random,
            globalInclusionState,
            requiredActivationState,
            selectedMidi,
            pattern: jazzPattern,
            fallbackChance: 1,
            force: true,
            reason: "jazz_hats_takeover"
          });

          if (jazzIncluded) {
            sectionSelectedMidi.add(jazzPattern.file);
          }
        }
      }

      let availableHatChoices = [...normalHatGroupsByChoice.keys()]
        .map(choiceGroupId => ({
          choiceGroupId,
          weight: getNormalHatChoiceWeight(choiceGroupId, section)
        }))
        .filter(item => item.weight > 0);

      if (jazzHatsActiveForSection) {
        availableHatChoices = [];
      }

      const normalHatsSystemDropsOut = normalHatsSystemWasActive && random() < 0.01;
      const availableHatChoiceIds = new Set(availableHatChoices.map(item => item.choiceGroupId));

      if (forcedNextNormalHatChoice && !availableHatChoiceIds.has(forcedNextNormalHatChoice)) {
        forcedNextNormalHatChoice = null;
        messyEndsInMainMustResolve = false;
      }

      if (normalHatsSystemDropsOut) {
        forcedNextNormalHatChoice = null;
        messyEndsInMainMustResolve = false;
      }

      const forcedNormalHatCanRun = Boolean(forcedNextNormalHatChoice && availableHatChoiceIds.has(forcedNextNormalHatChoice));
      const activeNormalHatCanContinue = Boolean(activeNormalHatChoice && availableHatChoiceIds.has(activeNormalHatChoice));
      const activeNormalHatDropsOut = activeNormalHatCanContinue && random() < getNormalHatPatternDropoutChance(activeNormalHatChoice);
      let selectedNormalHatChoice = null;

      if (availableHatChoices.length && !normalHatsSystemDropsOut) {
        let chosenChoice = null;

        if (forcedNormalHatCanRun) {
          chosenChoice = forcedNextNormalHatChoice;
          forcedNextNormalHatChoice = null;
        } else {
          chosenChoice = activeNormalHatCanContinue && !activeNormalHatDropsOut
            ? activeNormalHatChoice
            : null;
        }

        if (!chosenChoice) {
          const candidateHatChoices = activeNormalHatCanContinue
            ? availableHatChoices.filter(item => item.choiceGroupId !== activeNormalHatChoice)
            : availableHatChoices;
          const choicesToRoll = candidateHatChoices.length ? candidateHatChoices : availableHatChoices;
          const totalWeight = choicesToRoll.reduce((total, item) => total + item.weight, 0);
          let roll = random() * totalWeight;
          chosenChoice = choicesToRoll[choicesToRoll.length - 1].choiceGroupId;

          for (const item of choicesToRoll) {
            roll -= item.weight;
            if (roll <= 0) {
              chosenChoice = item.choiceGroupId;
              break;
            }
          }
        }

        selectedNormalHatChoice = chosenChoice;
        const continuingNormalHatChoice = (
          chosenChoice === activeNormalHatChoice &&
          activeNormalHatCanContinue &&
          !activeNormalHatDropsOut &&
          !forcedNormalHatCanRun
        );

        const companionGroups = normalHatGroupsByChoice.get(chosenChoice);
        let chosenPatterns = [];

        if (chosenChoice === "main_hats") {
          const mainChPattern = midiPatternPool.find(pattern =>
            pattern.file === "midi files/main_hats_ch_metal_ch.mid"
          );

          const normalMainOhPattern = midiPatternPool.find(pattern =>
            pattern.file === "midi files/main_hats_oh_metal_oh.mid"
          );

          const contMainOhPattern = midiPatternPool.find(pattern =>
            pattern.file === "midi files/main_hats_oh_cont_metal_oh.mid"
          );

          const contMainOhChPattern = midiPatternPool.find(pattern =>
            pattern.file === "midi files/main_hats_oh_cont_metal_ch.mid"
          );

          const preferredMainOhPattern = continuingNormalHatChoice
            ? contMainOhPattern
            : normalMainOhPattern;

          const fallbackMainOhPattern = continuingNormalHatChoice
            ? normalMainOhPattern
            : contMainOhPattern;

          chosenPatterns = mainChPattern ? [mainChPattern] : [];

          if (random() >= 0.1) {
            const mainOhPattern = preferredMainOhPattern || fallbackMainOhPattern;

            if (
              continuingNormalHatChoice &&
              mainOhPattern === contMainOhPattern &&
              contMainOhChPattern
            ) {
              chosenPatterns.push(contMainOhChPattern);
            }

            if (mainOhPattern) {
              chosenPatterns.push(mainOhPattern);
            }
          }

          if (!chosenPatterns.length) {
            chosenPatterns = chooseOne(random, [...companionGroups.values()]) || [];
          }
        } else if (chosenChoice === "speedy_hats" && continuingNormalHatChoice) {
          const speedyContFile = "midi files/speedy_hats_cont_metal_ch.mid";
          const speedyContPattern = midiPatternPool.find(pattern => pattern.file === speedyContFile);
          chosenPatterns = speedyContPattern
            ? [speedyContPattern]
            : (chooseOne(random, [...companionGroups.values()]) || []);
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

      normalHatsSystemWasActive = Boolean(selectedNormalHatChoice) && sectionSelectedMidi.size > 0;
      activeNormalHatChoice = normalHatsSystemWasActive ? selectedNormalHatChoice : null;

      if (
        normalHatsSystemWasActive &&
        selectedNormalHatChoice === "messy_hats" &&
        sectionSelectedMidi.has("midi files/messy_hats_metal_odd_ch.mid")
      ) {
        messyHatsActivationCount += 1;

        if (messyHatsActivationCount >= 2) {
          if (!messyHatsAddinStarted && random() < 0.9) {
            messyHatsAddinStarted = true;
          }

          if (messyHatsAddinStarted) {
            messyHatsAddinNoteCount += 1;

            const messyHatsAddinFile = "midi files/messy_hats_addin_metal_odd_ch.mid";
            const messyHatsAddinPattern = midiPatternPool.find(pattern => pattern.file === messyHatsAddinFile);

            if (messyHatsAddinPattern) {
              const included = includeMidiByGlobalDecision({
                random,
                globalInclusionState,
                requiredActivationState,
                selectedMidi,
                pattern: messyHatsAddinPattern,
                fallbackChance: 1,
                force: true,
                reason: "messy_hats_addin_progression"
              });

              if (included) {
                sectionSelectedMidi.add(messyHatsAddinFile);
                section.midiNoteLimits = section.midiNoteLimits || {};
                section.midiNoteLimits[messyHatsAddinFile] = messyHatsAddinNoteCount;
              }
            }
          }
        }
      }

      if (normalHatsSystemWasActive && selectedNormalHatChoice === "messy_hats_fast_ends_in_main_hats") {
        if (messyEndsInMainMustResolve) {
          forcedNextNormalHatChoice = "main_hats";
          messyEndsInMainMustResolve = false;
        } else if (random() < 0.5) {
          forcedNextNormalHatChoice = "messy_hats_fast_ends_in_main_hats";
          messyEndsInMainMustResolve = true;
        } else {
          forcedNextNormalHatChoice = "main_hats";
          messyEndsInMainMustResolve = false;
        }
      } else if (selectedNormalHatChoice !== "messy_hats_fast_ends_in_main_hats") {
        messyEndsInMainMustResolve = false;
      }

      const nonNormalLimit = sectionSelectedMidi.size > 0 ? 2 : 3;
      const eligibleNonNormalMidi = nonNormalMidi.filter(pattern =>
        !normalHatChoiceClashesWithMidiPattern(selectedNormalHatChoice, pattern)
      );

      for (const pattern of shuffle(random, eligibleNonNormalMidi).slice(0, nonNormalLimit)) {
        if (midiPatternClashesWithSelectedSection(pattern, sectionSelectedMidi, midiPatternPool)) {
          continue;
        }

        let p = 0.35;
        const key = pattern.file.toLowerCase();

        if (key.includes("snare")) p = 0.45;
        if (key.includes("rims")) p = 0.35;
        if (key.includes("hook")) p = 0.45;
        if (key.includes("jazz")) p = 0.18;
        if (key.includes("messy")) p = 0.18;

        if (isBeepipes1MidiPattern(pattern)) {
          p *= getBeepipes1DensityChanceMultiplier(section);
        }

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

          if (isBeepipes2MidiPattern(pattern)) {
            const beepipes2HatFiles = [
              "midi files/hats_wiv-beepipes_2_metal_odd_ch.mid",
              "midi files/hats_wiv-beepipes_2_metal_odd_oh.mid"
            ];

            for (const hatFile of beepipes2HatFiles) {
              const hatPattern = midiPatternPool.find(item => item.file === hatFile);

              if (!hatPattern) {
                continue;
              }

              const hatIncluded = includeMidiByGlobalDecision({
                random,
                globalInclusionState,
                requiredActivationState,
                selectedMidi,
                pattern: hatPattern,
                fallbackChance: 1,
                force: true,
                reason: "beepipes_2_matching_hats"
              });

              if (hatIncluded) {
                sectionSelectedMidi.add(hatFile);
              }
            }
          }
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

    const forcedNumberedSequenceTestKey = getForcedNumberedSequenceTestKey();

    if (forcedNumberedSequenceTestKey) {
      const forcedSequenceEntry = getCatalogEntry(forcedNumberedSequenceTestKey);
      const forcedSequenceSection =
        sectionTimeline.find(section => section.type === "normal" && audioMatchesSection(forcedSequenceEntry, section)) ||
        sectionTimeline.find(section => audioMatchesSection(forcedSequenceEntry, section));

      if (forcedSequenceEntry && forcedSequenceSection) {
        if (!Array.isArray(forcedSequenceSection.forcedNumberedSequenceTestKeys)) {
          forcedSequenceSection.forcedNumberedSequenceTestKeys = [];
        }

        if (!forcedSequenceSection.forcedNumberedSequenceTestKeys.includes(forcedSequenceEntry.key)) {
          forcedSequenceSection.forcedNumberedSequenceTestKeys.push(forcedSequenceEntry.key);
        }

        forceIncludeAudioSelection({
          random,
          globalInclusionState,
          requiredActivationState,
          selectedAudio,
          key: forcedSequenceEntry.key,
          reason: "forced_numbered_sequence_test_url"
        });

        recordSectionPlannedAudio(forcedSequenceSection, forcedSequenceEntry);
      }
    }

    expandSelectedWetDryPairs(selectedAudio, random, globalInclusionState, requiredActivationState);

    expandSelectedAudioSequences({
      random,
      selectedAudio,
      globalInclusionState,
      requiredActivationState
    });

    expandDependentActivationTargets({
      random,
      selectedAudio,
      globalInclusionState,
      requiredActivationState
    });

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
      selectedMidi: [
        ...new Set([
          ...selectedMidi,
          ...sectionTimeline.flatMap(section => section.lyrixSection?.legoHatsTriggerRule?.midiFiles || [])
        ])
      ],
      lifecycleStates: [...lifecycleStates.values()],
      globalInclusionDebug: globalInclusionState.debug.map(item => ({ ...item })),
      requiredActivationDebug: {
        obligations: [...requiredActivationState.obligations.values()].map(item => ({ ...item })),
        events: requiredActivationState.debug.map(item => ({ ...item })),
        unfulfilled: getUnfulfilledRequiredActivations(requiredActivationState).map(item => ({ ...item }))
      },
      sectionTimeline,
      resetPoints,
      hookStartDecision,
      forceGlobalFadeIn: Boolean(hookStartDecision?.forceGlobalFadeIn),
      disableGlobalFadeIn: Boolean(hookStartDecision?.disableGlobalFadeIn),
      plannedDurationSeconds: cursorSeconds
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

  function getCentralInstrumentFamilyPanValue(family) {
    const normalizedFamily = normalizeRuleDecisionToken(family);

    if (normalizedFamily === "sax") return -1;
    if (normalizedFamily === "gtar") return 1;

    return 0;
  }

  function scheduleBuffer(offlineContext, destination, buffer, startTime, gainValue = 1, offset = 0, panValue = 0) {
    if (!buffer) return null;
    if (startTime >= offlineContext.length / offlineContext.sampleRate) return null;

    const source = offlineContext.createBufferSource();
    const gain = offlineContext.createGain();

    const safeStartTime = Math.max(0, startTime);
    const safeOffset = Math.max(0, offset);
    const playableDuration = Math.max(0, buffer.duration - safeOffset);

    source.buffer = buffer;
    gain.gain.value = gainValue;

    const safePanValue = Math.max(-1, Math.min(1, Number.isFinite(Number(panValue)) ? Number(panValue) : 0));
    let panner = null;

    source.connect(gain);

    if (safePanValue !== 0 && typeof offlineContext.createStereoPanner === "function") {
      panner = offlineContext.createStereoPanner();
      panner.pan.value = safePanValue;
      gain.connect(panner);
      panner.connect(destination);
    } else {
      gain.connect(destination);
    }

    source.start(safeStartTime, safeOffset);

    return {
      scheduled: true,
      source,
      gainNode: gain,
      pannerNode: panner,
      panValue: safePanValue,
      buffer,
      startTime: safeStartTime,
      offset: safeOffset,
      duration: playableDuration,
      endTime: safeStartTime + playableDuration,
      gainValue
    };
  }

  function recordSectionScheduledAudio(section, {
    key = "",
    entry = null,
    scheduleHandle = null,
    family = ""
  } = {}) {
    if (!section || !scheduleHandle?.scheduled) return;

    const activeKey = key || entry?.key || "";
    const activeEntry = entry || (activeKey ? getCatalogEntry(activeKey) : null);
    const activeFamily = family || getEntryPrimaryFamily(activeEntry);

    if (!Array.isArray(section.scheduledAudio)) section.scheduledAudio = [];
    if (!Array.isArray(section.scheduledAudioKeys)) section.scheduledAudioKeys = [];

    section.scheduledAudio.push({
      key: activeKey,
      family: activeFamily,
      tags: getEntryPlaybackTags(activeEntry),
      startTime: scheduleHandle.startTime,
      endTime: scheduleHandle.endTime,
      duration: scheduleHandle.duration,
      gainValue: scheduleHandle.gainValue
    });

    if (activeKey && !section.scheduledAudioKeys.includes(activeKey)) {
      section.scheduledAudioKeys.push(activeKey);
    }
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
    const panValue = getCentralInstrumentFamilyPanValue(family || getCentralInstrumentFamily(entry));

    const scheduleHandle = scheduleBuffer(
      offlineContext,
      destination,
      buffer,
      startTime,
      gainValue,
      offset,
      panValue
    );

    recordSectionScheduledAudio(section, {
      key,
      entry,
      scheduleHandle,
      family
    });

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
  function getMidiRepeatEveryBars(pattern) {
  const key = String(pattern?.file || "").toLowerCase();

  if (key.includes("x0.5")) {
    return 1;
  }

  const opportunityMatch = key.match(/(?:^|[_\s-])x(2|4|6|8)(?:[_\s.-]|$)/);

  if (opportunityMatch) {
    return Number(opportunityMatch[1]);
  }

  return pattern?.lengthBeats > 8 ? 4 : 1;
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
    section = null,
    localBarIndex = null
  }) {
    const sampleBuffer = buffers.get(pattern.samplePath);
    if (!sampleBuffer) return 0;

    const entry = getMidiPatternRuleEntry(pattern);
    let scheduledCount = 0;

    for (const [noteIndex, note] of pattern.notes.entries()) {
      if (shouldSkipMidiPatternNote(pattern, noteIndex, section, localBarIndex)) {
        continue;
      }

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

   function profileHasSelectionChanceField(profile) {
    return Boolean(profile && (
      profile.globalInclusionChance !== undefined ||
      profile.globalChance !== undefined ||
      profile.inclusionChance !== undefined ||
      profile.globalSelectionChance !== undefined ||
      profile.activationChance !== undefined ||
      profile.activationChanceEach !== undefined ||
      profile.chance !== undefined
    ));
  }

  function hasExplicitNormalAudioProfile(entry) {
    if (!entry?.key) return false;

    const pool = getRuleProfilePool();
    const key = entry.key;
    const family = entry.family || "";
    const tags = Array.isArray(entry.tags) ? entry.tags : [];

    const byTag = getRuleMapByName(pool, ["byTag", "tags", "tagRules"]);
    const byFamily = getRuleMapByName(pool, ["byFamily", "families", "familyRules"]);
    const byKeyPattern = getRuleMapByName(pool, ["byKeyPattern", "keyPatterns", "patterns", "patternRules"]);
    const byKey = getRuleMapByName(pool, ["byKey", "keys", "keyRules"]);

    for (const tag of tags) {
      if (profileHasSelectionChanceField(getRuleObjectFromMap(byTag, tag))) return true;
    }

    if (profileHasSelectionChanceField(getRuleObjectFromMap(byFamily, family))) return true;

    const keyPatternRules = getRuleObjectsMatchingKeyPatterns(byKeyPattern, key);
    if (keyPatternRules.some(profileHasSelectionChanceField)) return true;

    return profileHasSelectionChanceField(getRuleObjectFromMap(byKey, key));
  }

  function audioMatchesSection(entry, section) {
    const key = entry.key.toLowerCase();
    const type = section.type;

    if (isHookDrumsSkipIntroSection(section)) {
      return entry.key === "samples/hook_drums_skip_intro.wav";
    }

    const hookSection = isHookSection(section);
    const hookKey = isHookKey(entry.key);
    const allowNonHookInHook = key.includes("window_wipe");

    if (hookKey && !hookSection) return false;
    if (hookSection && !hookKey && !allowNonHookInHook) return false;

    // Alternate downloads must not be scheduled as ordinary section audio.
    if (entry.folder === "alternate downloads") return false;

    // Grimey section material must not leak into normal/drop/outburst/ending sections.
    if ((key.includes("grm_") || key.includes("rewind_sfx")) && !type.includes("grimey")) {
      return false;
    }

    // Outburst section material must not leak into normal/drop/grimey/ending sections.
    if (key.includes("outburst") && !type.includes("outburst")) {
      return false;
    }

    // Drop section material must not leak into normal/grimey/outburst/ending sections.
    if ((key.includes("drop_") || key.includes("dropped_")) && !type.includes("drop")) {
      return false;
    }

    if (key.includes("everything_intro")) return type === "everything_intro";
    if (key.includes("hook_drums_skip_intro")) return type === "hook_drums_skip_intro";
    if (hookSection) {
      return true;
    }

    if (type.includes("lyrix")) {
      if (section.lyrixSectionId) {
        if (isLyrix(entry)) return false;
        if (hasExplicitNormalAudioProfile(entry)) return true;

        return (
          key.includes("crash") ||
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

    if (hasExplicitNormalAudioProfile(entry)) return true;

    return (
      key.includes("crash") ||
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

    if (isHookDrumsSkipIntroSection(section)) {
      return pattern.file === "midi files/beepipes_1_drums_hook_~.mid";
    }

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
      key.includes("ride") ||
      isBeepipesMidiPattern(pattern)
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

  function scheduleTriggeredMidiFilesAtTime({
    offlineContext,
    destination,
    section,
    random,
    playbackState,
    buffers,
    midiFiles = [],
    startTime,
    gainValue = 0.62
  } = {}) {
    if (!Array.isArray(midiFiles) || !midiFiles.length) return 0;

    let scheduledCount = 0;

    for (const midiFile of midiFiles) {
      const pattern = midiPatterns?.patterns?.find(item => item.file === midiFile);
      if (!pattern) continue;

      scheduledCount += scheduleMidiPattern({
        offlineContext,
        destination,
        pattern,
        buffers,
        barStart: startTime,
        beatSeconds: section.barSeconds / 4,
        gainValue,
        playbackState,
        section,
        localBarIndex: null
      });
    }

    return scheduledCount;
  }

  function scheduleExplicitLyrixSection({ offlineContext, destination, section, random, playbackState = null, buffers }) {
    const lyrixSection = section.lyrixSection;
    if (!lyrixSection) return false;

    if (!lyrixSection?.parts?.length && Array.isArray(lyrixSection.coreFiles) && lyrixSection.coreFiles.length) {
      let coreStart = section.startSeconds;
      const coreFiles = lyrixSection.coreLyrixMode === "shuffle_all_once"
        ? shuffle(random, lyrixSection.coreFiles)
        : lyrixSection.coreFiles.slice();

      const adlibFiles = Array.isArray(lyrixSection.adlibRule?.files)
        ? lyrixSection.adlibRule.files
        : [];

      const adlibChance = Number(lyrixSection.adlibRule?.chancePerCoreLyrixActivation ?? 0);

      for (const coreFile of coreFiles) {
        const coreBuffer = buffers.get(coreFile);

        scheduleLyrixPathWithPlaybackState({
          offlineContext,
          destination,
          path: coreFile,
          buffer: coreBuffer,
          startTime: coreStart,
          gainValue: 0.72,
          playbackState,
          section
        });

        if (adlibFiles.length && chance(random, adlibChance)) {
          const adlibFile = chooseOne(random, adlibFiles);
          const adlibBuffer = buffers.get(adlibFile);

          scheduleLyrixPathWithPlaybackState({
            offlineContext,
            destination,
            path: adlibFile,
            buffer: adlibBuffer,
            startTime: coreStart,
            gainValue: 0.72,
            playbackState,
            section
          });
        }

        const legoHatsRule = lyrixSection.legoHatsTriggerRule || null;
        const legoHatsChance = Number(legoHatsRule?.chancePerCoreLyrixActivation ?? 0);
        const legoHatsMidiFiles = Array.isArray(legoHatsRule?.midiFiles) ? legoHatsRule.midiFiles : [];

        if (legoHatsMidiFiles.length && chance(random, legoHatsChance)) {
          scheduleTriggeredMidiFilesAtTime({
            offlineContext,
            destination,
            section,
            random,
            playbackState,
            buffers,
            midiFiles: legoHatsMidiFiles,
            startTime: coreStart,
            gainValue: 0.62
          });
        }

        if (coreBuffer) {
          coreStart += coreBuffer.duration;
        }
      }

      return true;
    }

    if (!lyrixSection?.parts?.length) return false;

    let start = section.startSeconds;
    const leadIn = lyrixSection.leadIn || null;

    const shouldSkipLeadIn =
      section.suppressLyrixLeadIn ||
      (leadIn?.firstActivationOnly && Number(section.lyrixActivationNumber || 1) > 1);

    if (leadIn && !shouldSkipLeadIn) {
      const leadInChance = leadIn.chance === undefined
        ? (leadIn.activationChance === undefined ? 1 : Number(leadIn.activationChance))
        : Number(leadIn.chance);

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

    applyLyrixSecondBarCutoffRule(playbackState, section, lyrixSection, random);

    const partStartTimes = new Map();

    const lastPartRule = lyrixSection.lastPartRule || null;
    const finalMainPart = Number(lastPartRule?.finalMainPart || 0);
    const omitFinalMainPart = finalMainPart > 0 && chance(random, Number(lastPartRule?.omitFinalPartChance) || 0);
    const finalSceneSwapConfig = lastPartRule?.ifFinalPartNotOmitted || null;
    const useFinalSceneSwap = finalMainPart > 0 &&
      !omitFinalMainPart &&
      finalSceneSwapConfig &&
      chance(random, Number(finalSceneSwapConfig.sceneSwapChance) || 0);

    for (const part of lyrixSection.parts) {
      const partNumber = Number(part.part) || 1;
      partStartTimes.set(partNumber, start);

      let activeDryPath = part.dry || null;
      let activeWetPath = part.wet && !part.dryOnly ? part.wet : null;
      let activeSinglePath = part.file || null;

      if (finalMainPart > 0 && partNumber === finalMainPart) {
        const normalDryBuffer = activeDryPath ? buffers.get(activeDryPath) : null;
        const normalSingleBuffer = activeSinglePath ? buffers.get(activeSinglePath) : null;
        const normalWetBuffer = activeWetPath ? buffers.get(activeWetPath) : null;

        if (omitFinalMainPart) {
          if (normalDryBuffer) {
            start += normalDryBuffer.duration;
          } else if (normalSingleBuffer) {
            start += normalSingleBuffer.duration;
          } else if (normalWetBuffer) {
            start += normalWetBuffer.duration;
          }
          continue;
        }

        if (useFinalSceneSwap) {
          activeDryPath = finalSceneSwapConfig.sceneSwapFiles?.dry || activeDryPath;
          activeWetPath = finalSceneSwapConfig.sceneSwapFiles?.wet || activeWetPath;
          activeSinglePath = null;
        }
      }

      const replacementRule = lyrixSection.part3ReplacementRule;

      if (replacementRule && partNumber === Number(replacementRule.targetPart)) {
        const replacementChance = Number(replacementRule.chance) || 0;

        if (replacementRule.replaces === "dry" && replacementRule.replacementFile && chance(random, replacementChance)) {
          activeDryPath = replacementRule.replacementFile;
        }
      }

      const dryBuffer = activeDryPath ? buffers.get(activeDryPath) : null;
      const wetBuffer = activeWetPath ? buffers.get(activeWetPath) : null;
      const singleBuffer = activeSinglePath ? buffers.get(activeSinglePath) : null;
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
        path: activeWetPath,
        buffer: wetBuffer,
        startTime: start,
        gainValue: gain,
        playbackState,
        section
      });

      scheduleLyrixPathWithPlaybackState({
        offlineContext,
        destination,
        path: activeSinglePath,
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

    const mainLyrix = lyrixSection.mainLyrix || null;

    if (mainLyrix) {
      const startsAfterIntroBars = Number(mainLyrix.startsAfterIntroBars);
      const startsAtSectionBar = Number(mainLyrix.startsAtOutburstSectionBar);
      const mainStartBars = Number.isFinite(startsAfterIntroBars)
        ? startsAfterIntroBars
        : Number.isFinite(startsAtSectionBar)
          ? Math.max(0, startsAtSectionBar - 1)
          : 0;
      const mainStart = section.startSeconds + mainStartBars * section.barSeconds;
      const mainGain = Number(mainLyrix.gain) || 0.72;

      if (mainLyrix.dry) {
        scheduleLyrixPathWithPlaybackState({
          offlineContext,
          destination,
          path: mainLyrix.dry,
          buffer: buffers.get(mainLyrix.dry),
          startTime: mainStart,
          gainValue: mainGain,
          playbackState,
          section
        });
      }

      if (mainLyrix.wet) {
        scheduleLyrixPathWithPlaybackState({
          offlineContext,
          destination,
          path: mainLyrix.wet,
          buffer: buffers.get(mainLyrix.wet),
          startTime: mainStart,
          gainValue: mainGain,
          playbackState,
          section
        });
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
  function scheduleDependentActivationFollowersForAudio({
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

        const conditionResult = checkDependentActivationRuleConditions(
          playbackState,
          rule,
          targetStartSeconds
        );

        if (!conditionResult.allowed) {
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
              skipped: true,
              reason: conditionResult.reason,
              requiredTargets: conditionResult.requiredTargets,
              blockedTargets: conditionResult.blockedTargets,
              requiredMatches: conditionResult.requiredMatches,
              blockedMatches: conditionResult.blockedMatches,
              missingRequiredTargets: conditionResult.missingRequiredTargets
            });
          }

          continue;
        }

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
              `${section?.id || "section"}:${targetEntry.key}:dependent:${sourceKey}`
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

  function scheduleNormalNumberedAudioSequence({
    offlineContext,
    destination,
    section,
    key,
    entry,
    random,
    plan = null,
    playbackState = null,
    lifecycleStates = null
  } = {}) {
    const sequence = getNormalNumberedAudioSequenceForEntry(entry);

    if (!sequence.length || sequence[0]?.key !== entry?.key) return 0;

    const profile = getRuleProfileForEntry(entry);
    const allowedBars = getAllowedLocalBarIndexesForKey(entry.key, section)
      .filter(localBarIndex => !shouldBlockHookAfterSkipFirstBarAudioKey(entry.key, section, localBarIndex));

    if (!allowedBars.length) return 0;

    const lifecycleId = getAudioLifecycleId(entry.key);
    const lifecycleState = lifecycleStates ? getLifecycleState(lifecycleStates, lifecycleId) : null;
    const isContinuing = Boolean(lifecycleState?.activated);
    const forceSequenceStart = Array.isArray(section?.forcedNumberedSequenceTestKeys) &&
      section.forcedNumberedSequenceTestKeys.includes(entry.key);
    const localBar = forceSequenceStart || isContinuing ? allowedBars[0] : chooseOne(random, allowedBars);
    const startSeconds = section.startSeconds + localBar * section.barSeconds;
    const baseChance = forceSequenceStart ? 1 : getActivationChance(profile, 0.45);

    const sequenceDecisionResult = resolveRuleProfileDecision({
      random,
      plan,
      playbackState,
      kind: "audio",
      key: entry.key,
      entry,
      section,
      lifecycleStates,
      localBarIndex: localBar,
      startSeconds,
      baseChance,
      profile,
      allowLifecycleContinuation: true
    });

    if (!sequenceDecisionResult.allowed) return 0;

    applyCutoffRulesForAllowedDecision(playbackState, sequenceDecisionResult.context, profile);

    let scheduledCount = 0;
    let partStartSeconds = startSeconds;

    for (const sequenceItem of sequence) {
      const partEntry = sequenceItem.entry || getCatalogEntry(sequenceItem.key);
      const partBuffer = currentRenderBuffers?.get(sequenceItem.key);

      if (!partEntry || !partBuffer) {
        continue;
      }

      const scheduled = scheduleAudioBufferWithPlaybackState({
        offlineContext,
        destination,
        buffer: partBuffer,
        startTime: partStartSeconds,
        gainValue: sectionGainForAudio(partEntry, section),
        playbackState,
        key: sequenceItem.key,
        entry: partEntry,
        section
      });

      if (scheduled) {
        scheduledCount += 1;

        scheduledCount += scheduleDependentActivationFollowersForAudio({
          offlineContext,
          destination,
          buffers: currentRenderBuffers,
          random,
          plan,
          playbackState,
          section,
          lifecycleStates,
          sourceContext: sequenceDecisionResult.context,
          sourceProfile: getRuleProfileForEntry(partEntry),
          sourceKey: sequenceItem.key,
          startSeconds: partStartSeconds
        });
      }

      partStartSeconds += partBuffer.duration;
    }

    if (scheduledCount > 0 && lifecycleStates) {
      activateLifecycleItem(
        lifecycleStates,
        lifecycleId,
        `${section.id}:${entry.key}:normal_numbered_sequence`
      );
    }

    return scheduledCount;
  }

  function scheduleHookSynthBassSequence({
    offlineContext,
    destination,
    section,
    random,
    playbackState = null,
    lifecycleStates = null
  } = {}) {
    const keys = getHookSynthBassSequenceKeys(section);
    const partKeys = keys.slice(0, 3);
    const secondHookBassKey = keys[3];
    let startSeconds = section.startSeconds;
    let scheduledCount = 0;

    for (const key of partKeys) {
      const entry = getCatalogEntry(key);
      const buffer = currentRenderBuffers?.get(key);
      const partStartSeconds = startSeconds;

      if (buffer) {
        startSeconds += buffer.duration;
      }

      if (!entry || !buffer) continue;

      // Definition: each hook synth_bass stem/part has a 10% skip chance.
      // This is not dropout.
      if (chance(random, 0.1)) continue;

      const scheduled = scheduleAudioBufferWithPlaybackState({
        offlineContext,
        destination,
        buffer,
        startTime: partStartSeconds,
        gainValue: sectionGainForAudio(entry, section),
        playbackState,
        key,
        entry,
        section
      });

      if (scheduled) {
        scheduledCount += 1;

        if (lifecycleStates) {
          activateLifecycleItem(
            lifecycleStates,
            getAudioLifecycleId(key),
            `${section.id}:${key}:hook_synth_bass_sequence`
          );
        }
      }
    }

    if (secondHookBassKey) {
      const entry = getCatalogEntry(secondHookBassKey);
      const buffer = currentRenderBuffers?.get(secondHookBassKey);
      const startTime = section.startSeconds + section.barSeconds * 5;

      if (entry && buffer && startTime < section.endSeconds && !chance(random, 0.1)) {
        const scheduled = scheduleAudioBufferWithPlaybackState({
          offlineContext,
          destination,
          buffer,
          startTime,
          gainValue: sectionGainForAudio(entry, section),
          playbackState,
          key: secondHookBassKey,
          entry,
          section
        });

        if (scheduled) {
          scheduledCount += 1;

          if (lifecycleStates) {
            activateLifecycleItem(
              lifecycleStates,
              getAudioLifecycleId(secondHookBassKey),
              `${section.id}:${secondHookBassKey}:hook_synth_bass_sequence`
            );
          }
        }
      }
    }

    return scheduledCount;
  }

  function scheduleAudioStemInSection({ offlineContext, destination, key, buffer, random, plan = null, lifecycleStates = null, playbackState = null, section, buffers = null }) {
    const entry = getCatalogEntry(key);
    if (!entry || !buffer) return 0;
    if (!audioMatchesSection(entry, section)) return 0;

    if (shouldUseTrueBassCentralScheduler(entry, section)) {
      return 0;
    }

    const keyLower = key.toLowerCase();
    const gain = sectionGainForAudio(entry, section);
    const audioProfile = getRuleProfileForEntry(entry);

    if (isHookSynthBassSequenceKey(section, key)) {
      if (!isHookSynthBassSequenceTriggerKey(section, key)) {
        return 0;
      }

      return scheduleHookSynthBassSequence({
        offlineContext,
        destination,
        section,
        random,
        playbackState,
        lifecycleStates
      });
    }

    if (shouldSkipIndividualNormalAudioSequencePart(entry)) {
      return 0;
    }

    if (shouldScheduleNormalAudioSequenceAsGroup(entry)) {
      return scheduleNormalNumberedAudioSequence({
        offlineContext,
        destination,
        section,
        key,
        entry,
        random,
        plan,
        playbackState,
        lifecycleStates
      });
    }

    if (isSectionForcedAudioStartKey(section, key)) {
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

      return scheduled ? 1 : 0;
    }

    if (audioProfile.dependentActivationOnly || audioProfile.dependentOnly || audioProfile.activationMode === "dependent") {
      return 0;
    }

    function scheduleDependents(startSeconds, sourceContext = null) {
      return scheduleDependentActivationFollowersForAudio({
        offlineContext,
        destination,
        buffers: buffers || currentRenderBuffers,
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
      // Secret versions/events are handled by their own top-level systems.
      // Do not let alternate-download files appear as ordinary section audio.
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

    if (keyLower.includes("hook_drums_skip_intro")) {
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

    if (isLyrix(entry)) {
      return scheduleLyrixGroupInSection({
        offlineContext,
        destination,
        key,
        random,
        playbackState,
        section,
        buffers: buffers || currentRenderBuffers
      }) ? 1 : 0;
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

    if (isLikelyOneShot(entry)) {
      const allowedBars = getAllowedLocalBarIndexesForKey(key, section, audioProfile);
      const oneShotBaseChance = getActivationChance(audioProfile, 0.12);
      let scheduledCount = 0;

      for (const localBarIndex of allowedBars) {
        if (shouldBlockHookAfterSkipFirstBarAudioKey(key, section, localBarIndex)) {
          continue;
        }

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

    const allowEveryBarPhraseContinuation = shouldAllowEveryBarActiveContinuationForAudio(entry);
    const phraseAudioLifecycleId = getAudioLifecycleId(key);
    const phraseBarsToCheck = (
      allowEveryBarPhraseContinuation
        ? Array.from(
            { length: Math.max(0, Number(section?.bars || 0)) },
            (_, localBarIndex) => localBarIndex
          )
        : getAllowedLocalBarIndexesForKey(key, section, audioProfile)
    ).filter(localBarIndex => !shouldBlockHookAfterSkipFirstBarAudioKey(key, section, localBarIndex));

    if (!phraseBarsToCheck.length) return 0;

    const phraseBaseChance = getActivationChance(audioProfile, 0.45);
    let scheduledCount = 0;
    let nextAllowedPhraseStartSeconds = -Infinity;

    for (const localBar of phraseBarsToCheck) {
      if (!isContinuationAwareBarAllowedForKey({
        key,
        section,
        localBarIndex: localBar,
        profile: audioProfile,
        lifecycleStates,
        lifecycleId: phraseAudioLifecycleId,
        allowEveryBarContinuation: allowEveryBarPhraseContinuation
      })) {
        continue;
      }

      const startSeconds = section.startSeconds + localBar * section.barSeconds;

      // Do not layer the same phrase over itself while the previous scheduled copy is still playing.
      if (startSeconds < nextAllowedPhraseStartSeconds - 0.001) {
        continue;
      }

      const audioLifecycleId = getAudioLifecycleId(key);
      const wasActiveBeforeDecision = lifecycleStates
        ? Boolean(getLifecycleState(lifecycleStates, audioLifecycleId).activated)
        : false;

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
        profile: audioProfile,
        allowLifecycleContinuation: allowEveryBarPhraseContinuation
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
          // Use logical bar spacing for repeat blocking.
          // Do not use full exported WAV duration here, because reverb/tails can wrongly skip
          // the next valid activation opportunity.
          const logicalRepeatBlockSeconds = Number(section?.barSeconds || 0);
          nextAllowedPhraseStartSeconds = logicalRepeatBlockSeconds > 0
            ? startSeconds + logicalRepeatBlockSeconds
            : scheduled.endTime;

          if (lifecycleStates && audioLifecycleId && !wasActiveBeforeDecision) {
            activateLifecycleItem(
              lifecycleStates,
              audioLifecycleId,
              `${section.id}:${key}:${localBar}:phrase_audio`
            );
          }

          scheduledCount += scheduleDependents(startSeconds, audioDecisionResult.context);
        }
      }
    }

    return scheduledCount;
  }

  function buildAudioLifecycleDebugSummary(plan) {
    const selectedAudio = Array.isArray(plan?.selectedAudio) ? plan.selectedAudio : [];
    const sections = Array.isArray(plan?.sectionTimeline) ? plan.sectionTimeline : [];

    return selectedAudio.map(key => {
      const entry = getCatalogEntry(key);
      const plannedSections = sections
        .filter(section => audioMatchesSection(entry, section))
        .map(section => section.id);

      const scheduledSections = sections
        .filter(section => Array.isArray(section.scheduledAudioKeys) && section.scheduledAudioKeys.includes(key))
        .map(section => section.id);

      return {
        key,
        family: entry?.family || "",
        tags: entry?.tags || [],
        isAudio: Boolean(entry && isAudio(entry)),
        isLyrix: Boolean(entry && isLyrix(entry)),
        isOneShot: Boolean(entry && isLikelyOneShot(entry)),
        isNormalNumberedSequenceStart: Boolean(entry && shouldScheduleNormalAudioSequenceAsGroup(entry)),
        isNormalNumberedSequenceLaterPart: Boolean(entry && shouldSkipIndividualNormalAudioSequencePart(entry)),
        plannedSectionCount: plannedSections.length,
        scheduledSectionCount: scheduledSections.length,
        plannedSections,
        scheduledSections
      };
    });
  }

  function schedulePlan({ offlineContext, destination, buffers, plan, random, duration }) {
    const sections = plan.sectionTimeline || [];
    const lifecycleStates = createLifecycleMapFromPlan(plan);
    const playbackState = createPlaybackRuleState();

    function scheduleMidiPatternInSectionWithRules(pattern, section) {
      const midiLifecycleId = getMidiLifecycleId(pattern.file);

      if (!isLifecycleIdEligible(lifecycleStates, midiLifecycleId)) return 0;

      const allowEveryBarMidiContinuation = shouldAllowEveryBarActiveContinuationForMidi(pattern);
      const repeatEveryBars = allowEveryBarMidiContinuation ? 1 : getMidiRepeatEveryBars(pattern);
      const repeatEverySeconds = section.barSeconds * repeatEveryBars;
      let totalScheduledCount = 0;

      const sectionBarCount = Math.max(0, Number(section?.bars || 0));

      for (let localBarIndex = 0; localBarIndex < sectionBarCount; localBarIndex += repeatEveryBars) {
        const t = section.startSeconds + localBarIndex * section.barSeconds;

        const forcedInSection = isSectionForcedMidiPattern(section, pattern.file);

        if (forcedInSection) {
          if (!isForcedMidiLocalBarAllowed(section, pattern.file, localBarIndex)) {
            continue;
          }

          const scheduledCount = scheduleMidiPattern({
            offlineContext,
            destination,
            pattern,
            buffers,
            barStart: t,
            beatSeconds: section.barSeconds / 4,
            gainValue: 0.62,
            playbackState,
            section,
            localBarIndex
          });

          if (scheduledCount > 0) {
            totalScheduledCount += scheduledCount;
            activateLifecycleItem(
              lifecycleStates,
              midiLifecycleId,
              `${section.id}:${t}:forced`
            );
          }

          continue;
        }

        const midiProfile = getRuleProfileForMidiPattern(pattern);

        if (!isContinuationAwareBarAllowedForKey({
          key: pattern.file,
          section,
          localBarIndex,
          lifecycleStates,
          lifecycleId: midiLifecycleId,
          allowEveryBarContinuation: allowEveryBarMidiContinuation
        })) {
          continue;
        }

        if (shouldSkipMidiPatternAtSectionBar(pattern, section, localBarIndex)) {
          continue;
        }

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
            section,
            localBarIndex
          });

          if (scheduledCount > 0) {
            totalScheduledCount += scheduledCount;
            activateLifecycleItem(
              lifecycleStates,
              midiLifecycleId,
              `${section.id}:${t}`
            );
          }
        }
      }

      return totalScheduledCount;
    }


    function scheduleHookJazzHatsPairInSectionWithRules(patternPair, section) {
      if (!Array.isArray(patternPair) || patternPair.length !== 2) return 0;

      const [driverPattern, companionPattern] = patternPair;
      const driverLifecycleId = getMidiLifecycleId(driverPattern.file);
      const companionLifecycleId = getMidiLifecycleId(companionPattern.file);

      if (!isLifecycleIdEligible(lifecycleStates, driverLifecycleId)) return 0;
      if (!isLifecycleIdEligible(lifecycleStates, companionLifecycleId)) return 0;

      const repeatEveryBars = getMidiRepeatEveryBars(driverPattern);
      const repeatEverySeconds = section.barSeconds * repeatEveryBars;
      const midiProfile = getRuleProfileForMidiPattern(driverPattern);
      const midiBaseChance = getActivationChance(midiProfile, 0.7);
      let totalScheduledCount = 0;

      for (
        let t = section.startSeconds, localBarIndex = 0;
        t < section.startSeconds + section.duration - 0.001;
        t += repeatEverySeconds, localBarIndex += repeatEveryBars
      ) {
        const midiDecisionResult = resolveRuleProfileDecision({
          random,
          plan,
          playbackState,
          kind: "midi",
          pattern: driverPattern,
          section,
          lifecycleStates,
          localBarIndex,
          baseChance: midiBaseChance,
          profile: midiProfile
        });

        if (!midiDecisionResult.allowed) continue;

        applyCutoffRulesForAllowedDecision(playbackState, midiDecisionResult.context, midiProfile);

        for (const pattern of patternPair) {
          const scheduledCount = scheduleMidiPattern({
            offlineContext,
            destination,
            pattern,
            buffers,
            barStart: t,
            beatSeconds: section.barSeconds / 4,
            gainValue: 0.62,
            playbackState,
            section,
            localBarIndex,
            metadata: {
              sectionType: section.type,
              sectionIndex: section.index,
              reason: "hook_jazz_hats_group"
            }
          });

          totalScheduledCount += scheduledCount;
        }
      }

      return totalScheduledCount;
    }
    for (const section of sections) {
      expirePlaybackItemsAtTime(playbackState, section.startSeconds);
      const sectionMidiKeys = Array.isArray(section.selectedMidi) ? section.selectedMidi : plan.selectedMidi;
      const sectionMidi = sectionMidiKeys
        .map(file => {
          const pattern = midiPatterns.patterns.find(item => item.file === file);
          const noteLimit = section.midiNoteLimits?.[file];

          if (!pattern || !Number.isFinite(noteLimit)) {
            return pattern;
          }

          return {
            ...pattern,
            notes: Array.isArray(pattern.notes)
              ? pattern.notes.slice(0, Math.max(0, Math.floor(noteLimit)))
              : pattern.notes
          };
        })
        .filter(Boolean)
        .filter(pattern => midiMatchesSection(pattern, section));
      const sectionHasJazzRideWithHatsVariant = sectionMidi.some(isJazzRideWithHatsVariantPattern);
      const hookJazzHatsPair = getHookJazzHatsPairFromSectionMidi(sectionMidi);
      const sectionMidiBeforeAudio = sectionMidi
        .filter(pattern => !isJazzRideWithHatsVariantPattern(pattern))
        .filter(pattern => !isHookJazzHatsPattern(pattern));


      for (const pattern of sectionMidiBeforeAudio) {
        scheduleMidiPatternInSectionWithRules(pattern, section);
      }

      if (hookJazzHatsPair.length) {
        scheduleHookJazzHatsPairInSectionWithRules(hookJazzHatsPair, section);
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
      }
      if (section.type.includes("lyrix") && !section.lyrixSectionId) {
        const hasAnySelectedLyrix = plan.selectedAudio.some(key => {
          const entry = getCatalogEntry(key);
          return entry && isLyrix(entry);
        });

        if (!hasAnySelectedLyrix) {
          const lyrixCandidates = getAllCatalogEntries().filter(entry =>
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
        lyrixKeysForThisSection.length
          ? chooseOne(random, lyrixKeysForThisSection)
          : null;

      const scheduledLyrixGroupIds = new Set();

      scheduleTrueBassSystemInSection({
        offlineContext,
        destination,
        buffers,
        plan,
        random,
        playbackState,
        lifecycleStates,
        section
      });

      scheduleCentralInstrumentFamilySystemsInSection({
        offlineContext,
        destination,
        buffers,
        plan,
        random,
        playbackState,
        lifecycleStates,
        section
      });

      // central_instrument_family_scheduler_inserted_after_true_bass

      for (const key of plan.selectedAudio) {
        const entry = getCatalogEntry(key);
        const audioLifecycleId = getAudioLifecycleId(key);

        if (!isLifecycleIdEligible(lifecycleStates, audioLifecycleId)) continue;


        if (entry && isLyrix(entry)) {
          if (section.lyrixSectionId || section.type.includes("outburst")) continue;
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
          section,
          buffers
        });

        if (scheduledCount > 0 && !getLifecycleState(lifecycleStates, audioLifecycleId).activated) {
          activateLifecycleItem(
            lifecycleStates,
            audioLifecycleId,
            `${section.id}:${key}`
          );
        }
      }
      if (sectionHasJazzRideWithHatsVariant) {
        const jazzRidePatternForSection = chooseJazzRideWithHatsVariantForSection(section, sectionMidi);

        if (jazzRidePatternForSection) {
          scheduleMidiPatternInSectionWithRules(jazzRidePatternForSection, section);
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
    plan.audioLifecycleDebugSummary = buildAudioLifecycleDebugSummary(plan);
  }

  function getSecretBypassVersions() {
    const configured = catalog?.rulePools?.secretBypassVersions;

    if (Array.isArray(configured) && configured.length) {
      return configured;
    }

    return [
      {
        id: "harmonia",
        file: "alternate downloads/harmonia.wav",
        probability: 0.001
      },
      {
        id: "pimp_triplets",
        file: "alternate downloads/pimp_triplets.wav",
        probability: 0.001
      },
      {
        id: "secret_message_1",
        file: "alternate downloads/secret_message_1.wav",
        probability: 0.001
      },
      {
        id: "secret_message_2",
        file: "alternate downloads/secret_message_2.wav",
        probability: 0.001
      }
    ];
  }

  function getForcedSecretBypassVersion() {
    const params = new URLSearchParams(window.location.search);
    const forcedId = String(params.get("forceSecret") || params.get("forceSecretBypass") || "")
      .trim()
      .toLowerCase();

    if (!forcedId) return null;

    return getSecretBypassVersions().find(secretBypass => {
      const id = String(secretBypass.id || "").toLowerCase();
      const file = String(secretBypass.file || "").toLowerCase();
      const filename = file.split("/").pop() || "";
      const filenameNoExtension = filename.replace(/\.[^.]+$/, "");

      return (
        forcedId === id ||
        forcedId === filename ||
        forcedId === filenameNoExtension
      );
    }) || null;
  }

  function chooseSecretBypassVersion(random) {
    const forcedSecretBypass = getForcedSecretBypassVersion();

    if (forcedSecretBypass) {
      return forcedSecretBypass;
    }

    let roll = random();

    for (const secretBypass of getSecretBypassVersions()) {
      const probability = clampProbability(secretBypass.probability);

      if (roll < probability) {
        return secretBypass;
      }

      roll -= probability;
    }

    return null;
  }

  async function renderSecretBypassVersion({ format, sampleRate, secretBypass }) {
    const file = secretBypass.file;
    const id = secretBypass.id || "secret_bypass";

    setStatus(`SECRET BYPASS / ${id} / SEED ${currentSeed}`);

    const decodeContext = new OfflineAudioContext(2, sampleRate, sampleRate);
    const buffer = await fetchAndDecode(decodeContext, file);
    const duration = Math.max(buffer.duration, 1 / sampleRate);

    const offlineContext = new OfflineAudioContext(
      2,
      Math.ceil(duration * sampleRate),
      sampleRate
    );

    currentRenderBuffers = new Map([[file, buffer]]);

    scheduleBuffer(offlineContext, offlineContext.destination, buffer, 0, 1);

    setStatus(`RENDERING ${format.toUpperCase()} / SECRET BYPASS ${id}`);

    const renderedBuffer = await offlineContext.startRendering();

    if (format === "wav") {
      const wavBlob = audioBufferToWavBlob(renderedBuffer);
      downloadBlob(wavBlob, `test-project-2-secret-${id}-seed-${currentSeed}.wav`);
    }

    if (format === "mp3") {
      await ensureLameJs();
      const mp3Blob = audioBufferToMp3Blob(renderedBuffer);
      downloadBlob(mp3Blob, `test-project-2-secret-${id}-seed-${currentSeed}.mp3`);
    }

    currentSeed = makeSeed();
    applyRandomColourScheme();
  }

  function getUrlBooleanFlag(...names) {
    const params = new URLSearchParams(window.location.search);

    return names.some(name => {
      const rawValue = params.get(name);

      if (rawValue === null) return false;

      const value = String(rawValue).trim().toLowerCase();

      return value === "" || value === "1" || value === "true" || value === "yes";
    });
  }

  function chooseGlobalFadeOptions(random) {
    const forcedFadeIn = getUrlBooleanFlag("forceFadeIn", "forceGlobalFadeIn");
    const forcedFadeOut = getUrlBooleanFlag("forceFadeOut", "forceGlobalFadeOut");
    const disabledFadeIn = getUrlBooleanFlag("noFadeIn", "disableFadeIn");
    const disabledFadeOut = getUrlBooleanFlag("noFadeOut", "disableFadeOut");

    return {
      fadeIn: disabledFadeIn ? false : (forcedFadeIn || chance(random, 0.1)),
      fadeOut: disabledFadeOut ? false : (forcedFadeOut || chance(random, 0.1)),
      fadeSeconds: 30,
      shape: "exponential",
      forcedFadeIn,
      forcedFadeOut
    };
  }

  function getExponentialFadeMultiplier(progress, fadeOut = false) {
    const minGain = 0.0001;
    const safeProgress = Math.max(0, Math.min(1, Number(progress) || 0));

    return fadeOut
      ? Math.exp(Math.log(minGain) * safeProgress)
      : Math.exp(Math.log(minGain) * (1 - safeProgress));
  }

  function applyGlobalFadeToRenderedBuffer(renderedBuffer, options = {}) {
    if (!renderedBuffer) return renderedBuffer;

    const fadeSeconds = Math.max(0, Number(options.fadeSeconds) || 0);
    const sampleRate = renderedBuffer.sampleRate || 44100;
    const totalSamples = renderedBuffer.length || 0;
    const fadeSamples = Math.min(totalSamples, Math.floor(fadeSeconds * sampleRate));

    if (fadeSamples <= 0) return renderedBuffer;

    for (let channel = 0; channel < renderedBuffer.numberOfChannels; channel++) {
      const data = renderedBuffer.getChannelData(channel);

      if (options.fadeIn) {
        for (let i = 0; i < fadeSamples; i++) {
          const progress = fadeSamples <= 1 ? 1 : i / (fadeSamples - 1);
          data[i] *= getExponentialFadeMultiplier(progress, false);
        }
      }

      if (options.fadeOut) {
        const fadeStart = totalSamples - fadeSamples;

        for (let i = 0; i < fadeSamples; i++) {
          const progress = fadeSamples <= 1 ? 1 : i / (fadeSamples - 1);
          data[fadeStart + i] *= getExponentialFadeMultiplier(progress, true);
        }
      }
    }

    return renderedBuffer;
  }

  function getPlanRenderDuration(plan, fallbackDuration) {
    const plannedDuration = Number(plan?.plannedDurationSeconds);

    if (Number.isFinite(plannedDuration) && plannedDuration > 0) {
      return Math.max(plannedDuration, 1);
    }

    return Math.max(180, Number(fallbackDuration) || 180);
  }

  async function renderTrack(format) {
    const random = mulberry32(currentSeed);
    const sampleRate = rules.sampleRate || 44100;
    const fallbackDuration = Math.max(180, rules.songLengthSeconds || 180);
    const secretBypass = chooseSecretBypassVersion(mulberry32((currentSeed ^ 0x9E3779B9) >>> 0));

    if (secretBypass) {
      await renderSecretBypassVersion({
        format,
        sampleRate,
        secretBypass
      });
      return;
    }

    setStatus(`BUILDING FULL PLAN / SEED ${currentSeed}`);

    const plan = buildFullPlan(random);
    const duration = getPlanRenderDuration(plan, fallbackDuration);
    const globalFadeOptions = chooseGlobalFadeOptions(mulberry32((currentSeed ^ 0xFADE30) >>> 0));

    if (plan.disableGlobalFadeIn) {
      globalFadeOptions.fadeIn = false;
      globalFadeOptions.disabledByHookDrumsSkipIntro = true;
    } else if (plan.forceGlobalFadeIn) {
      globalFadeOptions.fadeIn = true;
      globalFadeOptions.forcedByHookStart = true;
    }

    console.log("[global fade options]", globalFadeOptions);

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

    if (shouldDownloadDebugPlan()) {
      downloadJsonDebugFile(
        createDebugPlanSnapshot(plan, {
          format,
          duration,
          sampleRate,
          selectedAudioCount: plan.selectedAudio.length,
          selectedMidiCount: plan.selectedMidi.length,
          sectionCount: Array.isArray(plan.sectionTimeline) ? plan.sectionTimeline.length : 0,
          debugMode: "json_only_no_audio_render"
        }),
        `test-project-2-debug-plan-seed-${currentSeed}.json`
      );

      setStatus(`DEBUG PLAN JSON DOWNLOADED / SEED ${currentSeed}`);
      currentSeed = makeSeed();
      applyRandomColourScheme();
      return;
    }

    const renderedBuffer = await offlineContext.startRendering();

    applyGlobalFadeToRenderedBuffer(renderedBuffer, globalFadeOptions);

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

  function createDebugPlanSnapshot(plan, extra = {}) {
    return {
      createdAt: new Date().toISOString(),
      seed: currentSeed,
      ...extra,
      plan
    };
  }

  function downloadJsonDebugFile(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    downloadBlob(blob, filename);
  }

  function shouldDownloadDebugPlan() {
    return getUrlBooleanFlag("debugPlan", "downloadDebugPlan", "debugJson");
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
