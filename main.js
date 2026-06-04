(() => {
  const rulesPath = "data/rules.json";

  const wavButton = document.getElementById("downloadWavButton");
  const mp3Button = document.getElementById("downloadMp3Button");
  const statusText = document.getElementById("statusText");
  const attributionLink = document.getElementById("attributionLink");

  let rules = null;
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

  function chooseOne(random, items) {
    return items[Math.floor(random() * items.length)];
  }

  function chance(random, probability) {
    return random() < probability;
  }

  function toAssetUrl(path) {
    const encodedPath = path
      .split("/")
      .map(part => encodeURIComponent(part))
      .join("/");

    return `${rules.r2BaseUrl}/${encodedPath}`;
  }

  async function loadRules() {
    const response = await fetch(rulesPath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load ${rulesPath}`);
    }
    return await response.json();
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

    setStatus(`READY / SEED ${currentSeed} / ${scheme.name}`);
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

  function scheduleBuffer(offlineContext, destination, buffer, startTime, gainValue = 1) {
    if (startTime >= offlineContext.length / offlineContext.sampleRate) return;

    const source = offlineContext.createBufferSource();
    const gain = offlineContext.createGain();

    source.buffer = buffer;
    gain.gain.value = gainValue;

    source.connect(gain);
    gain.connect(destination);

    source.start(Math.max(0, startTime));
  }

  async function renderTrack(format) {
    if (!rules) return;

    const random = mulberry32(currentSeed);
    const sampleRate = rules.sampleRate || 44100;
    const duration = rules.songLengthSeconds || 120;

    setStatus(`LOADING AUDIO / SEED ${currentSeed}`);

    const offlineContext = new OfflineAudioContext(
      2,
      Math.ceil(duration * sampleRate),
      sampleRate
    );

    const masterGain = offlineContext.createGain();
    masterGain.gain.value = rules.masterGain ?? 0.75;
    masterGain.connect(offlineContext.destination);

    const selectedPaths = buildMvpPlan(random);

    const buffers = new Map();

    for (const path of selectedPaths) {
      buffers.set(path, await fetchAndDecode(offlineContext, path));
    }

    setStatus(`RENDERING ${format.toUpperCase()} / ${selectedPaths.length} FILES`);

    scheduleMvpTrack({
      offlineContext,
      destination: masterGain,
      buffers,
      selectedPaths,
      random,
      duration
    });

    const renderedBuffer = await offlineContext.startRendering();

    if (format === "wav") {
      const wavBlob = audioBufferToWavBlob(renderedBuffer);
      downloadBlob(wavBlob, `test-project-2-seed-${currentSeed}.wav`);
    }

    if (format === "mp3") {
      await ensureLameJs();
      const mp3Blob = audioBufferToMp3Blob(renderedBuffer);
      downloadBlob(mp3Blob, `test-project-2-seed-${currentSeed}.mp3`);
    }

    currentSeed = makeSeed();
    applyRandomColourScheme();
  }

  function buildMvpPlan(random) {
    const pool = [...rules.mvpStemPool];

    const selected = new Set();

    for (const path of pool) {
      const isDrumOneShot =
        path.includes("kick.wav") ||
        path.includes("snare.wav") ||
        path.includes("ch.wav") ||
        path.includes("oh.wav");

      if (isDrumOneShot) {
        selected.add(path);
      } else if (chance(random, 0.65)) {
        selected.add(path);
      }
    }

    if (chance(random, 0.01) && Array.isArray(rules.secretVersions)) {
      selected.clear();
      selected.add(chooseOne(random, rules.secretVersions));
    }

    return [...selected];
  }

  function scheduleMvpTrack({ offlineContext, destination, buffers, selectedPaths, random, duration }) {
    const bpm = 56;
    const beatSeconds = 60 / bpm;
    const barSeconds = beatSeconds * 4;

    const kickPath = "midi files/samples/kick.wav";
    const snarePath = "midi files/samples/snare.wav";
    const chPath = "midi files/samples/ch.wav";
    const ohPath = "midi files/samples/oh.wav";

    const kick = buffers.get(kickPath);
    const snare = buffers.get(snarePath);
    const ch = buffers.get(chPath);
    const oh = buffers.get(ohPath);

    for (let barStart = 0; barStart < duration; barStart += barSeconds) {
      if (kick) {
        scheduleBuffer(offlineContext, destination, kick, barStart + beatSeconds, 0.95);
        scheduleBuffer(offlineContext, destination, kick, barStart + beatSeconds * 3, 0.95);
      }

      if (snare && chance(random, 0.7)) {
        scheduleBuffer(offlineContext, destination, snare, barStart + beatSeconds * 3, 0.7);
      }

      if (ch) {
        for (let i = 0; i < 8; i++) {
          if (chance(random, 0.85)) {
            scheduleBuffer(offlineContext, destination, ch, barStart + i * (beatSeconds / 2), 0.35);
          }
        }
      }

      if (oh && chance(random, 0.35)) {
        scheduleBuffer(offlineContext, destination, oh, barStart, 0.3);
      }
    }

    const musicalStems = selectedPaths.filter(path => {
      return !path.includes("kick.wav") &&
        !path.includes("snare.wav") &&
        !path.includes("ch.wav") &&
        !path.includes("oh.wav");
    });

    for (const path of musicalStems) {
      const buffer = buffers.get(path);
      if (!buffer) continue;

      if (path.startsWith("alternate downloads/")) {
        scheduleBuffer(offlineContext, destination, buffer, 0, 0.85);
        continue;
      }

      for (let t = 0; t < duration; t += barSeconds * 2) {
        if (chance(random, 0.45)) {
          const offsetBars = Math.floor(random() * 2);
          const start = t + offsetBars * barSeconds;
          scheduleBuffer(offlineContext, destination, buffer, start, 0.45);
        }
      }
    }
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

  async function init() {
    try {
      rules = await loadRules();
      applyRandomColourScheme();

      if (attributionLink) {
        attributionLink.href = "#";
      }

      wavButton.addEventListener("click", () => {
        renderTrack("wav").catch(error => {
          console.error(error);
          setStatus(`ERROR: ${error.message}`);
        });
      });

      mp3Button.addEventListener("click", () => {
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