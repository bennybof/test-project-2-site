const fs = require("fs");
const path = require("path");
const { parseMidi } = require("midi-file");

const projectRoot = path.resolve(__dirname, "..");
const midiRoot = path.join(projectRoot, "r2-upload", "midi files");
const midiSampleRoot = path.join(midiRoot, "samples");
const outputPath = path.join(projectRoot, "data", "midi-patterns.json");

const sampleNames = new Set(
  fs.readdirSync(midiSampleRoot)
    .filter(file => file.toLowerCase().endsWith(".wav"))
    .map(file => path.basename(file, ".wav"))
);

function walk(folder) {
  const results = [];

  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    const fullPath = path.join(folder, item.name);

    if (item.isDirectory()) {
      if (item.name.toLowerCase() !== "samples") {
        results.push(...walk(fullPath));
      }
      continue;
    }

    if (item.isFile() && item.name.toLowerCase().endsWith(".mid")) {
      results.push(fullPath);
    }
  }

  return results;
}

function toR2Key(fullPath) {
  return path.relative(path.join(projectRoot, "r2-upload"), fullPath).replaceAll("\\", "/");
}

function inferSampleName(midiFileName) {
  const base = midiFileName.replace(/\.mid$/i, "");
  const parts = base.split("_").filter(Boolean);
  const lastPart = parts[parts.length - 1];

  if (sampleNames.has(lastPart)) return lastPart;

  const lower = base.toLowerCase();

  if (lower.includes("beepipes")) return "beepipe";
  if (lower.includes("snare")) return "snare";
  if (lower.includes("rims") || lower.includes("rim")) return "rim";
  if (lower.includes("crash")) return "crash";
  if (lower.includes("kick")) return "kick";

  return lastPart;
}

function extractNotes(midiData, ticksPerBeat) {
  const notes = [];

  for (let trackIndex = 0; trackIndex < midiData.tracks.length; trackIndex++) {
    let absoluteTicks = 0;
    const track = midiData.tracks[trackIndex];

    for (const event of track) {
      absoluteTicks += event.deltaTime || 0;

      if (event.type === "noteOn" && event.velocity > 0) {
        notes.push({
          trackIndex,
          tick: absoluteTicks,
          beats: Number((absoluteTicks / ticksPerBeat).toFixed(6)),
          noteNumber: event.noteNumber,
          velocity: event.velocity,
          velocity01: Number((event.velocity / 127).toFixed(6))
        });
      }
    }
  }

  notes.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
    return a.noteNumber - b.noteNumber;
  });

  return notes;
}

const midiFiles = walk(midiRoot);
const patterns = [];
const warnings = [];

for (const midiPath of midiFiles) {
  const fileName = path.basename(midiPath);
  const r2Key = toR2Key(midiPath);
  const buffer = fs.readFileSync(midiPath);
  const midiData = parseMidi(buffer);

  const ticksPerBeat = midiData.header.ticksPerBeat;

  if (!ticksPerBeat) {
    warnings.push({
      file: r2Key,
      issue: "No ticksPerBeat found. This MIDI may use unsupported timing."
    });
    continue;
  }

  const sampleName = inferSampleName(fileName);
  const sampleFile = `${sampleName}.wav`;
  const samplePath = `midi files/samples/${sampleFile}`;
  const sampleExists = sampleNames.has(sampleName);

  if (!sampleExists) {
    warnings.push({
      file: r2Key,
      issue: `Inferred sample does not exist: ${sampleFile}`
    });
  }

  const notes = extractNotes(midiData, ticksPerBeat);

  patterns.push({
    id: fileName.replace(/\.mid$/i, ""),
    file: r2Key,
    sample: sampleFile,
    samplePath,
    sampleExists,
    ticksPerBeat,
    noteCount: notes.length,
    lengthBeats: notes.length ? Number(Math.max(...notes.map(note => note.beats)).toFixed(6)) : 0,
    notes
  });
}

patterns.sort((a, b) => a.file.localeCompare(b.file));

const output = {
  generatedAt: new Date().toISOString(),
  sourceFolder: "r2-upload/midi files",
  patternCount: patterns.length,
  warnings,
  patterns
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`Wrote ${patterns.length} MIDI patterns to ${outputPath}`);
console.log(`Warnings: ${warnings.length}`);

if (warnings.length) {
  for (const warning of warnings) {
    console.log(`WARNING: ${warning.file} :: ${warning.issue}`);
  }
}