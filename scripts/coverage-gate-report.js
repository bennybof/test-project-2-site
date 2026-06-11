#!/usr/bin/env node
/*
  Test Project 2 coverage gate report.

  Report-only helper. It reads current repo data, runs seeded build-plan simulations,
  optionally runs scheduling reachability with fake buffers, and writes:
    - reports/coverage-gate-report.json
    - reports/coverage-gate-report.md

  It does not edit planner, renderer, catalog, registry, or rules files.
*/

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = process.env.TP2_ROOT
  ? path.resolve(process.env.TP2_ROOT)
  : path.resolve(__dirname, "..");

const BUILD_SIM_COUNT = Number(process.env.TP2_COVERAGE_BUILD_SIMS || 400);
const SCHEDULE_SIM_COUNT = Number(process.env.TP2_COVERAGE_SCHEDULE_SIMS || 40);
const SAMPLE_RATE = 44100;

function readTextIfExists(...parts) {
  const filePath = path.join(...parts);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function readJsonRequired(...parts) {
  const filePath = path.join(...parts);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${path.relative(ROOT, filePath)}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function readJsonOptional(...parts) {
  const filePath = path.join(...parts);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function countBy(values, getKey) {
  const out = new Map();
  for (const value of values) increment(out, getKey(value));
  return out;
}

function mapToSortedObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function topFromCountMap(map, limit = 25) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function profileMarksDependentOnly(profile) {
  return !!(
    profile &&
    typeof profile === "object" &&
    (
      profile.dependentActivationOnly === true ||
      profile.dependentOnly === true ||
      profile.activationMode === "dependent"
    )
  );
}

function collectRuleProfilesForKey(catalog, registryByKey, key) {
  const profiles = catalog?.rulePools?.ruleProfiles || {};
  const entry = registryByKey?.get(key) || null;
  const out = [];

  const byTag = profiles.byTag || {};
  for (const tag of entry?.tags || []) {
    if (byTag[tag]) out.push(byTag[tag]);
  }

  const byFamily = profiles.byFamily || {};
  if (entry?.family && byFamily[entry.family]) {
    out.push(byFamily[entry.family]);
  }

  const byKeyPattern = profiles.byKeyPattern || {};
  for (const [patternKey, profile] of Object.entries(byKeyPattern)) {
    if (!patternKey.startsWith("regex:")) continue;

    try {
      if (new RegExp(patternKey.slice("regex:".length)).test(key)) {
        out.push(profile);
      }
    } catch {
      // Ignore invalid report-only regex profile keys.
    }
  }

  const byKey = profiles.byKey || {};
  if (byKey[key]) out.push(byKey[key]);

  return out;
}

function isDependentOnlyAudioKey(catalog, registryByKey, key) {
  return collectRuleProfilesForKey(catalog, registryByKey, key).some(profileMarksDependentOnly);
}

function percentile(sortedNumbers, p) {
  if (!sortedNumbers.length) return null;
  const idx = (sortedNumbers.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedNumbers[lo];
  const weight = idx - lo;
  return sortedNumbers[lo] * (1 - weight) + sortedNumbers[hi] * weight;
}

function secondsToClock(seconds) {
  if (!Number.isFinite(seconds)) return "n/a";
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = total - minutes * 60;
  return `${minutes}:${secs.toFixed(1).padStart(4, "0")}`;
}

function parseFolderTreeFiles(text) {
  if (!text) return [];

  const results = [];
  const stack = [];
  let currentTopFolder = "";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\uFEFF/g, "").replace(/Ã¯Â¿Â½/g, "Ã¢â€â€š");
    const match = line.match(/^(.*?)(?:[Ã¢â€Å“Ã¢â€â€]Ã¢â€â‚¬Ã¢â€â‚¬|\\---|\+---)\s*(.+)$/);

    if (match) {
      const prefix = match[1] || "";
      const name = (match[2] || "").trim();
      if (!name || name.includes("<DIR>")) continue;

      const depth = Math.floor(prefix.replace(/[^Ã¢â€â€š| ]/g, "").length / 4);
      stack.length = depth;

      if (/\.[A-Za-z0-9]{2,5}$/.test(name)) {
        results.push([...stack, name].join("/").replace(/\\/g, "/"));
      } else {
        stack[depth] = name;
        if (depth === 0) currentTopFolder = name;
      }

      continue;
    }

    const trimmed = line.trim().replace(/\\/g, "/");
    const cleaned = line.replace(/^[Ã¢â€â€š|\s]+/, "").trim().replace(/\\/g, "/");

    // Windows `tree /f` copied through chat can lose box-drawing characters.
    // In that case, top folders still arrive as `+---folder`, and files below
    // them arrive as indented bare filenames. Use the current stack as fallback.
    const topMatch = trimmed.match(/^\+---(.+)$/);
    if (topMatch) {
      currentTopFolder = topMatch[1].trim();
      stack.length = 0;
      stack[0] = currentTopFolder;
      continue;
    }

    if (/\.[A-Za-z0-9]{2,5}$/.test(cleaned)) {
      if (/^(samples|lyrix|midi files|alternate downloads)\/.*\.[A-Za-z0-9]{2,5}$/i.test(cleaned)) {
        results.push(cleaned);
      } else if (stack.length) {
        results.push([...stack, cleaned].join("/"));
      } else if (currentTopFolder) {
        results.push(`${currentTopFolder}/${cleaned}`);
      }
    }
  }

  return uniqueSorted(results);
}

function collectStringRefs(value, predicate, out = []) {
  if (typeof value === "string") {
    if (predicate(value)) out.push(value);
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStringRefs(item, predicate, out);
    return out;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStringRefs(item, predicate, out);
  }

  return out;
}

function makePlaceholderMidiPatterns(catalog) {
  const catalogPatterns = catalog?.rulePools?.midi?.patterns || [];
  return {
    version: "coverage-placeholder-from-full-rules-catalog",
    coveragePlaceholder: true,
    patterns: catalogPatterns.map(pattern => ({
      ...pattern,
      notes: Array.isArray(pattern.notes) && pattern.notes.length
        ? pattern.notes
        : [{ beats: 0, velocity01: 0.7 }],
      samplePath: pattern.samplePath || "midi files/samples/placeholder.wav"
    }))
  };
}

function createFakeNode() {
  return {
    connect() { return createFakeNode(); },
    disconnect() {},
    gain: {
      value: 1,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {}
    }
  };
}

function createFakeOfflineContext(durationSeconds) {
  return {
    sampleRate: SAMPLE_RATE,
    length: Math.ceil(Math.max(1, durationSeconds) * SAMPLE_RATE),
    destination: createFakeNode(),
    createGain() { return createFakeNode(); },
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        start() {},
        stop() {}
      };
    }
  };
}

function createFakeBuffer(duration = 4.2857142857) {
  return {
    duration,
    sampleRate: SAMPLE_RATE,
    length: Math.ceil(duration * SAMPLE_RATE),
    numberOfChannels: 2
  };
}

function createRendererApi(rendererPath) {
  const rendererSource = fs.readFileSync(rendererPath, "utf8").replace(/^\uFEFF/, "");

  let instrumented = rendererSource.replace(
    /scheduledCount \+= 1;\s+registerScheduledPlaybackHandle/,
    `scheduledCount += 1;

        if (section && pattern?.file) {
          if (!Array.isArray(section.scheduledMidiKeys)) section.scheduledMidiKeys = [];
          if (!section.scheduledMidiKeys.includes(pattern.file)) section.scheduledMidiKeys.push(pattern.file);
        }

        registerScheduledPlaybackHandle`
  );

  instrumented = instrumented.replace(/\s*init\(\);\s*\}\)\(\);\s*$/, `
  globalThis.__tp2CoverageApi = {
    setData(data) {
      rules = data.rules || { songLengthSeconds: 180, sampleRate: 44100, masterGain: 0.72 };
      catalog = data.catalog;
      midiPatterns = data.midiPatterns;
      lyrixRules = data.lyrixRules;

      if (!catalog.entries || !catalog.entries.length) {
        catalog.entries = data.registry.entries;
      }

      catalog.entriesByKey = new Map((catalog.entries || []).map(entry => [entry.key, entry]));
    },
    buildFullPlan,
    schedulePlan,
    mulberry32,
    getPlanRenderDuration
  };
})();
`);

  if (!instrumented.includes("__tp2CoverageApi")) {
    throw new Error("Could not instrument full-renderer.js. Terminal init() pattern was not found.");
  }

  const fakeElement = {
    addEventListener() {},
    setAttribute() {},
    remove() {},
    click() {},
    style: {},
    textContent: "",
    href: ""
  };

  const rendererConsole = process.env.TP2_COVERAGE_VERBOSE === "1"
    ? console
    : { log() {}, info() {}, debug() {}, warn() {}, error() {} };

  const context = {
    console: rendererConsole,
    Map,
    Set,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Date,
    JSON,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    window: {
      location: { search: "" },
      crypto: {
        getRandomValues(values) {
          for (let i = 0; i < values.length; i++) values[i] = (123456789 + i) >>> 0;
          return values;
        }
      }
    },
    document: {
      getElementById() { return fakeElement; },
      createElement() { return { ...fakeElement, style: {} }; },
      body: { appendChild() {}, style: {} }
    },
    URL: {
      createObjectURL() { return "blob:coverage-report"; },
      revokeObjectURL() {}
    },
    Blob: function Blob() {},
    fetch: async () => { throw new Error("fetch is disabled in coverage report"); },
    AudioContext: function AudioContext() {},
    OfflineAudioContext: function OfflineAudioContext() {}
  };

  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(instrumented, context, { filename: rendererPath });

  if (!context.__tp2CoverageApi) {
    throw new Error("Renderer API was not exposed for coverage reporting.");
  }

  return context.__tp2CoverageApi;
}

function collectScheduledFromPlan(plan) {
  const scheduledAudio = [];
  const scheduledMidi = [];

  for (const section of plan.sectionTimeline || []) {
    if (Array.isArray(section.scheduledAudioKeys)) scheduledAudio.push(...section.scheduledAudioKeys);
    if (Array.isArray(section.scheduledMidiKeys)) scheduledMidi.push(...section.scheduledMidiKeys);
  }

  return {
    scheduledAudio: uniqueSorted(scheduledAudio),
    scheduledMidi: uniqueSorted(scheduledMidi)
  };
}

function familyOfEntry(entry) {
  return entry?.family || String(entry?.key || "").split("/").pop().split("_")[0] || "unknown";
}

function main() {
  const rendererPath = path.join(ROOT, "full-renderer.js");
  const dataDir = path.join(ROOT, "data");
  const reportsDir = path.join(ROOT, "reports");

  if (!fs.existsSync(rendererPath)) {
    throw new Error(`Missing full-renderer.js at repo root: ${rendererPath}`);
  }

  const rules = readJsonOptional(dataDir, "rules.json") || {
    songLengthSeconds: 180,
    sampleRate: SAMPLE_RATE,
    masterGain: 0.72
  };
  const catalog = readJsonRequired(dataDir, "full-rules-catalog.json");
  const registry = readJsonRequired(dataDir, "stem-registry.json");
  const r2Manifest = readJsonRequired(dataDir, "r2-manifest.json");
  const lyrixRules = readJsonRequired(dataDir, "lyrix-rules.json");
  const folderTreeText = readTextIfExists(ROOT, "folder-tree.txt");
  const folderTreeFiles = parseFolderTreeFiles(folderTreeText);

  let midiPatterns = readJsonOptional(dataDir, "midi-patterns.json");
  const midiPatternsMissing = !midiPatterns;

  if (midiPatternsMissing) {
    midiPatterns = makePlaceholderMidiPatterns(catalog);
  }

  const registryEntries = registry.entries || [];
  const registryByKey = new Map(registryEntries.map(entry => [entry.key, entry]));
  const registryKeys = new Set(registryEntries.map(entry => entry.key));
  const manifestKeys = new Set(r2Manifest);
  const catalogKeys = new Set(catalog.allKeys || []);
  const folderTreeKeys = new Set(folderTreeFiles);

  const lyrixRefs = uniqueSorted(collectStringRefs(
    lyrixRules,
    value => /^lyrix\/.*\.(wav|mp3)$/i.test(value)
  ));

  const missing = {
    manifestNotRegistry: uniqueSorted([...manifestKeys].filter(key => !registryKeys.has(key))),
    registryNotManifest: uniqueSorted([...registryKeys].filter(key => !manifestKeys.has(key))),
    catalogNotRegistry: uniqueSorted([...catalogKeys].filter(key => !registryKeys.has(key))),
    registryNotCatalog: uniqueSorted([...registryKeys].filter(key => !catalogKeys.has(key))),
    folderTreeNotManifest: folderTreeFiles.length ? uniqueSorted([...folderTreeKeys].filter(key => !manifestKeys.has(key))) : [],
    manifestNotFolderTree: folderTreeFiles.length ? uniqueSorted([...manifestKeys].filter(key => !folderTreeKeys.has(key))) : [],
    lyrixRefsMissingManifest: uniqueSorted(lyrixRefs.filter(key => !manifestKeys.has(key))),
    lyrixRefsMissingRegistry: uniqueSorted(lyrixRefs.filter(key => !registryKeys.has(key)))
  };

  const api = createRendererApi(rendererPath);
  api.setData({ rules, catalog, registry, midiPatterns, lyrixRules });

  const selectedAudioCounts = new Map();
  const selectedMidiCounts = new Map();
  const scheduledPoolSelectedAudioCounts = new Map();
  const scheduledPoolSelectedMidiCounts = new Map();
  const scheduledAudioCounts = new Map();
  const scheduledMidiCounts = new Map();
  const lyrixSectionCounts = new Map();
  const sectionTypeCounts = new Map();
  const durations = [];
  const sectionCounts = [];
  const scheduleErrors = [];

  for (let seed = 1; seed <= BUILD_SIM_COUNT; seed++) {
    const random = api.mulberry32(seed);
    const plan = api.buildFullPlan(random);

    for (const key of plan.selectedAudio || []) increment(selectedAudioCounts, key);
    for (const key of plan.selectedMidi || []) increment(selectedMidiCounts, key);

    for (const section of plan.sectionTimeline || []) {
      increment(sectionTypeCounts, section.type || "unknown");
      if (section.lyrixSectionId) increment(lyrixSectionCounts, section.lyrixSectionId);
    }

    const duration = api.getPlanRenderDuration(plan, rules.songLengthSeconds || 180);
    durations.push(duration);
    sectionCounts.push((plan.sectionTimeline || []).length);

    if (seed <= SCHEDULE_SIM_COUNT) {
      for (const key of plan.selectedAudio || []) increment(scheduledPoolSelectedAudioCounts, key);
      for (const key of plan.selectedMidi || []) increment(scheduledPoolSelectedMidiCounts, key);

      try {
        const buffers = new Map();
        for (const key of plan.selectedAudio || []) buffers.set(key, createFakeBuffer());
        for (const midiFile of plan.selectedMidi || []) {
          const pattern = (midiPatterns.patterns || []).find(item => item.file === midiFile);
          if (pattern?.samplePath) buffers.set(pattern.samplePath, createFakeBuffer(1));
        }

        const offlineContext = createFakeOfflineContext(duration);
        api.schedulePlan({
          offlineContext,
          destination: offlineContext.destination,
          buffers,
          plan,
          random: api.mulberry32(seed + 100000),
          duration
        });

        const scheduled = collectScheduledFromPlan(plan);
        for (const key of scheduled.scheduledAudio) increment(scheduledAudioCounts, key);
        for (const key of scheduled.scheduledMidi) increment(scheduledMidiCounts, key);
      } catch (error) {
        scheduleErrors.push({ seed, message: error.message || String(error) });
      }
    }
  }

  const selectedAudio = new Set(selectedAudioCounts.keys());
  const selectedMidi = new Set(selectedMidiCounts.keys());
  const scheduledPoolSelectedAudio = new Set(scheduledPoolSelectedAudioCounts.keys());
  const scheduledPoolSelectedMidi = new Set(scheduledPoolSelectedMidiCounts.keys());
  const scheduledAudio = new Set(scheduledAudioCounts.keys());
  const scheduledMidi = new Set(scheduledMidiCounts.keys());

  const audioRegistryEntries = registryEntries.filter(entry => entry.type === "audio");
  const midiRegistryEntries = registryEntries.filter(entry => entry.type === "midi");
  const sampleAudioEntries = audioRegistryEntries.filter(entry => entry.folder === "samples");
  const lyrixAudioEntries = audioRegistryEntries.filter(entry => entry.folder === "lyrix");

  const noObservedAudioInclusion = audioRegistryEntries
    .filter(entry => catalogKeys.has(entry.key))
    .filter(entry => !selectedAudio.has(entry.key))
    .map(entry => entry.key);

  const selectedAudioNotScheduled = [...scheduledPoolSelectedAudio]
    .filter(key => !scheduledAudio.has(key))
    .sort((a, b) => (scheduledPoolSelectedAudioCounts.get(b) || 0) - (scheduledPoolSelectedAudioCounts.get(a) || 0) || a.localeCompare(b));

  const selectedDependentOnlyAudioNotScheduled = selectedAudioNotScheduled
    .filter(key => isDependentOnlyAudioKey(catalog, registryByKey, key));

  const selectedNonDependentAudioNotScheduled = selectedAudioNotScheduled
    .filter(key => !isDependentOnlyAudioKey(catalog, registryByKey, key));

  const selectedMidiNotScheduled = [...scheduledPoolSelectedMidi]
    .filter(key => !scheduledMidi.has(key))
    .sort((a, b) => (scheduledPoolSelectedMidiCounts.get(b) || 0) - (scheduledPoolSelectedMidiCounts.get(a) || 0) || a.localeCompare(b));

  const neverSelectedMidi = midiRegistryEntries
    .map(entry => entry.key)
    .filter(key => !selectedMidi.has(key))
    .sort();

  const lyrixSectionIds = (lyrixRules.sections || []).map(section => section.id).filter(Boolean).sort();
  const lyrixSectionsSeen = [...lyrixSectionCounts.keys()].sort();
  const lyrixSectionsNeverSeen = lyrixSectionIds.filter(id => !lyrixSectionCounts.has(id));

  const unselectedFamilies = countBy(
    audioRegistryEntries
      .filter(entry => catalogKeys.has(entry.key))
      .filter(entry => !selectedAudio.has(entry.key)),
    familyOfEntry
  );

  const sortedDurations = durations.slice().sort((a, b) => a - b);
  const sortedSectionCounts = sectionCounts.slice().sort((a, b) => a - b);
  const durationStats = {
    min: percentile(sortedDurations, 0),
    p05: percentile(sortedDurations, 0.05),
    p25: percentile(sortedDurations, 0.25),
    median: percentile(sortedDurations, 0.5),
    p75: percentile(sortedDurations, 0.75),
    p95: percentile(sortedDurations, 0.95),
    max: percentile(sortedDurations, 1),
    mean: durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length)
  };

  const report = {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    sim: {
      buildSimCount: BUILD_SIM_COUNT,
      scheduleSimCount: SCHEDULE_SIM_COUNT,
      scheduleErrorCount: scheduleErrors.length,
      scheduleErrors: scheduleErrors.slice(0, 25)
    },
    sourceCounts: {
      r2Manifest: r2Manifest.length,
      folderTreeFiles: folderTreeFiles.length || null,
      registryEntries: registryEntries.length,
      registryAudio: audioRegistryEntries.length,
      registryMidi: midiRegistryEntries.length,
      registrySamplesAudio: sampleAudioEntries.length,
      registryLyrixAudio: lyrixAudioEntries.length,
      catalogAllKeys: catalogKeys.size,
      lyrixRuleFileRefs: lyrixRefs.length,
      lyrixSections: lyrixSectionIds.length,
      midiPatterns: (midiPatterns.patterns || []).length,
      midiPatternsMissing
    },
    missing,
    reachability: {
      selectedAudioCount: selectedAudio.size,
      scheduledAudioCount: scheduledAudio.size,
      selectedMidiCount: selectedMidi.size,
      scheduledMidiCount: scheduledMidi.size,
      audioNoObservedInclusionPathCount: noObservedAudioInclusion.length,
      selectedAudioNotScheduledTotalCount: selectedAudioNotScheduled.length,
      selectedAudioNotScheduledCount: selectedNonDependentAudioNotScheduled.length,
      selectedDependentOnlyAudioNotScheduledCount: selectedDependentOnlyAudioNotScheduled.length,
      selectedMidiNotScheduledCount: selectedMidiNotScheduled.length,
      neverSelectedMidiCount: neverSelectedMidi.length,
      generalSamplesSelectedCount: sampleAudioEntries.filter(entry => selectedAudio.has(entry.key)).length,
      generalSamplesScheduledCount: sampleAudioEntries.filter(entry => scheduledAudio.has(entry.key)).length,
      generalSamplesNoObservedInclusionCount: sampleAudioEntries.filter(entry => !selectedAudio.has(entry.key)).length,
      lyrixAudioSelectedCount: lyrixAudioEntries.filter(entry => selectedAudio.has(entry.key)).length,
      lyrixAudioScheduledCount: lyrixAudioEntries.filter(entry => scheduledAudio.has(entry.key)).length,
      lyrixSectionsSeenCount: lyrixSectionsSeen.length,
      lyrixSectionsNeverSeenCount: lyrixSectionsNeverSeen.length
    },
    top: {
      selectedAudio: topFromCountMap(selectedAudioCounts, 50),
      scheduledAudio: topFromCountMap(scheduledAudioCounts, 50),
      selectedMidi: topFromCountMap(selectedMidiCounts, 50),
      scheduledMidi: topFromCountMap(scheduledMidiCounts, 50),
      unselectedFamilies: topFromCountMap(unselectedFamilies, 50),
      selectedAudioNotScheduled: selectedNonDependentAudioNotScheduled.slice(0, 100).map(key => ({ key, selectedCount: scheduledPoolSelectedAudioCounts.get(key) || 0 })),
      selectedDependentOnlyAudioNotScheduled: selectedDependentOnlyAudioNotScheduled.slice(0, 100).map(key => ({ key, selectedCount: scheduledPoolSelectedAudioCounts.get(key) || 0 })),
      selectedMidiNotScheduled: selectedMidiNotScheduled.slice(0, 100).map(key => ({ key, selectedCount: scheduledPoolSelectedMidiCounts.get(key) || 0 })),
      neverSelectedMidi: neverSelectedMidi.slice(0, 100)
    },
    lyrixSections: {
      seen: lyrixSectionsSeen.map(id => ({ id, count: lyrixSectionCounts.get(id) || 0 })),
      neverSeen: lyrixSectionsNeverSeen
    },
    timeline: {
      durationSeconds: durationStats,
      durationClock: Object.fromEntries(Object.entries(durationStats).map(([key, value]) => [key, secondsToClock(value)])),
      sectionCount: {
        min: percentile(sortedSectionCounts, 0),
        median: percentile(sortedSectionCounts, 0.5),
        p95: percentile(sortedSectionCounts, 0.95),
        max: percentile(sortedSectionCounts, 1)
      },
      sectionTypes: mapToSortedObject(sectionTypeCounts)
    }
  };

  fs.mkdirSync(reportsDir, { recursive: true });

  const jsonPath = path.join(reportsDir, "coverage-gate-report.json");
  const mdPath = path.join(reportsDir, "coverage-gate-report.md");

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  fs.writeFileSync(mdPath, createMarkdownReport(report), "utf8");

  console.log("Coverage gate report created:");
  console.log(`- ${path.relative(ROOT, jsonPath)}`);
  console.log(`- ${path.relative(ROOT, mdPath)}`);
  console.log(`Build simulations: ${BUILD_SIM_COUNT}`);
  console.log(`Schedule simulations: ${SCHEDULE_SIM_COUNT}`);
  console.log(`Audio selected/scheduled: ${selectedAudio.size}/${scheduledAudio.size}`);
  console.log(`MIDI selected/scheduled: ${selectedMidi.size}/${scheduledMidi.size}`);
  console.log(`Lyrix sections seen: ${lyrixSectionsSeen.length}/${lyrixSectionIds.length}`);
  console.log(`Median duration: ${secondsToClock(durationStats.median)}`);

  if (midiPatternsMissing) {
    console.log("NOTE: data/midi-patterns.json was missing, so MIDI scheduling used placeholder notes from full-rules-catalog.json.");
  }

  if (scheduleErrors.length) {
    console.log(`WARNING: ${scheduleErrors.length} scheduling simulations errored. See JSON report for details.`);
  }
}

function tableRows(rows) {
  return rows.map(row => `| ${row.join(" | ")} |`).join("\n");
}

function createMarkdownReport(report) {
  const durationRows = Object.entries(report.timeline.durationSeconds).map(([key, value]) => [
    key,
    Number.isFinite(value) ? value.toFixed(2) : "n/a",
    report.timeline.durationClock[key]
  ]);

  return `# Test Project 2 - Coverage Gate Report

Generated: ${report.generatedAt}

Report-only helper. No planner, renderer, catalog, registry, or rules files were edited by this script.

## Simulation settings

| Check | Value |
|---|---:|
| Build-plan simulations | ${report.sim.buildSimCount} |
| Scheduling simulations | ${report.sim.scheduleSimCount} |
| Scheduling errors | ${report.sim.scheduleErrorCount} |
| midi-patterns.json missing | ${report.sourceCounts.midiPatternsMissing ? "yes" : "no"} |

${report.sourceCounts.midiPatternsMissing ? "MIDI note-level validation is limited because `data/midi-patterns.json` was missing. Placeholder notes from `full-rules-catalog.json` were used to test reachability into the MIDI scheduling path.\n" : ""}

## Source coverage

| Source | Count |
|---|---:|
| R2 manifest files | ${report.sourceCounts.r2Manifest} |
| Folder-tree files | ${report.sourceCounts.folderTreeFiles ?? "not checked"} |
| Stem registry entries | ${report.sourceCounts.registryEntries} |
| Registry audio entries | ${report.sourceCounts.registryAudio} |
| Registry MIDI entries | ${report.sourceCounts.registryMidi} |
| Catalog allKeys | ${report.sourceCounts.catalogAllKeys} |
| Lyrix rule file refs | ${report.sourceCounts.lyrixRuleFileRefs} |
| Lyrix sections | ${report.sourceCounts.lyrixSections} |
| MIDI patterns | ${report.sourceCounts.midiPatterns} |

## Reachability summary

| Check | Count |
|---|---:|
| Unique audio selected in build plans | ${report.reachability.selectedAudioCount} |
| Unique audio scheduled in scheduling sims | ${report.reachability.scheduledAudioCount} |
| Unique MIDI selected in build plans | ${report.reachability.selectedMidiCount} |
| Unique MIDI scheduled in scheduling sims | ${report.reachability.scheduledMidiCount} |
| Audio with no observed inclusion path | ${report.reachability.audioNoObservedInclusionPathCount} |
| Audio selected but not scheduled in scheduling sims, excluding dependent-only | ${report.reachability.selectedAudioNotScheduledCount} |
| Dependent-only audio selected but not scheduled in scheduling sims | ${report.reachability.selectedDependentOnlyAudioNotScheduledCount} |
| Audio selected but not scheduled total in scheduling sims | ${report.reachability.selectedAudioNotScheduledTotalCount} |
| MIDI selected but not scheduled in scheduling sims | ${report.reachability.selectedMidiNotScheduledCount} |
| MIDI never selected | ${report.reachability.neverSelectedMidiCount} |
| General samples selected | ${report.reachability.generalSamplesSelectedCount} |
| General samples scheduled | ${report.reachability.generalSamplesScheduledCount} |
| General samples with no observed inclusion | ${report.reachability.generalSamplesNoObservedInclusionCount} |
| Lyrix audio selected | ${report.reachability.lyrixAudioSelectedCount} |
| Lyrix audio scheduled | ${report.reachability.lyrixAudioScheduledCount} |
| Lyrix sections seen | ${report.reachability.lyrixSectionsSeenCount} / ${report.sourceCounts.lyrixSections} |

## Timeline / duration variation

| Metric | Seconds | Clock |
|---|---:|---:|
${tableRows(durationRows)}

Section count median: ${report.timeline.sectionCount.median}

## Top unselected families

| Family | Unselected files |
|---|---:|
${tableRows(report.top.unselectedFamilies.slice(0, 25).map(item => [item.key, item.count]))}

## Top selected audio not scheduled, excluding dependent-only

| File | Selected count |
|---|---:|
${tableRows(report.top.selectedAudioNotScheduled.slice(0, 25).map(item => [item.key, item.selectedCount]))}

## Top dependent-only audio selected but not scheduled

| File | Selected count |
|---|---:|
${tableRows((report.top.selectedDependentOnlyAudioNotScheduled || []).slice(0, 25).map(item => [item.key, item.selectedCount]))}

## Top selected MIDI not scheduled

| MIDI file | Selected count |
|---|---:|
${tableRows(report.top.selectedMidiNotScheduled.slice(0, 25).map(item => [item.key, item.selectedCount]))}

## Lyrix sections never seen

${report.lyrixSections.neverSeen.length ? report.lyrixSections.neverSeen.map(id => `- \`${id}\``).join("\n") : "None"}
`;
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}

