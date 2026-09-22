import { describe, it, expect } from 'vitest';
import { runPrdc, makePrd, cleanup, SAMPLE, VALID_REQS } from './helpers.mjs';

const BROKEN_YAML = `id: PRD-9004
title: Broken
status: draft
owner: [unclosed
`;

describe('malformed YAML input', () => {
  it('validate exits 1 with a friendly parse error, no stack trace', () => {
    const dir = makePrd({ 'meta.yaml': BROKEN_YAML, 'requirements.yaml': VALID_REQS });
    const r = runPrdc(['validate', dir]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('YAML parse error');
    expect(r.stderr).toContain('meta.yaml');
    expect(r.output).not.toContain('YAMLException');
    expect(r.output).not.toMatch(/^\s+at\s/m);
    cleanup(dir);
  });

  it('graph exits 1 with a friendly parse error on a broken sibling', () => {
    const parent = makePrd({ 'broken-prd/meta.yaml': BROKEN_YAML });
    const r = runPrdc(['graph', parent]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('YAML parse error');
    expect(r.stderr).toContain('meta.yaml');
    expect(r.output).not.toContain('YAMLException');
    cleanup(parent);
  });

  it('lint exits 1 with a friendly parse error on broken requirements', () => {
    const dir = makePrd({
      'meta.yaml': 'id: PRD-9005\ntitle: Lint Broken\nstatus: draft\nowner: t@t\n',
      'requirements.yaml': 'id: FR-01\n  broken: [\n',
    });
    const r = runPrdc(['lint', dir]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('YAML parse error');
    expect(r.stderr).toContain('requirements.yaml');
    cleanup(dir);
  });
});
