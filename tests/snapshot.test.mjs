import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runPrdc, makePrd, cleanup, VALID_META, VALID_REQS } from './helpers.mjs';

// Phase 1 m2: `prdc snapshot` freezes the current requirements.yaml as the
// next numbered file in versions/, which is what `prdc diff` compares
// against. Snapshots are deterministic: numbered copy plus one header
// comment, no timestamps.

describe('snapshot', () => {
  it('creates versions/v1.yaml when no versions exist', () => {
    const dir = makePrd({ 'meta.yaml': VALID_META, 'requirements.yaml': VALID_REQS });
    const r = runPrdc(['snapshot', dir]);
    expect(r.status).toBe(0);
    const target = join(dir, 'versions', 'v1.yaml');
    expect(existsSync(target)).toBe(true);
    const content = readFileSync(target, 'utf8');
    expect(content).toContain('FR-01');
    expect(content.startsWith('# v1 snapshot of requirements.yaml')).toBe(true);
    expect(r.stdout).toContain('versions/v1.yaml');
    cleanup(dir);
  });

  it('increments to max existing version + 1', () => {
    const dir = makePrd(
      { 'meta.yaml': VALID_META, 'requirements.yaml': VALID_REQS },
      { versions: { 'v1.yaml': VALID_REQS, 'v2.yaml': VALID_REQS } }
    );
    const r = runPrdc(['snapshot', dir]);
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, 'versions', 'v3.yaml'))).toBe(true);
    expect(r.stdout).toContain('v3');
    cleanup(dir);
  });

  it('handles sparse version numbers (v2 and v7 exist, writes v8)', () => {
    const dir = makePrd(
      { 'meta.yaml': VALID_META, 'requirements.yaml': VALID_REQS },
      { versions: { 'v2.yaml': VALID_REQS, 'v7.yaml': VALID_REQS } }
    );
    const r = runPrdc(['snapshot', dir]);
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, 'versions', 'v8.yaml'))).toBe(true);
    cleanup(dir);
  });

  it('fails with exit 1 when requirements.yaml is missing', () => {
    const dir = makePrd({ 'meta.yaml': VALID_META });
    const r = runPrdc(['snapshot', dir]);
    expect(r.status).toBe(1);
    expect(r.output).toContain('missing requirements.yaml');
    cleanup(dir);
  });

  it('produces a snapshot that diff can compare as the new target', () => {
    const dir = makePrd(
      {
        'meta.yaml': VALID_META,
        'requirements.yaml': VALID_REQS.replace('priority: P1', 'priority: P0'),
      },
      { versions: { 'v1.yaml': VALID_REQS } }
    );
    const snap = runPrdc(['snapshot', dir]);
    expect(snap.status).toBe(0);
    const diff = runPrdc(['diff', dir, '--baseline', '1', '--target', '2']);
    expect(diff.status).toBe(0);
    expect(diff.stdout).toContain('Diff v1 -> v2');
    expect(diff.stdout).toContain('~ FR-01 priority: P1 -> P0');
    cleanup(dir);
  });

  it('requires a directory argument', () => {
    const r = runPrdc(['snapshot']);
    expect(r.status).toBe(1);
    expect(r.output).toContain('usage: prdc snapshot <dir>');
  });
});
