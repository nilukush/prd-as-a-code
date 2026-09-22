import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runPrdc, makePrd, cleanup, SAMPLE, VALID_META, VALID_REQS } from './helpers.mjs';

const checkout = join(SAMPLE, 'checkout-redesign');
const vault = join(SAMPLE, 'vault-tokenization');

// Characterization tests: they pin the behavior the prototype was verified to
// have on import (2026-09-22 verifier run). Bug fixes update these deliberately.

describe('validate', () => {
  it('passes on the checkout sample with exactly the two P0/rollback warnings', () => {
    const r = runPrdc(['validate', checkout]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('NFR-01: P0 requirements should declare a rollback_plan');
    expect(r.stdout).toContain('NFR-02: P0 requirements should declare a rollback_plan');
    expect(r.stdout).toContain('validation passed');
  });

  it('passes on the vault sample', () => {
    const r = runPrdc(['validate', vault]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('validation passed');
  });

  it('fails with exit 1 when meta.yaml is missing', () => {
    const dir = makePrd({ 'requirements.yaml': VALID_REQS });
    const r = runPrdc(['validate', dir]);
    expect(r.status).toBe(1);
    expect(r.output).toContain('missing meta.yaml');
    cleanup(dir);
  });

  it('fails when a requirement has no acceptance criteria', () => {
    const dir = makePrd({
      'meta.yaml': VALID_META,
      'requirements.yaml': `- id: FR-01
  as_a: shopper
  i_want: something
  so_that: benefit
  priority: P1
  acceptance_criteria: []
`,
    });
    const r = runPrdc(['validate', dir]);
    expect(r.status).toBe(1);
    expect(r.output).toContain('FR-01: every requirement needs >=1 acceptance criterion');
    cleanup(dir);
  });

  it('fails the approval gate when reviewers are missing', () => {
    const dir = makePrd({
      'meta.yaml': `id: PRD-9002
title: Needs Review
status: approved
owner: tester@team
`,
      'requirements.yaml': VALID_REQS,
    });
    const r = runPrdc(['validate', dir]);
    expect(r.status).toBe(1);
    expect(r.output).toContain('status=approved requires at least 1 reviewer signature');
    cleanup(dir);
  });

  it('warns when depends_on does not resolve to a sibling', () => {
    // The PRD lives in its own parent folder so the sibling scan sees only
    // known neighbors, never unrelated fixtures from parallel test workers.
    const parent = makePrd({
      'dangling/meta.yaml': `id: PRD-9003
title: Dangling
status: draft
owner: tester@team
depends_on: [PRD-NOPE]
`,
      'dangling/requirements.yaml': VALID_REQS,
    });
    const r = runPrdc(['validate', join(parent, 'dangling')]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('depends_on "PRD-NOPE" does not resolve to any sibling PRD');
    cleanup(parent);
  });
});

describe('lint', () => {
  it('passes clean on the checkout sample once 3G fast is exempted as a technical term', () => {
    const r = runPrdc(['lint', checkout]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('lint clean');
  });

  it('flags passive voice in acceptance criteria', () => {
    const dir = makePrd({
      'meta.yaml': VALID_META,
      'requirements.yaml': `- id: FR-01
  as_a: shopper
  i_want: a session timer
  so_that: I know my session length
  priority: P1
  acceptance_criteria:
    - users are redirected after timeout
`,
    });
    const r = runPrdc(['lint', dir]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('FR-01: passive voice in AC');
    cleanup(dir);
  });
});

describe('diff', () => {
  it('reports the v1 -> v2 semantic diff for the checkout sample', () => {
    const r = runPrdc(['diff', checkout, '--baseline', '1', '--target', '2']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Diff v1 -> v2');
    expect(r.stdout).toContain('+ 2 added');
    expect(r.stdout).toContain('- 0 removed');
    expect(r.stdout).toContain('~ 3 changed');
    expect(r.stdout).toContain('~ FR-01 priority: P1 -> P0');
    expect(r.stdout).toContain('~ FR-01 AC count: 2 -> 3');
    expect(r.stdout).toContain('+ NFR-01: PCI scope limited to the vault service');
  });

  it('falls back to a live snapshot listing when versions are missing', () => {
    const r = runPrdc(['diff', vault]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Live PRD contains 2 requirements');
  });
});

describe('graph', () => {
  it('lists both sample PRDs and the dependency edge', () => {
    const r = runPrdc(['graph', SAMPLE]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[PRD-1042]');
    expect(r.stdout).toContain('[PRD-1019]');
    expect(r.stdout).toContain('depends_on -> PRD-1019');
  });
});

describe('build', () => {
  it('builds self-contained HTML for the checkout sample', () => {
    const out = join(SAMPLE, 'checkout-redesign', '.test-build.html');
    const r = runPrdc(['build', 'html', checkout, '--out', out]);
    expect(r.status).toBe(0);
    expect(existsSync(out)).toBe(true);
    const html = readFileSync(out, 'utf8');
    expect(html).toContain('<title>Checkout Redesign');
    for (const id of ['FR-01', 'FR-02', 'FR-03', 'NFR-01', 'NFR-02']) {
      expect(html).toContain(`class="id">${id}</span>`);
    }
    expect(html).toContain('checkout_conversion_rate');
    rmSync(out, { force: true });
  });

  it('builds markdown with the metrics table', () => {
    const out = join(SAMPLE, 'checkout-redesign', '.test-build.md');
    const r = runPrdc(['build', 'markdown', checkout, '--out', out]);
    expect(r.status).toBe(0);
    const md = readFileSync(out, 'utf8');
    expect(md).toContain('# Checkout Redesign');
    expect(md).toContain('| Metric | Baseline | Target | Window |');
    rmSync(out, { force: true });
  });

  it('rejects unknown formats', () => {
    // pdf used to be the unknown-format example; it became a real target in
    // 0.2.0, so this stays a genuine unknown-format check.
    const r = runPrdc(['build', 'docx', checkout]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('unknown format');
  });
});

describe('cli surface', () => {
  it('prints help with exit 0', () => {
    const r = runPrdc(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('prdc');
    expect(r.stdout).toContain('prdc validate <dir>');
  });

  it('exits 1 on unknown commands', () => {
    const r = runPrdc(['frobnicate']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('unknown command');
  });

  it('exits 1 when validate gets no directory', () => {
    const r = runPrdc(['validate']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usage: prdc validate <dir>');
  });
});
