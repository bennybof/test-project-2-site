const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const registryPath = path.join(projectRoot, "data", "stem-registry.json");
const midiPatternsPath = path.join(projectRoot, "data", "midi-patterns.json");
const outputPath = path.join(projectRoot, "data", "full-rules-catalog.json");

function readJsonNoBom(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

const registry = readJsonNoBom(registryPath);
const midiPatterns = readJsonNoBom(midiPatternsPath);

const entries = registry.entries;
const byKey = new Map(entries.map(entry => [entry.key, entry]));
const warnings = [];

function exact(key, label = key) {
  const entry = byKey.get(key);
  if (!entry) {
    warnings.push(`Missing expected file for ${label}: ${key}`);
    return null;
  }
  return entry;
}

function keysExact(keys, label) {
  return keys
    .map(key => exact(key, label))
    .filter(Boolean)
    .map(entry => entry.key);
}

function containsAll(entry, words) {
  const lower = entry.key.toLowerCase();
  return words.every(word => lower.includes(word.toLowerCase()));
}

function containsAny(entry, words) {
  const lower = entry.key.toLowerCase();
  return words.some(word => lower.includes(word.toLowerCase()));
}

function excludesAny(entry, words) {
  const lower = entry.key.toLowerCase();
  return !words.some(word => lower.includes(word.toLowerCase()));
}

function audioOnly(entry) {
  return entry.type === "audio";
}

function midiOnly(entry) {
  return entry.type === "midi";
}

function inFolder(entry, folder) {
  return entry.folder === folder;
}

function sortKeys(list) {
  return [...list].sort((a, b) => a.localeCompare(b));
}

function keysWhere(predicate) {
  return sortKeys(entries.filter(predicate).map(entry => entry.key));
}

function groupByFamily(list) {
  const groups = {};

  for (const entry of list) {
    if (!groups[entry.family]) groups[entry.family] = [];
    groups[entry.family].push(entry.key);
  }

  for (const family of Object.keys(groups)) {
    groups[family] = sortKeys(groups[family]);
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  );
}

function wetDryBaseName(entry) {
  return entry.cleanName
    .replace(/\bwet\b/gi, "")
    .replace(/\bdry\b/gi, "")
    .replace(/\s*#\s*\d+/g, "")
    .replace(/[_\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function buildWetDryPairs() {
  const groups = {};

  for (const entry of entries.filter(audioOnly)) {
    if (!entry.isWet && !entry.isDry) continue;

    const base = wetDryBaseName(entry);
    if (!groups[base]) groups[base] = { dry: [], wet: [] };

    if (entry.isDry) groups[base].dry.push(entry.key);
    if (entry.isWet) groups[base].wet.push(entry.key);
  }

  for (const base of Object.keys(groups)) {
    groups[base].dry = sortKeys(groups[base].dry);
    groups[base].wet = sortKeys(groups[base].wet);
  }

  return Object.fromEntries(
    Object.entries(groups)
      .filter(([, value]) => value.dry.length || value.wet.length)
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function numberedBaseName(entry) {
  return entry.cleanName
    .replace(/\s*#\s*\d+/g, "")
    .replace(/[_\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function buildNumberedGroups() {
  const groups = {};

  for (const entry of entries.filter(audioOnly)) {
    if (!entry.partNumber) continue;

    const base = numberedBaseName(entry);
    if (!groups[base]) groups[base] = [];
    groups[base].push({ key: entry.key, partNumber: entry.partNumber });
  }

  for (const base of Object.keys(groups)) {
    groups[base].sort((a, b) => {
      if (a.partNumber !== b.partNumber) return a.partNumber - b.partNumber;
      return a.key.localeCompare(b.key);
    });
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  );
}

const rulePools = {
  timing: {
    mainBpm: 56,
    mainBeatSeconds: 60 / 56,
    mainBarSeconds: (60 / 56) * 4,
    grimeyBpm: 70,
    grimeyBeatSeconds: 60 / 70,
    grimeyBarSeconds: (60 / 70) * 4,
    grimeyRule:
      "When grimey starts, active timeline switches to 70 BPM. When grimey exits, the exact real-time exit point becomes the new 56 BPM grid anchor."
  },

  fades: {
    thirtySecondFadeInShape: "exponential",
    thirtySecondFadeOutShape: "exponential"
  },

  density: {
    weights: {
      oneShot: 0.25,
      phrase: 0.75,
      continuous: 1.25,
      lyrix: 1.5,
      trueBassActive: 1,
      drumsOrHatsActive: 1
    },
    cap: 10,
    lowMax: 3,
    mediumMax: 6,
    highAbove: 6
  },

  everythingIntro: {
    globalInclusionChance: 0.01,
    crashChanceSevenBarsAfterIntro: 0.6,
    crash: exact("samples/crash_metal_odd_metal (consolidated).wav", "everything_intro crash")?.key || null,
    ahMains: keysExact(
      [
        "samples/ah_highest_main (consolidated).wav",
        "samples/ah_medium_main (consolidated).wav",
        "samples/ah_low_main (consolidated).wav",
        "samples/ah_lowest_main (consolidated).wav"
      ],
      "everything_intro ah mains"
    ),
    candidates: keysWhere(entry =>
      audioOnly(entry) &&
      containsAll(entry, ["everything_intro"])
    )
  },

  ui: {
    buttonSoundsDb: -6,
    buttonSounds: keysExact(
      [
        "samples/breathe_vox_wet_big_even_x2.wav",
        "samples/chimes_odd (consolidated).wav",
        "samples/pad_1_xtra (consolidated).wav",
        "samples/wierd_vox_wet_odd_x2.wav"
      ],
      "button sounds"
    ),
    crashButtonPool: keysWhere(entry =>
      audioOnly(entry) &&
      inFolder(entry, "samples") &&
      containsAny(entry, ["crash", "jazz_crash", "crash_wash", "big_crash_layer"]) &&
      excludesAny(entry, ["rev_crash", "oh_rev", "dlay"])
    )
  },

  typewriter: {
    files: keysExact(
      [
        "samples/typewriter_intro_odd_xtra.wav",
        "samples/typewriter_odd_xtra.wav",
        "samples/typewriter_even_xtra.wav"
      ],
      "typewriter files"
    ),
    type: "phrase",
    hatsOhReplacement: "Block/replace hats and OH for the duration of the active typewriter file."
  },

  drop: {
    globalInclusionChance: 0.1,
    activationWhenValid: 1,
    files: keysExact(
      [
        "samples/drop_bagoo.wav",
        "samples/drop_bass.wav",
        "samples/drop_breathe_vox.wav",
        "samples/drop_drums.wav",
        "samples/drop_metal.wav",
        "samples/drop_riser (consolidated).wav",
        "samples/drop_synth.wav",
        "samples/drop_vlins (consolidated).wav"
      ],
      "drop files"
    ),
    droppedResetFiles: keysWhere(entry =>
      audioOnly(entry) &&
      inFolder(entry, "samples") &&
      containsAny(entry, ["dropped_", "dk_not140", "bazz_not140", "iron_not140"])
    )
  },

    outburst: {
    introOrder: [
      "lyrix/outburst_lyrix_intro_odd_dry.wav",
      "lyrix/outburst_lyrix_intro_odd_wet.wav",
      "lyrix/outburst_lyrix_intro_dry #2.wav",
      "lyrix/outburst_lyrix_intro wet #2.wav"
    ],
    files: keysExact(
      [
        "lyrix/outburst_lyrix_intro_odd_dry.wav",
        "lyrix/outburst_lyrix_intro_odd_wet.wav",
        "lyrix/outburst_lyrix_intro_dry #2.wav",
        "lyrix/outburst_lyrix_intro wet #2.wav",
        "lyrix/outburst_lyrix_main_dry.wav",
        "lyrix/outburst_lyrix_main_wet.wav",
        "samples/happybrass_outburst (consolidated).wav",
        "samples/happybrass_lead_outburst.wav",
        "samples/breathe_vox_big_outburst_~.wav"
      ],
      "outburst files"
    )
  },

  grimey: {
    bpm: 70,
    files: keysExact(
      [
        "samples/grm_bass_lead_odd (consolidated).wav",
        "samples/grm_intro_airhorn_odd.wav",
        "samples/grm_airhorn_odd_alt.wav",
        "samples/grm_main_bass_odd_alt.wav",
        "samples/grm_hats_fuzz_alt_odd (consolidated).wav",
        "samples/grm_ah_beat_x3.wav",
        "samples/grm_ah_lyrix.wav",
        "samples/grm_dk_tsandcs_lyrix_x4 (consolidated).wav",
        "samples/grm_dk_lyrix_handmedowns_x7.wav",
        "samples/grm_dunah_rhymeschemes_lyrix_x6_~ (consolidated).wav",
        "samples/rewind_sfx.wav"
      ],
      "grimey files"
    )
  },

  ruleProfiles: {
    byTag: {
      ch: {
        cutoffRules: [
          {
            id: "midi_ch_cuts_previous_ch",
            targets: [
              { tag: "ch" }
            ],
            fadeSeconds: 0.01,
            includeFutureScheduled: false
          }
        ]
      },
      oh: {
        cutoffRules: [
          {
            id: "midi_oh_cuts_previous_oh",
            targets: [
              { tag: "oh" }
            ],
            fadeSeconds: 0.01,
            includeFutureScheduled: false
          },
          {
            id: "midi_oh_cuts_previous_ch",
            targets: [
              { tag: "ch" }
            ],
            fadeSeconds: 0.01,
            includeFutureScheduled: false
          }
        ]
      },
      ride03: {
        cutoffRules: [
          {
            id: "midi_ride03_cuts_previous_ride03",
            targets: [
              { tag: "ride03" }
            ],
            fadeSeconds: 0.01,
            includeFutureScheduled: false
          }
        ]
      },
      ride04: {
        cutoffRules: [
          {
            id: "midi_ride04_cuts_previous_ride04",
            targets: [
              { tag: "ride04" }
            ],
            fadeSeconds: 0.01,
            includeFutureScheduled: false
          }
        ]
      },
      ridehard: {
        cutoffRules: [
          {
            id: "midi_ridehard_cuts_previous_ridehard",
            targets: [
              { tag: "ridehard" }
            ],
            fadeSeconds: 0.01,
            includeFutureScheduled: false
          }
        ]
      },
      snare: {
        cutoffRules: [
          {
            id: "midi_snare_cuts_previous_snare",
            targets: [
              { tag: "snare" }
            ],
            fadeSeconds: 0.01,
            includeFutureScheduled: false
          }
        ]
      },
      beepipe: {
        cutoffRules: [
          {
            id: "midi_beepipe_cuts_previous_beepipe",
            targets: [
              { tag: "beepipe" }
            ],
            fadeSeconds: 0.01,
            includeFutureScheduled: false
          }
        ]
      },
      rim: {
        cutoffRules: [
          {
            id: "midi_rim_cuts_previous_rim",
            targets: [
              { tag: "rim" }
            ],
            fadeSeconds: 0.01,
            includeFutureScheduled: false
          }
        ]
      },
      arp: {
        cutoffRules: [
          {
            id: "midi_arp_cuts_previous_coin",
            targets: [
              { tag: "coin" }
            ],
            fadeSeconds: 0.01,
            includeFutureScheduled: false
          }
        ]
      },
      done: {
        cutoffRules: [
          {
            id: "midi_done_cuts_previous_arp",
            targets: [
              { tag: "arp" }
            ],
            fadeSeconds: 0.01,
            includeFutureScheduled: false
          }
        ]
      }
    },
    byFamily: {
      gtar: {
        hardClashRules: [
          {
            id: "hard_clash_gtar_with_ahs",
            targets: [
              { family: "ah" },
              { tag: "ahs" }
            ],
            sourceNote: "Saved definitions absolute final 2: Gtar cannot activate at the same time as ahs."
          }
        ],
        softMultiplierRules: [
          {
            id: "soft_gtar_with_tbone_x0_1",
            multiplier: 0.1,
            targets: [
              { family: "tbone" },
              { tag: "tbone" }
            ],
            sourceNote: "Saved definitions absolute final 2: Gtar is 90% less likely to activate while tbone is active."
          }
        ]
      }
    },
    byKey: {
      "samples/crash_metal_odd_metal (consolidated).wav": {
        globalInclusionChance: 1,
        activationChance: 1,
        cutoffRules: [
          {
            id: "proof_crash_cuts_previous_crash_audio",
            targets: [
              { family: "crash" }
            ],
            fadeSeconds: 0.01,
            includeFutureScheduled: false
          }
        ]
      }
    }
  },

  midi: {
    patternCount: midiPatterns.patternCount,
    patterns: midiPatterns.patterns.map(pattern => ({
      id: pattern.id,
      file: pattern.file,
      samplePath: pattern.samplePath,
      noteCount: pattern.noteCount,
      lengthBeats: pattern.lengthBeats
    }))
  }
};

const audioEntries = entries.filter(audioOnly);
const midiEntries = entries.filter(midiOnly);

const catalog = {
  generatedAt: new Date().toISOString(),
  sourceRegistry: "data/stem-registry.json",
  sourceMidiPatterns: "data/midi-patterns.json",
  entryCount: entries.length,
  counts: {
    total: entries.length,
    audio: audioEntries.length,
    midi: midiEntries.length,
    folders: {
      alternateDownloads: entries.filter(entry => entry.folder === "alternate downloads").length,
      lyrix: entries.filter(entry => entry.folder === "lyrix").length,
      midiFiles: entries.filter(entry => entry.folder === "midi files").length,
      samples: entries.filter(entry => entry.folder === "samples").length
    }
  },
  warnings,
  rulePools,
  groups: {
    byFamily: groupByFamily(entries),
    wetDryPairs: buildWetDryPairs(),
    numberedGroups: buildNumberedGroups()
  },
  allKeys: sortKeys(entries.map(entry => entry.key))
};

fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2));

console.log(`Wrote full rules catalog to ${outputPath}`);
console.log(`Entries: ${catalog.entryCount}`);
console.log(`Warnings: ${warnings.length}`);

if (warnings.length) {
  for (const warning of warnings) {
    console.log(`WARNING: ${warning}`);
  }
}
