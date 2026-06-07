const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');

const FILES = {
  catalog: path.join(DATA_DIR, 'full-rules-catalog.json'),
  lyrixRules: path.join(DATA_DIR, 'lyrix-rules.json'),
  r2Manifest: path.join(DATA_DIR, 'r2-manifest.json'),
};

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function normalizeKey(value) {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function isAssetRef(value) {
  if (typeof value !== 'string') return false;
  const normalized = normalizeKey(value);
  return /^(alternate downloads|lyrix|samples|midi files)\//i.test(normalized) && /\.(wav|mp3|mid)$/i.test(normalized);
}

function collectAssetRefs(value, refs = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectAssetRefs(item, refs);
    return refs;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectAssetRefs(item, refs);
    return refs;
  }

  if (isAssetRef(value)) refs.add(normalizeKey(value));
  return refs;
}

function getManifestKeys(manifest) {
  if (Array.isArray(manifest)) return new Set(manifest.map(normalizeKey));

  if (manifest && Array.isArray(manifest.keys)) return new Set(manifest.keys.map(normalizeKey));
  if (manifest && Array.isArray(manifest.files)) return new Set(manifest.files.map(normalizeKey));
  if (manifest && Array.isArray(manifest.objects)) {
    return new Set(manifest.objects.map(item => normalizeKey(item.key || item.name || item.path || item)));
  }

  throw new Error('Unsupported r2-manifest.json shape. Expected array, keys, files, or objects.');
}

function sectionRefs(section) {
  const refs = new Set();

  for (const file of section.explicitFiles || []) {
    if (isAssetRef(file)) refs.add(normalizeKey(file));
  }

  for (const part of section.parts || []) {
    for (const key of ['dry', 'wet', 'file']) {
      if (isAssetRef(part[key])) refs.add(normalizeKey(part[key]));
    }
  }

  for (const adlib of section.adlibs || []) {
    if (isAssetRef(adlib.file)) refs.add(normalizeKey(adlib.file));
    if (adlib.files) {
      for (const key of Object.keys(adlib.files)) {
        if (isAssetRef(adlib.files[key])) refs.add(normalizeKey(adlib.files[key]));
      }
    }
  }

  if (section.leadIn?.files) {
    for (const key of Object.keys(section.leadIn.files)) {
      if (isAssetRef(section.leadIn.files[key])) refs.add(normalizeKey(section.leadIn.files[key]));
    }
  }

  if (section.replacements) collectAssetRefs(section.replacements, refs);
  if (section.part3ReplacementRule) collectAssetRefs(section.part3ReplacementRule, refs);

  return refs;
}

function difference(values, allowed) {
  return [...values].filter(value => !allowed.has(value)).sort();
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return [...duplicates].sort();
}

function main() {
  console.log('----- START VALIDATE RULES DATA -----');

  for (const [name, filePath] of Object.entries(FILES)) {
    if (!fs.existsSync(filePath)) throw new Error(`Missing ${name}: ${filePath}`);
  }

  const catalog = readJson(FILES.catalog);
  const lyrixRules = readJson(FILES.lyrixRules);
  const r2Manifest = readJson(FILES.r2Manifest);
  const manifestKeys = getManifestKeys(r2Manifest);

  const failures = [];
  const warnings = [];

  if (!Array.isArray(lyrixRules.sections)) {
    failures.push('lyrix-rules.json does not contain sections array.');
  }

  const forbiddenModes = new Set(lyrixRules.globalRules?.fileMatchModesForbidden || ['contains', 'filenameIncludes']);
  const sections = Array.isArray(lyrixRules.sections) ? lyrixRules.sections : [];
  const sectionIds = sections.map(section => section.id).filter(Boolean);

  for (const duplicateId of duplicateValues(sectionIds)) {
    failures.push(`Duplicate lyrix section id: ${duplicateId}`);
  }

  for (const section of sections) {
    if (!section.id) failures.push('A lyrix section is missing id.');

    if (forbiddenModes.has(section.fileMatchMode)) {
      failures.push(`Forbidden fileMatchMode on section ${section.id}: ${section.fileMatchMode}`);
    }

    if (section.fileMatchMode === 'explicitFiles' && !Array.isArray(section.explicitFiles)) {
      failures.push(`Section ${section.id} uses explicitFiles mode but has no explicitFiles array.`);
    }

    const refs = sectionRefs(section);
    const missing = difference(refs, manifestKeys);

    for (const file of missing) {
      failures.push(`Missing R2 file for lyrix section ${section.id}: ${file}`);
    }

    const explicitFiles = new Set((section.explicitFiles || []).filter(isAssetRef).map(normalizeKey));

    for (const ref of refs) {
      if (section.fileMatchMode === 'explicitFiles' && !explicitFiles.has(ref)) {
        warnings.push(`Section ${section.id} references file outside explicitFiles: ${ref}`);
      }
    }
  }

  const ignored = new Set((lyrixRules.globalRules?.ignoredLyrixFiles || []).map(normalizeKey));

  for (const section of sections) {
    for (const file of sectionRefs(section)) {
      if (ignored.has(file)) {
        failures.push(`Ignored lyrix file is still active in section ${section.id}: ${file}`);
      }
    }
  }

  const catalogRefs = collectAssetRefs(catalog);

  for (const missing of difference(catalogRefs, manifestKeys)) {
    failures.push(`Missing R2 file referenced by full-rules-catalog.json: ${missing}`);
  }

  const midiPatterns = catalog.rulePools?.midi?.patterns || [];

  for (const pattern of midiPatterns) {
    if (!pattern.file) failures.push(`MIDI pattern missing file: ${pattern.id || '(no id)'}`);
    if (!pattern.samplePath) failures.push(`MIDI pattern missing samplePath: ${pattern.id || pattern.file || '(no id)'}`);

    if (pattern.file && !manifestKeys.has(normalizeKey(pattern.file))) {
      failures.push(`Missing R2 MIDI file: ${pattern.file}`);
    }

    if (pattern.samplePath && !manifestKeys.has(normalizeKey(pattern.samplePath))) {
      failures.push(`Missing R2 MIDI samplePath: ${pattern.samplePath}`);
    }
  }

  console.log(`Manifest keys: ${manifestKeys.size}`);
  console.log(`Lyrix sections: ${sections.length}`);
  console.log(`Lyrix explicit files: ${sections.reduce((sum, section) => sum + (section.explicitFiles || []).length, 0)}`);
  console.log(`Catalog asset refs checked: ${catalogRefs.size}`);
  console.log(`MIDI patterns checked: ${midiPatterns.length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Failures: ${failures.length}`);

  for (const warning of warnings.slice(0, 50)) console.log(`WARNING: ${warning}`);
  if (warnings.length > 50) console.log(`WARNING: ...and ${warnings.length - 50} more warnings.`);

  for (const failure of failures.slice(0, 100)) console.log(`ERROR: ${failure}`);
  if (failures.length > 100) console.log(`ERROR: ...and ${failures.length - 100} more errors.`);

  if (failures.length) {
    console.log('----- END VALIDATE RULES DATA: FAIL -----');
    process.exit(1);
  }

  console.log('----- END VALIDATE RULES DATA: PASS -----');
}

try {
  main();
} catch (error) {
  console.log('ERROR:', error.message || error);
  console.log('----- END VALIDATE RULES DATA: FAIL -----');
  process.exit(1);
}