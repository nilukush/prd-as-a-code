import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { ROOT, runPrdc, makePrd, cleanup, VALID_META, VALID_REQS } from './helpers.mjs';

// Phase 1 m1: validation rules live in shipped JSON Schema (draft 2020-12)
// files, so editors and other tools can consume the same contract the CLI
// enforces. These tests pin the schemas themselves; the CLI characterization
// tests in cli.test.mjs pin that validate output stays identical.

const schemaDir = join(ROOT, 'schema');
const metaPath = join(schemaDir, 'meta.schema.json');
const reqsPath = join(schemaDir, 'requirements.schema.json');
const metricsPath = join(schemaDir, 'metrics.schema.json');

function loadSchema(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

describe('schema files', () => {
  it('ships meta, requirements, and metrics schemas', () => {
    expect(existsSync(metaPath)).toBe(true);
    expect(existsSync(reqsPath)).toBe(true);
    expect(existsSync(metricsPath)).toBe(true);
  });

  it('declares draft 2020-12 in every schema', () => {
    for (const p of [metaPath, reqsPath, metricsPath]) {
      expect(loadSchema(p).$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    }
  });

  it('compiles every schema under Ajv draft 2020-12', () => {
    const ajv = new Ajv2020({ allErrors: true });
    for (const p of [metaPath, reqsPath, metricsPath]) {
      expect(ajv.compile(loadSchema(p))).toBeTypeOf('function');
    }
  });
});

describe('meta schema contract', () => {
  const ajv = new Ajv2020({ allErrors: true });
  const schema = loadSchema(metaPath);
  const validate = ajv.compile(schema);

  const validMeta = {
    id: 'PRD-9001', title: 'Test Feature', owner: 'tester@team', status: 'draft',
  };

  it('accepts a minimal valid meta document', () => {
    expect(validate(validMeta)).toBe(true);
  });

  it('status enum is exactly the documented five states, in order', () => {
    expect(schema.properties.status.enum).toEqual([
      'draft', 'review', 'approved', 'shipped', 'archived',
    ]);
  });

  it('rejects a missing id', () => {
    const { id, ...withoutId } = validMeta;
    expect(validate(withoutId)).toBe(false);
  });

  it('rejects an empty-string id the same as a missing one', () => {
    expect(validate({ ...validMeta, id: '' })).toBe(false);
  });

  it('rejects a status outside the enum', () => {
    expect(validate({ ...validMeta, status: 'bogus' })).toBe(false);
  });

  it('enforces the approval gate: approved requires a non-empty reviewers list', () => {
    expect(validate({ ...validMeta, status: 'approved' })).toBe(false);
    expect(validate({ ...validMeta, status: 'approved', reviewers: [] })).toBe(false);
    // reviewers alone is still incomplete; the approved_by branch (next test)
    // rejects it, exactly like the historical two-error CLI gate.
    expect(
      validate({ ...validMeta, status: 'approved', reviewers: [], approved_by: ['b@team'] })
    ).toBe(false);
    expect(
      validate({ ...validMeta, status: 'approved', reviewers: ['a@team'], approved_by: ['b@team'] })
    ).toBe(true);
  });

  it('enforces the approval gate: approved requires a non-empty approved_by list', () => {
    const gateBase = { ...validMeta, status: 'approved', reviewers: ['a@team'] };
    expect(validate(gateBase)).toBe(false);
    expect(validate({ ...gateBase, approved_by: [] })).toBe(false);
    expect(validate({ ...gateBase, approved_by: ['b@team'] })).toBe(true);
  });
});

describe('requirements schema contract', () => {
  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile(loadSchema(reqsPath));

  const validReqs = [
    { id: 'FR-01', acceptance_criteria: ['checkout completes with one tap'] },
  ];

  it('accepts a valid requirements list, including extra fields the linter handles', () => {
    expect(validate([
      { ...validReqs[0], as_a: 'shopper', priority: 'P1', traces_to: [] },
    ])).toBe(true);
  });

  it('rejects a non-array document', () => {
    expect(validate({ id: 'FR-01' })).toBe(false);
  });

  it('rejects an item missing its id', () => {
    expect(validate([{ acceptance_criteria: ['x'] }])).toBe(false);
  });

  it('rejects an item missing acceptance_criteria', () => {
    expect(validate([{ id: 'FR-01' }])).toBe(false);
  });

  it('rejects an empty acceptance_criteria list', () => {
    expect(validate([{ id: 'FR-01', acceptance_criteria: [] }])).toBe(false);
  });
});

describe('metrics schema contract', () => {
  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile(loadSchema(metricsPath));

  it('accepts a valid metrics list', () => {
    expect(validate([{ name: 'conversion', baseline: 1, target: 2, window: '30d' }])).toBe(true);
  });

  it('rejects a non-array document', () => {
    expect(validate({ name: 'conversion' })).toBe(false);
  });

  it('rejects an item missing its name', () => {
    expect(validate([{ baseline: 1 }])).toBe(false);
  });
});

describe('CLI validate stays message-compatible with the schemas', () => {
  it('never leaks Ajv strict-mode warnings to stderr', () => {
    const dir = makePrd({ 'meta.yaml': VALID_META, 'requirements.yaml': VALID_REQS });
    const r = runPrdc(['validate', dir]);
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain('strict mode');
    cleanup(dir);
  });

  it('rejects a non-string id with a clear message', () => {
    const dir = makePrd({
      'meta.yaml': `id: 123
title: Numeric Id
status: draft
owner: tester@team
`,
      'requirements.yaml': VALID_REQS,
    });
    const r = runPrdc(['validate', dir]);
    expect(r.status).toBe(1);
    expect(r.output).toContain('meta.id must be a string');
    cleanup(dir);
  });

  it('reports the enum rejection with the exact historical message', () => {
    const dir = makePrd({
      'meta.yaml': `id: PRD-9004
title: Bad Status
status: bogus
owner: tester@team
`,
      'requirements.yaml': VALID_REQS,
    });
    const r = runPrdc(['validate', dir]);
    expect(r.status).toBe(1);
    expect(r.output).toContain('meta.status "bogus" not in draft|review|approved|shipped|archived');
    cleanup(dir);
  });

  it('reports a missing meta field with the exact historical message', () => {
    const dir = makePrd({
      'meta.yaml': `title: No Id
status: draft
owner: tester@team
`,
      'requirements.yaml': VALID_REQS,
    });
    const r = runPrdc(['validate', dir]);
    expect(r.status).toBe(1);
    expect(r.output).toContain('meta.id is required (e.g. PRD-1042)');
    cleanup(dir);
  });

  it('still passes the valid fixture end to end', () => {
    const dir = makePrd({ 'meta.yaml': VALID_META, 'requirements.yaml': VALID_REQS });
    const r = runPrdc(['validate', dir]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('validation passed');
    cleanup(dir);
  });
});
