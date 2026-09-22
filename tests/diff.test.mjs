import { describe, it, expect } from 'vitest';
import { runPrdc, makePrd, cleanup, VALID_META } from './helpers.mjs';

const ORDERED = `- id: FR-01
  as_a: shopper
  i_want: a stable checkout
  so_that: I keep buying
  priority: P1
  acceptance_criteria:
    - checkout renders
`;

const REORDERED = `- id: FR-01
  priority: P1
  so_that: I keep buying
  i_want: a stable checkout
  as_a: shopper
  acceptance_criteria:
    - checkout renders
`;

describe('semantic diff robustness', () => {
  it('reports zero changes when only YAML key order differs', () => {
    const dir = makePrd(
      { 'meta.yaml': VALID_META, 'requirements.yaml': ORDERED },
      { versions: { 'v1.yaml': ORDERED, 'v2.yaml': REORDERED } },
    );
    const r = runPrdc(['diff', dir, '--baseline', '1', '--target', '2']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('~ 0 changed');
    expect(r.stdout).not.toContain('~ FR-01');
    cleanup(dir);
  });

  it('still reports real changes across reordered keys', () => {
    const dir = makePrd(
      { 'meta.yaml': VALID_META, 'requirements.yaml': REORDERED },
      { versions: { 'v1.yaml': ORDERED, 'v2.yaml': REORDERED.replace('P1', 'P0') } },
    );
    const r = runPrdc(['diff', dir, '--baseline', '1', '--target', '2']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('~ 1 changed');
    expect(r.stdout).toContain('~ FR-01 priority: P1 -> P0');
    cleanup(dir);
  });

  it('names the missing version file when versions/ exists but a snapshot is absent', () => {
    const dir = makePrd(
      { 'meta.yaml': VALID_META, 'requirements.yaml': ORDERED },
      { versions: { 'v2.yaml': ORDERED } },
    );
    const r = runPrdc(['diff', dir, '--baseline', '1', '--target', '2']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('v1.yaml');
    expect(r.stdout).not.toContain('no versions/ dir found');
    cleanup(dir);
  });

  it('keeps the generic fallback message when there is no versions directory at all', () => {
    const dir = makePrd({ 'meta.yaml': VALID_META, 'requirements.yaml': ORDERED });
    const r = runPrdc(['diff', dir]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('no versions/ dir found');
    cleanup(dir);
  });
});
