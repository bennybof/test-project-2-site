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

  function expandSelectedWetDryPairs(selectedAudio) {
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
            selectedAudio.add(key);
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

    const sectionTimeline = [];
    const resetPoints = [];
    const lyrixSectionUsage = new Map();

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

      if (everythingIntro) selectedAudio.add(everythingIntro);

      for (const ah of catalog.rulePools.everythingIntro.ahMains) {
        selectedAudio.add(ah);
      }

      if (catalog.rulePools.everythingIntro.crash) {
        selectedAudio.add(catalog.rulePools.everythingIntro.crash);
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
          addSection("lyrix", getLyrixSectionLengthBars(lyrixSection), {
            reset: true,
            tags: ["lyrix", "lyrix_rules_first_pass"],
            lyrixSectionId: lyrixSection.id,
            lyrixSection,
            lyrixActivationNumber
          });

          for (const key of getLyrixSectionAudioFiles(lyrixSection)) {
            selectedAudio.add(key);
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
                selectedAudio.add(key);
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

        for (const key of catalog.rulePools.drop.files) selectedAudio.add(key);
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

        for (const key of catalog.rulePools.outburst.files) selectedAudio.add(key);
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

        for (const key of catalog.rulePools.grimey.files) selectedAudio.add(key);
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
      if (getCatalogEntry(key) && chance(random, 0.65)) {
        selectedAudio.add(key);
      }
    }

    // Select section-relevant audio instead of selecting everything equally.
    for (const section of sectionTimeline) {
      const matchingEntries = audioEntries.filter(entry => {
        const key = entry.key.toLowerCase();

        if (section.type.includes("hook")) return key.includes("hook");
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

        if (chance(random, p)) {
          selectedAudio.add(entry.key);
        }
      }
    }

    // MIDI pattern selection by section.
    for (const section of sectionTimeline) {
      const sectionMidi = midiPatternPool.filter(pattern => {
        const key = pattern.file.toLowerCase();

        if (section.type.includes("hook")) return key.includes("hook") || key.includes("hats");
        if (section.type.includes("grimey")) return key.includes("hats") || key.includes("snare") || key.includes("rims");
        if (section.type.includes("drop")) return key.includes("crash") || key.includes("snare");
        if (section.type.includes("outburst")) return key.includes("crash") || key.includes("hats");
        return key.includes("main_hats") || key.includes("snare") || key.includes("rims") || key.includes("hats");
      });

      for (const pattern of shuffle(random, sectionMidi).slice(0, 3)) {
        let p = 0.35;
        const key = pattern.file.toLowerCase();

        if (key.includes("main_hats")) p = 0.7;
        if (key.includes("snare")) p = 0.45;
        if (key.includes("rims")) p = 0.35;
        if (key.includes("hook")) p = 0.45;
        if (key.includes("jazz")) p = 0.18;
        if (key.includes("messy")) p = 0.18;

        if (chance(random, p)) {
          selectedMidi.add(pattern.file);
        }
      }
    }

    if (selectedMidi.size === 0) {
      const fallback = midiPatterns.patterns.find(pattern => pattern.file === "midi files/main_hats_ch_metal_ch.mid");
      if (fallback) selectedMidi.add(fallback.file);
    }

    expandSelectedWetDryPairs(selectedAudio);

    return {
      selectedAudio: [...selectedAudio],
      selectedMidi: [...selectedMidi],
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
    if (!buffer) return;
    if (startTime >= offlineContext.length / offlineContext.sampleRate) return;

    const source = offlineContext.createBufferSource();
    const gain = offlineContext.createGain();

    source.buffer = buffer;
    gain.gain.value = gainValue;

    source.connect(gain);
    gain.connect(destination);

    source.start(Math.max(0, startTime), Math.max(0, offset));
  }

  function scheduleMidiPattern({ offlineContext, destination, pattern, buffers, barStart, beatSeconds, gainValue }) {
    const sampleBuffer = buffers.get(pattern.samplePath);
    if (!sampleBuffer) return;

    for (const note of pattern.notes) {
      const start = barStart + note.beats * beatSeconds;
      const velocityGain = Math.max(0.05, note.velocity01 ?? 0.7);
      scheduleBuffer(offlineContext, destination, sampleBuffer, start, gainValue * velocityGain);
    }
  }

   function audioMatchesSection(entry, section) {
    const key = entry.key.toLowerCase();
    const type = section.type;

    if (entry.folder === "alternate downloads") return type === "normal";

    if (key.includes("everything_intro")) return type === "everything_intro";

    if (type.includes("hook")) {
      return key.includes("hook") || key.includes("window_wipe");
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

    if (type.includes("hook")) {
      return key.includes("hook") || key.includes("hats");
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

  function scheduleExplicitLyrixSection({ offlineContext, destination, section, random, buffers }) {
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
          if (leadInBuffer) scheduleBuffer(offlineContext, destination, leadInBuffer, leadInStart, leadInGain);
        }

        if (leadIn.files?.dry) {
          const leadInDryBuffer = buffers.get(leadIn.files.dry);
          if (leadInDryBuffer) scheduleBuffer(offlineContext, destination, leadInDryBuffer, leadInStart, leadInGain);
        }

        if (leadIn.files?.wet) {
          const leadInWetBuffer = buffers.get(leadIn.files.wet);
          if (leadInWetBuffer) scheduleBuffer(offlineContext, destination, leadInWetBuffer, leadInStart, leadInGain);
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

      if (dryBuffer) scheduleBuffer(offlineContext, destination, dryBuffer, start, gain);
      if (wetBuffer) scheduleBuffer(offlineContext, destination, wetBuffer, start, gain);
      if (singleBuffer) scheduleBuffer(offlineContext, destination, singleBuffer, start, gain);

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
        if (adlibBuffer) scheduleBuffer(offlineContext, destination, adlibBuffer, adlibStart, 0.72);
      }

      if (adlib.files?.dry) {
        const dryAdlibBuffer = buffers.get(adlib.files.dry);
        if (dryAdlibBuffer) scheduleBuffer(offlineContext, destination, dryAdlibBuffer, adlibStart, 0.72);
      }

      if (adlib.files?.wet) {
        const wetAdlibBuffer = buffers.get(adlib.files.wet);
        if (wetAdlibBuffer) scheduleBuffer(offlineContext, destination, wetAdlibBuffer, adlibStart, 0.72);
      }
    }
    return true;
  }

  function scheduleLyrixGroupInSection({ offlineContext, destination, key, random, section, buffers }) {
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

      scheduleBuffer(offlineContext, destination, buffer, start, 0.72);
      start += buffer.duration;
    }

    return true;
  }
  function scheduleAudioStemInSection({ offlineContext, destination, key, buffer, random, section }) {
    const entry = getCatalogEntry(key);
    if (!entry || !buffer) return;
    if (!audioMatchesSection(entry, section)) return;

    const keyLower = key.toLowerCase();
    const gain = sectionGainForAudio(entry, section);

    if (entry.folder === "alternate downloads") {
      if (chance(random, 0.005)) {
        scheduleBuffer(offlineContext, destination, buffer, section.startSeconds, 0.8);
      }
      return;
    }

    if (keyLower.includes("everything_intro")) {
      scheduleBuffer(offlineContext, destination, buffer, section.startSeconds, gain);
      return;
    }

    if (keyLower.includes("drop_") || keyLower.includes("dropped_")) {
      const localBar = Math.floor(random() * Math.max(1, section.bars));
      scheduleBuffer(offlineContext, destination, buffer, section.startSeconds + localBar * section.barSeconds, gain);
      return;
    }

    if (keyLower.includes("outburst")) {
      scheduleBuffer(offlineContext, destination, buffer, section.startSeconds, gain);
      return;
    }

    if (keyLower.includes("grm_") || keyLower.includes("rewind_sfx")) {
      const localBar = Math.floor(random() * Math.max(1, section.bars));
      scheduleBuffer(offlineContext, destination, buffer, section.startSeconds + localBar * section.barSeconds, gain);
      return;
    }

        if (isLyrix(entry)) {
      scheduleLyrixGroupInSection({
        offlineContext,
        destination,
        key,
        random,
        section,
        buffers: currentRenderBuffers
      });
      return;
    }

    if (isLikelyOneShot(entry)) {
      const allowedBars = getAllowedLocalBarIndexesForKey(key, section);

      for (const localBarIndex of allowedBars) {
        if (chance(random, 0.12)) {
          scheduleBuffer(
            offlineContext,
            destination,
            buffer,
            section.startSeconds + localBarIndex * section.barSeconds,
            gain
          );
        }
      }
      return;
    }

    const phraseRepeats = section.type === "normal" ? 1 : 2;

    for (let i = 0; i < phraseRepeats; i++) {
      if (chance(random, 0.45)) {
        const localBar = Math.floor(random() * Math.max(1, section.bars));
        scheduleBuffer(
          offlineContext,
          destination,
          buffer,
          section.startSeconds + localBar * section.barSeconds,
          gain
        );
      }
    }
  }

  function schedulePlan({ offlineContext, destination, buffers, plan, random, duration }) {
    const sections = plan.sectionTimeline || [];

    for (const section of sections) {
      const sectionMidi = plan.selectedMidi
        .map(file => midiPatterns.patterns.find(item => item.file === file))
        .filter(Boolean)
        .filter(pattern => midiMatchesSection(pattern, section));

      for (const pattern of sectionMidi) {
        const repeatEveryBars = pattern.lengthBeats > 8 ? 4 : 2;
        const repeatEverySeconds = section.barSeconds * repeatEveryBars;

        for (let t = section.startSeconds; t < section.endSeconds; t += repeatEverySeconds) {
          const localBarIndex = Math.round((t - section.startSeconds) / section.barSeconds);

          if (!isBarOpportunityAllowedForKey(pattern.file, section, localBarIndex)) {
            continue;
          }

          if (chance(random, 0.7)) {
            scheduleMidiPattern({
              offlineContext,
              destination,
              pattern,
              buffers,
              barStart: t,
              beatSeconds: section.barSeconds / 4,
              gainValue: 0.62
            });
          }
        }
      }

      if (section.lyrixSectionId) {
        scheduleExplicitLyrixSection({
          offlineContext,
          destination,
          section,
          random,
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

        if (entry && isLyrix(entry)) {
          if (key !== chosenLyrixKeyForSection) continue;

          const groupId = getLyrixGroupKeys(entry).slice().sort().join("|");
          if (scheduledLyrixGroupIds.has(groupId)) continue;
          scheduledLyrixGroupIds.add(groupId);
        }

        scheduleAudioStemInSection({
          offlineContext,
          destination,
          key,
          buffer: buffers.get(key),
          random,
          section
        });
      }
    }
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
