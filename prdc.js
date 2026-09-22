#!/usr/bin/env node
// prdc — PRD-as-Code CLI
// Treat product specs like software: text source, schema-validated,
// lintable, version-controlled, compiled to many targets.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------- tiny utilities ----------

const log = (...a) => console.log(...a);
const err = (...a) => console.error('\u2717', ...a);
const ok = (...a) => console.log('\u2713', ...a);

function readYaml(p) {
  if (!existsSync(p)) return null;
  let doc;
  try {
    doc = yaml.load(readFileSync(p, 'utf8'));
  } catch (e) {
    const where = e.mark ? ` at line ${e.mark.line + 1}, column ${e.mark.column + 1}` : '';
    err(`YAML parse error in ${p}${where}: ${e.reason || e.message}`);
    process.exit(1);
  }
  return doc;
}
function readText(p) {
  if (!existsSync(p)) return '';
  return readFileSync(p, 'utf8');
}
function write(p, content) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

// ---------- schema validation ----------

const VALID_STATUS = new Set(['draft', 'review', 'approved', 'shipped', 'archived']);
const VALID_PRIORITY = new Set(['P0', 'P1', 'P2', 'P3']);

function validatePrd(prdDir) {
  const errors = [];
  const warnings = [];

  const meta = readYaml(join(prdDir, 'meta.yaml'));
  const reqs = readYaml(join(prdDir, 'requirements.yaml'));
  const metrics = readYaml(join(prdDir, 'metrics.yaml'));
  const spec = readText(join(prdDir, 'spec.md'));

  if (!meta) {
    errors.push('missing meta.yaml — every PRD must declare id, title, owner, status');
    return { errors, warnings, meta: null, reqs: null, metrics: null };
  }

  // meta rules
  if (!meta.id) errors.push('meta.id is required (e.g. PRD-1042)');
  if (!meta.title) errors.push('meta.title is required');
  if (!meta.owner) errors.push('meta.owner is required');
  if (!meta.status) errors.push('meta.status is required');
  else if (!VALID_STATUS.has(meta.status))
    errors.push(`meta.status "${meta.status}" not in ${[...VALID_STATUS].join('|')}`);

  // approval gate
  if (meta.status === 'approved' && (!meta.reviewers || meta.reviewers.length < 1))
    errors.push('status=approved requires at least 1 reviewer signature');

  if (meta.status === 'approved' && (!meta.approved_by || meta.approved_by.length < 1))
    errors.push('status=approved requires approved_by field (signed commit)');

  // depends_on must resolve
  if (meta.depends_on && Array.isArray(meta.depends_on)) {
    for (const dep of meta.depends_on) {
      // Look for sibling dirs whose meta.id matches
      const parent = dirname(prdDir);
      const siblings = existsSync(parent) ? readdirSync(parent) : [];
      const found = siblings.some(s => {
        const m = readYaml(join(parent, s, 'meta.yaml'));
        return m && m.id === dep;
      });
      if (!found) warnings.push(`depends_on "${dep}" does not resolve to any sibling PRD`);
    }
  }

  // requirements rules
  if (!reqs) {
    errors.push('missing requirements.yaml');
  } else if (!Array.isArray(reqs)) {
    errors.push('requirements.yaml must be a list of FR/NFR objects');
  } else {
    const ids = new Set();
    for (const r of reqs) {
      if (!r.id) errors.push(`requirement missing id — every FR/NFR needs a stable id like FR-01`);
      else if (ids.has(r.id)) errors.push(`duplicate requirement id: ${r.id}`);
      else ids.add(r.id);

      if (r.id && !/^FR-|NFR-|EPI-/.test(r.id))
        warnings.push(`${r.id}: id should start with FR- | NFR- | EPI-`);

      if (!r.as_a || !r.i_want || !r.so_that)
        warnings.push(`${r.id || '?'}: missing as_a/i_want/so_that (user story)`);
      if (!r.acceptance_criteria || r.acceptance_criteria.length === 0)
        errors.push(`${r.id}: every requirement needs >=1 acceptance criterion`);
      if (r.priority && !VALID_PRIORITY.has(r.priority))
        warnings.push(`${r.id}: priority "${r.priority}" not in ${[...VALID_PRIORITY].join('|')}`);
      if (r.priority === 'P0' && (!r.rollback_plan))
        warnings.push(`${r.id}: P0 requirements should declare a rollback_plan`);
    }
  }

  // metrics rules
  if (metrics) {
    if (!Array.isArray(metrics))
      errors.push('metrics.yaml must be a list of metric objects');
    else
      for (const m of metrics) {
        if (!m.name) errors.push('metric missing name');
        if (!m.baseline && m.baseline !== 0) warnings.push(`${m.name || '?'}: missing baseline`);
        if (!m.target && m.target !== 0) warnings.push(`${m.name || '?'}: missing target`);
        if (!m.window) warnings.push(`${m.name || '?'}: missing measurement window (e.g. 30d)`);
      }
  }

  // spec.md minimum
  if (spec.trim().length < 200)
    warnings.push('spec.md is suspiciously short (<200 chars) — add narrative context');

  return { errors, warnings, meta, reqs, metrics };
}

// ---------- linter ----------

// Ambiguous words flagged in prose. One precompiled literal; the capture group
// reports which word fired. Words with regex metacharacters would need escaping
// if this list ever grows beyond plain alphabetic terms.
const AMBIGUOUS_RE = /\b(fast|quick|simple|easy|intuitive|seamless|robust|scalable|powerful|flexible|rich|modern|user-friendly|lightweight)\b/g;

function ambiguousWordsIn(lowerText) {
  const found = [];
  for (const m of lowerText.matchAll(AMBIGUOUS_RE)) found.push({ word: m[1], index: m.index });
  return found;
}

function lintPrd(prdDir) {
  const warnings = [];
  const { spec, reqs } = loadPrd(prdDir);

  // ambiguous words in spec
  for (const { word, index } of ambiguousWordsIn(spec.toLowerCase())) {
    warnings.push(`ambiguous word "${word}" in spec.md at offset ${index} — replace with measurable language`);
  }

  // ambiguous words in requirement so_that / acceptance_criteria
  // (reported once per word per requirement, not once per occurrence)
  for (const r of reqs) {
    const blob = `${r.so_that || ''} ${(r.acceptance_criteria || []).join(' ')}`.toLowerCase();
    const seen = new Set();
    for (const { word } of ambiguousWordsIn(blob)) {
      if (seen.has(word)) continue;
      seen.add(word);
      warnings.push(`${r.id}: ambiguous word "${word}" in so_that/AC — make it measurable`);
    }
  }

  // passive voice in AC (very rough heuristic)
  for (const r of reqs) {
    for (const ac of r.acceptance_criteria || []) {
      if (/\b(is|are|was|were|be)\s+\w+ed\b/i.test(ac))
        warnings.push(`${r.id}: passive voice in AC "${ac.slice(0, 60)}..." — use active voice`);
    }
  }

  return warnings;
}

// ---------- builder ----------

// All YAML-derived values are untrusted input (they can arrive via importers
// or copy-paste) and must be escaped before interpolation into HTML.
// spec.md is the exception: it is git-reviewed authored content rendered
// through marked, the same trust model as any repository README.
function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Load the four typed files of a PRD directory in one pass so every
// command shares the same read semantics.
function loadPrd(prdDir) {
  return {
    meta: readYaml(join(prdDir, 'meta.yaml')),
    reqs: readYaml(join(prdDir, 'requirements.yaml')) ?? [],
    metrics: readYaml(join(prdDir, 'metrics.yaml')) ?? [],
    spec: readText(join(prdDir, 'spec.md')),
  };
}

function requireMeta(meta) {
  if (!meta) {
    err('missing meta.yaml — every PRD must declare id, title, owner, status');
    process.exit(1);
  }
}

// User-story sentence from whichever parts exist; empty string when none do.
function storySentence(r, bold) {
  const parts = [];
  if (r.as_a) parts.push(`As a ${bold(r.as_a)}`);
  if (r.i_want) parts.push(`I want ${bold(r.i_want)}`);
  if (r.so_that) parts.push(`so that ${bold(r.so_that)}`);
  return parts.length ? `${parts.join(', ')}.` : '';
}

function buildHtml(prdDir, outPath) {
  const { meta, reqs, metrics, spec } = loadPrd(prdDir);
  requireMeta(meta);

  const specHtml = marked.parse(spec);

  const reqsHtml = reqs.map(r => {
    const story = storySentence(r, s => `<b>${escapeHtml(s)}</b>`);
    return `
    <article class="req">
      <header>
        <span class="id">${escapeHtml(r.id)}</span>
        <span class="prio">${escapeHtml(r.priority || '—')}</span>
        <h3>${escapeHtml(r.i_want || r.title || r.id)}</h3>
      </header>
      ${story ? `<p class="story">${story}</p>` : ''}
      <ul>${(r.acceptance_criteria || []).map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
      ${r.traces_to ? `<p class="trace">traces: ${escapeHtml(r.traces_to.join(', '))}</p>` : ''}
    </article>`;
  }).join('');

  const metricsHtml = metrics.map(m => `
    <tr>
      <td>${escapeHtml(m.name)}</td>
      <td>${escapeHtml(m.baseline ?? '—')}</td>
      <td>${escapeHtml(m.target ?? '—')}</td>
      <td>${escapeHtml(m.window || '—')}</td>
    </tr>`).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.title)} — ${escapeHtml(meta.id)}</title>
<style>
  :root { --bg:#0B0E14; --panel:#11151F; --ink:#E8EBF1; --muted:#8A93A6; --accent:#7C5CFF; --line:#1F2430; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font: 15px/1.6 'Inter', -apple-system, sans-serif; padding:48px; }
  h1 { font-size:32px; margin:0 0 4px; letter-spacing:-0.02em; }
  h2 { font-size:18px; margin:32px 0 12px; color:var(--accent); font-weight:600;
       text-transform:uppercase; letter-spacing:0.08em; }
  .meta { color:var(--muted); font-size:13px; margin-bottom:32px; }
  .meta b { color:var(--ink); }
  .spec { max-width:720px; }
  .spec p { margin:0 0 12px; }
  .req { background:var(--panel); border:1px solid var(--line); border-radius:8px;
         padding:16px 20px; margin:0 0 12px; }
  .req header { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
  .req .id { font-family:'JetBrains Mono', monospace; color:var(--accent); font-size:12px;
             background:rgba(124,92,255,0.12); padding:2px 8px; border-radius:4px; }
  .req .prio { font-family:'JetBrains Mono', monospace; font-size:11px; color:var(--muted);
               border:1px solid var(--line); padding:2px 6px; border-radius:4px; }
  .req h3 { margin:0; font-size:16px; font-weight:600; flex:1; }
  .req .story { color:var(--muted); margin:0 0 8px; font-size:13px; }
  .req ul { margin:0; padding-left:20px; font-size:13px; }
  .req li { margin-bottom:4px; }
  .req .trace { margin:8px 0 0; font-family:'JetBrains Mono', monospace;
                font-size:11px; color:var(--muted); }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  th, td { text-align:left; padding:8px 12px; border-bottom:1px solid var(--line); font-size:13px; }
  th { color:var(--muted); font-weight:600; text-transform:uppercase; font-size:11px;
       letter-spacing:0.06em; }
</style>
</head>
<body>
  <h1>${escapeHtml(meta.title)}</h1>
  <div class="meta">
    <b>${escapeHtml(meta.id)}</b> · status: <b>${escapeHtml(meta.status)}</b> · owner: <b>${escapeHtml(meta.owner)}</b>
    ${meta.target_release ? ` · target: <b>${escapeHtml(meta.target_release)}</b>` : ''}
    ${meta.stakeholders ? ` · stakeholders: ${escapeHtml(meta.stakeholders.join(', '))}` : ''}
  </div>

  <h2>Specification</h2>
  <div class="spec">${specHtml}</div>

  <h2>Requirements (${reqs.length})</h2>
  ${reqsHtml}

  <h2>Success Metrics</h2>
  <table><thead><tr>
    <th>Metric</th><th>Baseline</th><th>Target</th><th>Window</th>
  </tr></thead><tbody>${metricsHtml}</tbody></table>
</body>
</html>`;

  write(outPath, html);
  return outPath;
}

function buildMarkdown(prdDir, outPath) {
  const { meta, reqs, metrics, spec } = loadPrd(prdDir);
  requireMeta(meta);

  let md = `# ${meta.title}\n\n`;
  md += `**${meta.id}** · status: **${meta.status}** · owner: **${meta.owner}**\n\n`;
  if (meta.target_release) md += `Target release: ${meta.target_release}\n`;
  if (meta.stakeholders) md += `Stakeholders: ${meta.stakeholders.join(', ')}\n\n`;
  md += `---\n\n## Specification\n\n${spec}\n\n`;
  md += `## Requirements (${reqs.length})\n\n`;
  for (const r of reqs) {
    md += `### ${r.id}${r.priority ? ` — ${r.priority}` : ''}\n\n`;
    const story = storySentence(r, s => `**${s}**`);
    if (story) md += `${story}\n\n`;
    md += `**Acceptance criteria:**\n`;
    for (const ac of r.acceptance_criteria || []) md += `- ${ac}\n`;
    if (r.traces_to) md += `\n**Traces to:** ${r.traces_to.join(', ')}\n`;
    md += `\n`;
  }
  md += `## Success Metrics\n\n| Metric | Baseline | Target | Window |\n|---|---|---|---|\n`;
  for (const m of metrics)
    md += `| ${m.name} | ${m.baseline ?? '—'} | ${m.target ?? '—'} | ${m.window || '—'} |\n`;

  write(outPath, md);
  return outPath;
}

// ---------- semantic diff ----------

function diffPrd(prdDir, opts) {
  // For demo: load baseline and target versions from a `versions/` subdir if present,
  // else just summarize current state vs. previous (best-effort text diff of requirements).
  const vDir = join(prdDir, 'versions');
  const baseline = opts.baseline || 1;
  const target = opts.target || 2;

  const bp = join(vDir, `v${baseline}.yaml`);
  const tp = join(vDir, `v${target}.yaml`);

  if (!existsSync(bp) || !existsSync(tp)) {
    // Fallback: diff against the live requirements.yaml + a synthetic baseline
    log('(no versions/ dir found — running live snapshot diff)');
    const live = readYaml(join(prdDir, 'requirements.yaml')) || [];
    log(`Live PRD contains ${live.length} requirements:`);
    for (const r of live) {
      log(`  ${r.id}  [${r.priority || '—'}]  ${r.i_want}`);
    }
    return;
  }

  const a = readYaml(bp) || [];
  const b = readYaml(tp) || [];
  const mapA = new Map(a.map(r => [r.id, r]));
  const mapB = new Map(b.map(r => [r.id, r]));

  const added = [...mapB.keys()].filter(id => !mapA.has(id));
  const removed = [...mapA.keys()].filter(id => !mapB.has(id));
  const changed = [...mapB.keys()].filter(id => {
    if (!mapA.has(id)) return false;
    const x = mapA.get(id), y = mapB.get(id);
    return JSON.stringify(x) !== JSON.stringify(y);
  });

  log(`Diff v${baseline} -> v${target}`);
  log(`  + ${added.length} added`);
  log(`  - ${removed.length} removed`);
  log(`  ~ ${changed.length} changed`);
  if (added.length) { log('\nAdded:'); added.forEach(id => log(`  + ${id}: ${mapB.get(id).i_want}`)); }
  if (removed.length) { log('\nRemoved:'); removed.forEach(id => log(`  - ${id}: ${mapA.get(id).i_want}`)); }
  if (changed.length) {
    log('\nChanged:');
    for (const id of changed) {
      const x = mapA.get(id), y = mapB.get(id);
      if (x.priority !== y.priority) log(`  ~ ${id} priority: ${x.priority} -> ${y.priority}`);
      if ((x.acceptance_criteria||[]).length !== (y.acceptance_criteria||[]).length)
        log(`  ~ ${id} AC count: ${(x.acceptance_criteria||[]).length} -> ${(y.acceptance_criteria||[]).length}`);
      if (x.i_want !== y.i_want) log(`  ~ ${id} i_want changed`);
    }
  }
}

// ---------- dependency graph (text) ----------

function graphPrd(rootDir) {
  const prds = [];
  const entries = readdirSync(rootDir);
  for (const e of entries) {
    const p = join(rootDir, e);
    if (!statSync(p).isDirectory()) continue;
    const meta = readYaml(join(p, 'meta.yaml'));
    if (meta) prds.push({ dir: e, ...meta });
  }
  if (prds.length === 0) {
    log('No PRDs found in', rootDir);
    return;
  }
  log(`PRD dependency graph (${prds.length} PRDs)\n`);
  for (const p of prds) {
    log(`[${p.id}] ${p.title}  (${p.status})`);
    if (p.depends_on && p.depends_on.length)
      log(`    depends_on -> ${p.depends_on.join(', ')}`);
    if (p.stakeholders && p.stakeholders.length)
      log(`    stakeholders: ${p.stakeholders.join(', ')}`);
  }
}

// ---------- init scaffold ----------

const TEMPLATES = {
  feature: {
    'meta.yaml': `id: PRD-XXXX
title: <feature name>
status: draft
owner: <you@team>
stakeholders: []
target_release: ""
depends_on: []
reviewers: []
approved_by: []
`,
    'requirements.yaml': `- id: FR-01
  as_a: <persona>
  i_want: <capability>
  so_that: <outcome>
  priority: P1
  acceptance_criteria:
    - <observable, measurable condition>
  traces_to: []
`,
    'metrics.yaml': `- name: <metric>
  baseline: 0
  target: 0
  window: 30d
  source: <amplitude|mixpanel|internal>
`,
    'spec.md': `# <Feature name>

## Context
Why does this matter now? What's the user pain? What's the business case?

## Approach
How will we solve it? What are the key design decisions?

## Out of scope
What we're explicitly NOT doing in this PRD.

## Open questions
- Question 1
- Question 2

## Risks
- Risk 1
- Risk 2
`
  }
};

function initProject(rootDir, name) {
  const target = name ? join(rootDir, name) : rootDir;
  mkdirSync(join(target, 'prds'), { recursive: true });
  mkdirSync(join(target, 'prds', '_templates'), { recursive: true });
  write(join(target, '.prdrc.yaml'), `# PRD-as-Code project config
schema_version: 1
default_template: feature
lint:
  ambiguous_words: true
  passive_voice: true
build:
  default_target: html
`);
  write(join(target, 'README.md'), `# ${name || 'PRD project'}\n\nManaged by PRD-as-Code. See \`prdc --help\`.\n`);
  ok('Initialized PRD project at', target);
}

function newPrd(rootDir, name, template = 'feature') {
  const tpl = TEMPLATES[template];
  if (!tpl) { err('unknown template:', template); process.exit(1); }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const target = join(rootDir, 'prds', slug);
  mkdirSync(target, { recursive: true });
  for (const [file, content] of Object.entries(tpl)) {
    write(join(target, file), content);
  }
  ok('Created PRD from template', template, 'at', target);
}

// ---------- CLI ----------

function help() {
  log(`
prdc — PRD-as-Code CLI

  prdc init [name]                scaffold a new PRD project
  prdc new <name> [--template T]  create a new PRD from template (feature)
  prdc validate <dir>             schema validation
  prdc lint <dir>                 prose quality (ambiguous words, passive voice)
  prdc build <fmt> <dir> [--out]  compile to html | markdown
  prdc diff <dir> [--baseline N --target N]   semantic diff between versions
  prdc graph <root>               dependency graph across all PRDs

Examples:
  prdc init my-product
  prdc new checkout-redesign
  prdc validate prds/checkout-redesign
  prdc build html prds/checkout-redesign --out ./out/checkout.html
  prdc diff prds/checkout-redesign --baseline 1 --target 2
  prdc graph prds/
`);
}

const [, , cmd, ...rest] = process.argv;

function opt(name, def) {
  const i = rest.indexOf(`--${name}`);
  if (i === -1) return def;
  return rest[i + 1];
}

function pathArg() {
  const v = rest.find(a => !a.startsWith('--'));
  return v ? resolve(v) : null;
}

switch (cmd) {
  case 'init': {
    const name = rest.find(a => !a.startsWith('--'));
    initProject(process.cwd(), name);
    break;
  }
  case 'new': {
    const name = rest.find(a => !a.startsWith('--'));
    if (!name) { err('usage: prdc new <name>'); process.exit(1); }
    newPrd(process.cwd(), name, opt('template', 'feature'));
    break;
  }
  case 'validate': {
    const dir = pathArg();
    if (!dir) { err('usage: prdc validate <dir>'); process.exit(1); }
    const { errors, warnings } = validatePrd(dir);
    if (warnings.length) {
      log('\u26A0  warnings:');
      warnings.forEach(w => log('   ', w));
    }
    if (errors.length) {
      err('validation failed:');
      errors.forEach(e => err('   ', e));
      process.exit(1);
    }
    ok('validation passed');
    break;
  }
  case 'lint': {
    const dir = pathArg();
    if (!dir) { err('usage: prdc lint <dir>'); process.exit(1); }
    const ws = lintPrd(dir);
    if (ws.length === 0) ok('lint clean');
    else {
      log('\u26A0  lint warnings:');
      ws.forEach(w => log('   ', w));
      process.exit(1);
    }
    break;
  }
  case 'build': {
    const fmt = rest[0];
    const dir = rest[1] && !rest[1].startsWith('--') ? rest[1] : null;
    if (!fmt || !dir) { err('usage: prdc build <html|markdown> <dir> [--out path]'); process.exit(1); }
    const prdDir = resolve(dir);
    const out = opt('out', join(prdDir, `build.${fmt === 'html' ? 'html' : 'md'}`));
    let p;
    if (fmt === 'html') p = buildHtml(prdDir, out);
    else if (fmt === 'markdown' || fmt === 'md') p = buildMarkdown(prdDir, out);
    else { err('unknown format:', fmt); process.exit(1); }
    ok(`built ${fmt} -> ${p}`);
    break;
  }
  case 'diff': {
    const dir = pathArg();
    if (!dir) { err('usage: prdc diff <dir> [--baseline N --target N]'); process.exit(1); }
    diffPrd(resolve(dir), { baseline: opt('baseline', 1), target: opt('target', 2) });
    break;
  }
  case 'graph': {
    const dir = pathArg();
    if (!dir) { err('usage: prdc graph <root>'); process.exit(1); }
    graphPrd(resolve(dir));
    break;
  }
  case undefined:
  case '-h':
  case '--help':
  case 'help':
    help();
    break;
  default:
    err('unknown command:', cmd);
    help();
    process.exit(1);
}
