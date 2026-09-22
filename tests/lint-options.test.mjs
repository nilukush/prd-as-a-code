import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { runPrdc, makePrd, cleanup, VALID_META, SAMPLE } from './helpers.mjs';

describe('linter coverage', () => {
  it('flags ambiguous words in as_a and i_want, not only so_that and ACs', () => {
    const dir = makePrd({
      'meta.yaml': VALID_META,
      'requirements.yaml': `- id: FR-01
  as_a: seamless onboarding user
  i_want: a robust dashboard
  so_that: I track usage
  priority: P1
  acceptance_criteria:
    - dashboard renders usage numbers
`,
    });
    const r = runPrdc(['lint', dir]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('FR-01: ambiguous word "seamless" in user story/AC');
    expect(r.stdout).toContain('FR-01: ambiguous word "robust" in user story/AC');
    cleanup(dir);
  });

  it('treats the Lighthouse 3G fast profile as a technical term, not ambiguity', () => {
    const r = runPrdc(['lint', join(SAMPLE, 'checkout-redesign')]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('lint clean');
  });
});

describe('option argument validation', () => {
  it('build exits 1 with a usage error when --out has no value', () => {
    const r = runPrdc(['build', 'html', 'sample/checkout-redesign', '--out']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usage: prdc build');
    expect(r.output).not.toContain('TypeError');
  });

  it('diff falls back to defaults when --baseline has no value', () => {
    const r = runPrdc(['diff', 'sample/checkout-redesign', '--baseline']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Diff v1 -> v2');
  });
});
