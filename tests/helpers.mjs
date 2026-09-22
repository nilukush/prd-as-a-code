import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const PRDC = join(ROOT, 'prdc.js');
export const SAMPLE = join(ROOT, 'sample');

// Run the CLI as a subprocess, the way real users and CI invoke it.
export function runPrdc(args, { cwd = ROOT } = {}) {
  const r = spawnSync(process.execPath, [PRDC, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    output: `${r.stdout ?? ''}${r.stderr ?? ''}`,
  };
}

// Create a throwaway PRD directory from file contents.
export function makePrd(files, { versions } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'prdc-test-'));
  for (const [name, content] of Object.entries(files)) {
    const p = join(dir, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  for (const [name, content] of Object.entries(versions ?? {})) {
    const p = join(dir, 'versions', name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
}

export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

export const VALID_META = `id: PRD-9001
title: Test Feature
status: draft
owner: tester@team
stakeholders: []
depends_on: []
`;

export const VALID_REQS = `- id: FR-01
  as_a: shopper
  i_want: a working checkout
  so_that: I can buy things
  priority: P1
  acceptance_criteria:
    - checkout completes with one tap
`;
