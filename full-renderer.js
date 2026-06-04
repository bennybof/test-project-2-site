(() => {
  const rulesPath = "data/rules.json";
  const catalogPath = "data/full-rules-catalog.json";
  const midiPatternsPath = "data/midi-patterns.json";

  const wavButton = document.getElementById("downloadWavButton");
  const mp3Button = document.getElementById("downloadMp3Button");
  const statusText = document.getElementById("statusText");
  const attributionLink = document.getElementById("attributionLink");

  let rules = null;
  let catalog = null;
  let midiPatterns = null;
  let currentSeed = makeSeed();

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

  function buildFullPlan(random) {
    const audioEntries = catalog.entries.filter(entry => isAudio(entry) && !isMidiSample(entry));
    const midiPatternPool = midiPatterns.patterns.filter(isDrumMidiPattern);

    const selectedAudio = new Set();
    const selectedMidi = new Set();

    const maxAudioFiles = 90;
    const maxMidiPatterns = 18;

    // Always include a few foundations if selected by exact pool/catalog.
    const forceCandidates = [
      "samples/synth_main_odd (consolidated).wav",
      "samples/synth_bass_odd_x2 (consolidated).wav",
      "samples/crash_metal_odd_metal (consolidated).wav"
    ];

    for (const key of forceCandidates) {
      if (getCatalogEntry(key) && chance(random, 0.5)) selectedAudio.add(key);
    }

    // everything_intro rule.
    if (chance(random, catalog.rulePools.everythingIntro.globalInclusionChance ?? 0.01)) {
      const intro = chooseOne(random, catalog.rulePools.everythingIntro.candidates);
      if (intro) selectedAudio.add(intro);

      for (const ah of catalog.rulePools.everythingIntro.ahMains) {
        selectedAudio.add(ah);
      }

      if (catalog.rulePools.everythingIntro.crash) {
        selectedAudio.add(catalog.rulePools.everythingIntro.crash);
      }
    }

    // Drop/outburst/grimey are included as section candidates.
    if (chance(random, catalog.rulePools.drop.globalInclusionChance ?? 0.1)) {
      for (const key of catalog.rulePools.drop.files) selectedAudio.add(key);
    }

    if (chance(random, 0.08)) {
      for (const key of catalog.rulePools.outburst.files) selectedAudio.add(key);
    }

    if (chance(random, 0.08)) {
      for (const key of catalog.rulePools.grimey.files) selectedAudio.add(key);
    }

    // General audio selection from all uploaded audio.
    for (const entry of shuffle(random, audioEntries)) {
      if (selectedAudio.size >= maxAudioFiles) break;

      if (chance(random, getBaseActivationChance(entry))) {
        selectedAudio.add(entry.key);
      }
    }

    // MIDI pattern selection.
    for (const pattern of shuffle(random, midiPatternPool)) {
      if (selectedMidi.size >= maxMidiPatterns) break;

      let p = 0.25;
      const key = pattern.file.toLowerCase();

      if (key.includes("main_hats")) p = 0.55;
      if (key.includes("snare")) p = 0.4;
      if (key.includes("rims")) p = 0.35;
      if (key.includes("jazz")) p = 0.18;
      if (key.includes("messy")) p = 0.18;
      if (key.includes("trap")) p = 0.12;
      if (key.includes("beepipes")) p = 0.25;

      if (chance(random, p)) selectedMidi.add(pattern.file);
    }

    // Ensure at least one basic hat pattern if no MIDI was selected.
    if (selectedMidi.size === 0) {
      const fallback = midiPatterns.patterns.find(pattern => pattern.file === "midi files/main_hats_ch_metal_ch.mid");
      if (fallback) selectedMidi.add(fallback.file);
    }

    return {
      selectedAudio: [...selectedAudio],
      selectedMidi: [...selectedMidi]
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

  function scheduleAudioStem({ offlineContext, destination, key, buffer, random, duration, mainBarSeconds, grimeyBarSeconds }) {
    const entry = getCatalogEntry(key);
    if (!entry || !buffer) return;

    const lower = key.toLowerCase();

    if (entry.folder === "alternate downloads") {
      scheduleBuffer(offlineContext, destination, buffer, 0, 0.8);
      return;
    }

    if (lower.includes("everything_intro")) {
      scheduleBuffer(offlineContext, destination, buffer, 0, 0.75);
      return;
    }

    if (lower.includes("drop_") || lower.includes("dropped_")) {
      const start = mainBarSeconds * (16 + Math.floor(random() * 24));
      scheduleBuffer(offlineContext, destination, buffer, start, 0.65);
      return;
    }

    if (lower.includes("outburst")) {
      const start = mainBarSeconds * (24 + Math.floor(random() * 24));
      scheduleBuffer(offlineContext, destination, buffer, start, 0.7);
      return;
    }

    if (lower.includes("grm_") || lower.includes("rewind_sfx")) {
      const grimeyStart = mainBarSeconds * (32 + Math.floor(random() * 16));
      const localOffsetBars70 = Math.floor(random() * 8);
      scheduleBuffer(offlineContext, destination, buffer, grimeyStart + localOffsetBars70 * grimeyBarSeconds, 0.7);
      return;
    }

    if (isLyrix(entry)) {
      const sectionStart = mainBarSeconds * (8 + Math.floor(random() * 48));
      scheduleBuffer(offlineContext, destination, buffer, sectionStart, 0.72);
      return;
    }

    if (isLikelyOneShot(entry)) {
      for (let t = 0; t < duration; t += mainBarSeconds * 4) {
        if (chance(random, 0.12)) {
          scheduleBuffer(offlineContext, destination, buffer, t + Math.floor(random() * 4) * mainBarSeconds, 0.45);
        }
      }
      return;
    }

    // Phrases / continuous-ish stems.
    for (let t = 0; t < duration; t += mainBarSeconds * 4) {
      if (chance(random, 0.28)) {
        const offsetBars = Math.floor(random() * 4);
        scheduleBuffer(offlineContext, destination, buffer, t + offsetBars * mainBarSeconds, 0.42);
      }
    }
  }

  function schedulePlan({ offlineContext, destination, buffers, plan, random, duration }) {
    const mainBpm = catalog.rulePools.timing.mainBpm;
    const grimeyBpm = catalog.rulePools.timing.grimeyBpm;

    const mainBeatSeconds = 60 / mainBpm;
    const mainBarSeconds = mainBeatSeconds * 4;

    const grimeyBeatSeconds = 60 / grimeyBpm;
    const grimeyBarSeconds = grimeyBeatSeconds * 4;

    // MIDI patterns repeat on the main grid for this first full build.
    for (const midiFile of plan.selectedMidi) {
      const pattern = midiPatterns.patterns.find(item => item.file === midiFile);
      if (!pattern) continue;

      const repeatEveryBars = pattern.lengthBeats > 8 ? 4 : 2;
      const repeatEverySeconds = mainBarSeconds * repeatEveryBars;

      for (let t = 0; t < duration; t += repeatEverySeconds) {
        if (chance(random, 0.78)) {
          scheduleMidiPattern({
            offlineContext,
            destination,
            pattern,
            buffers,
            barStart: t,
            beatSeconds: mainBeatSeconds,
            gainValue: 0.65
          });
        }
      }
    }

    for (const key of plan.selectedAudio) {
      scheduleAudioStem({
        offlineContext,
        destination,
        key,
        buffer: buffers.get(key),
        random,
        duration,
        mainBarSeconds,
        grimeyBarSeconds
      });
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