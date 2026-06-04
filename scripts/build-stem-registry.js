const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

const manifestPath = path.join(projectRoot, "data", "r2-manifest.json");
const midiPatternsPath = path.join(projectRoot, "data", "midi-patterns.json");
const outputPath = path.join(projectRoot, "data", "stem-registry.json");

function readJsonNoBom(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

const manifest = readJsonNoBom(manifestPath);
const midiPatterns = readJsonNoBom(midiPatternsPath);

const midiByFile = new Map(
  midiPatterns.patterns.map(pattern => [pattern.file, pattern])
);

function cleanName(fileName) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replaceAll("(consolidated)", "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWord(name, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[_\\s-])${escaped}($|[_\\s-])`, "i").test(name);
}

function getPartNumber(name) {
  const match = name.match(/#\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function getOpportunity(name) {
  const match = name.match(/(?:^|[_\s-])x(0\.5|2|4|6|7|8)(?:$|[_\s-])/i);
  return match ? `x${match[1]}` : null;
}

function inferTags(key) {
  const fileName = path.basename(key);
  const lower = fileName.toLowerCase();
  const tags = new Set();

  if (key.startsWith("alternate downloads/")) tags.add("alternate_download");
  if (key.startsWith("lyrix/")) tags.add("lyrix");
  if (key.startsWith("midi files/")) tags.add("midi_area");
  if (key.startsWith("samples/")) tags.add("sample");

  if (lower.endsWith(".mid")) tags.add("midi");
  if (lower.endsWith(".wav")) tags.add("audio");
  if (lower.endsWith(".mp3")) tags.add("audio");

  const tagWords = [
    "hook",
    "odd",
    "even",
    "xtra",
    "wet",
    "dry",
    "dlay",
    "cont",
    "suspense",
    "intro",
    "outro",
    "metal",
    "lyrix",
    "vox",
    "adlib",
    "drums",
    "hats",
    "crash",
    "rev_crash",
    "jazz_crash",
    "bass",
    "real_bass",
    "nuva_bass",
    "synth_bass",
    "bassish",
    "high_bassish",
    "cello",
    "pad",
    "hippy_synth",
    "bagoo",
    "bagoo_low",
    "ahs",
    "sax",
    "floot",
    "trumpet",
    "tbone",
    "clarinet",
    "accordian",
    "vlins",
    "glock",
    "chimes",
    "beeps",
    "accbreath",
    "texture",
    "bomb_tick",
    "heartbeats",
    "vinyl",
    "typewriter",
    "gtar",
    "drop",
    "dropped",
    "outburst",
    "grm",
    "grimey",
    "rewind",
    "window_wipe",
    "oh_rev"
  ];

  for (const word of tagWords) {
    if (lower.includes(word)) tags.add(word);
  }

  const opportunity = getOpportunity(fileName);
  if (opportunity) tags.add(opportunity);

  const partNumber = getPartNumber(fileName);
  if (partNumber !== null) {
    tags.add(`part_${partNumber}`);
  }

  if (lower.includes("~")) tags.add("tilde_align");

  return [...tags].sort();
}

function inferFamily(key) {
  const fileName = path.basename(key);
  const name = cleanName(fileName).toLowerCase();

  const familyChecks = [
    "slow_hook_blessnow",
    "slow_hook_talk",
    "fast_hook_blessnow",
    "fast_hook_timeout",
    "hook_nextmove",
    "angry",
    "anxiety",
    "beatles",
    "bethere",
    "bollocks",
    "buf",
    "clockout",
    "crashout",
    "fall",
    "greenguy",
    "greentea",
    "gromit",
    "grounded",
    "holdit",
    "intrusive",
    "weed",
    "synth_bass",
    "real_bass",
    "nuva_bass",
    "synth_glitch",
    "synth_frozen_verb",
    "synth_downsampled",
    "synth_feedback",
    "synth_elephant",
    "breathe_vox",
    "breathe_rev_vox",
    "breathe_vox_stutter",
    "main_hats",
    "messy_hats",
    "jazz_hats",
    "jazz_rides",
    "lego_hats",
    "speedy_hats",
    "trap_hats",
    "holdit_hats",
    "rims",
    "snare",
    "beepipes",
    "typewriter",
    "gtar",
    "drop",
    "outburst",
    "grm",
    "everything_intro"
  ];

  for (const family of familyChecks) {
    if (name.includes(family)) return family;
  }

  return name.split(/[_\s-]+/)[0] || "unknown";
}

const entries = manifest.map(key => {
  const ext = path.extname(key).toLowerCase();
  const fileName = path.basename(key);
  const folder = key.includes("/") ? key.split("/")[0] : "";
  const partNumber = getPartNumber(fileName);
  const opportunity = getOpportunity(fileName);
  const midiPattern = midiByFile.get(key) || null;

  return {
    key,
    folder,
    fileName,
    cleanName: cleanName(fileName),
    extension: ext,
    type: ext === ".mid" ? "midi" : ext === ".wav" || ext === ".mp3" ? "audio" : "other",
    family: inferFamily(key),
    tags: inferTags(key),
    partNumber,
    opportunity,
    isWet: hasWord(fileName, "wet"),
    isDry: hasWord(fileName, "dry"),
    isHook: hasWord(fileName, "hook"),
    isOdd: hasWord(fileName, "odd"),
    isEven: hasWord(fileName, "even"),
    isTildeAligned: fileName.includes("~"),
    midi: midiPattern
      ? {
          samplePath: midiPattern.samplePath,
          noteCount: midiPattern.noteCount,
          lengthBeats: midiPattern.lengthBeats
        }
      : null
  };
});

const output = {
  generatedAt: new Date().toISOString(),
  sourceManifest: "data/r2-manifest.json",
  entryCount: entries.length,
  entries
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`Wrote ${entries.length} registry entries to ${outputPath}`);