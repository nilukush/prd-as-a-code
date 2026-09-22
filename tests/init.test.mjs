import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPrdc, cleanup } from './helpers.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'prdc-init-'));
}

describe('init and new project layout', () => {
  it('init scaffolds .prdrc.yaml, prds/, and README without the unused _templates dir', () => {
    const parent = tmp();
    const r = runPrdc(['init', 'acme'], { cwd: parent });
    expect(r.status).toBe(0);
    expect(existsSync(join(parent, 'acme', '.prdrc.yaml'))).toBe(true);
    expect(existsSync(join(parent, 'acme', 'prds'))).toBe(true);
    expect(existsSync(join(parent, 'acme', 'README.md'))).toBe(true);
    expect(existsSync(join(parent, 'acme', 'prds', '_templates'))).toBe(false);
    cleanup(parent);
  });

  it('new inside the project root lands in <project>/prds/<slug>', () => {
    const parent = tmp();
    runPrdc(['init', 'acme'], { cwd: parent });
    const acme = join(parent, 'acme');
    const r = runPrdc(['new', 'checkout-flow'], { cwd: acme });
    expect(r.status).toBe(0);
    for (const f of ['meta.yaml', 'requirements.yaml', 'metrics.yaml', 'spec.md']) {
      expect(existsSync(join(acme, 'prds', 'checkout-flow', f))).toBe(true);
    }
    cleanup(parent);
  });

  it('new from a project subdirectory walks up to the project root', () => {
    const parent = tmp();
    runPrdc(['init', 'acme'], { cwd: parent });
    const acme = join(parent, 'acme');
    const r = runPrdc(['new', 'payments'], { cwd: join(acme, 'prds') });
    expect(r.status).toBe(0);
    expect(existsSync(join(acme, 'prds', 'payments', 'meta.yaml'))).toBe(true);
    expect(existsSync(join(acme, 'prds', 'prds'))).toBe(false);
    cleanup(parent);
  });

  it('new outside any project still uses the current directory', () => {
    const parent = tmp();
    const r = runPrdc(['new', 'standalone'], { cwd: parent });
    expect(r.status).toBe(0);
    expect(existsSync(join(parent, 'prds', 'standalone', 'meta.yaml'))).toBe(true);
    cleanup(parent);
  });

  it('new reads default_template from .prdrc.yaml and rejects unknown templates there', () => {
    const parent = tmp();
    runPrdc(['init', 'acme'], { cwd: parent });
    const acme = join(parent, 'acme');
    // Rewrite the config with a template that does not exist.
    writeFileSync(
      join(acme, '.prdrc.yaml'),
      'schema_version: 1\ndefault_template: nope\n',
    );
    const r = runPrdc(['new', 'from-config'], { cwd: acme });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('unknown template: nope');
    cleanup(parent);
  });
});
