import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { runPrdc, SAMPLE, ROOT } from './helpers.mjs';

const checkout = join(SAMPLE, 'checkout-redesign');

// Probe the PDF environment the same way prdc.js does: which engine module is
// resolvable from the repo, and does a Chromium executable exist for it?
// 'none'        no playwright/playwright-core installed -> install-hint path
// 'no-browser'  module installed but Chromium missing    -> browser-hint path
// 'ready'       module + Chromium                         -> real render path
// PRDC_PDF_ENGINE=none forces the 'none' behavior inside the CLI, so the
// install-hint test runs in every environment; the other two run wherever
// their precondition actually holds (CI: no-browser, dev machine: ready).
function probePdfEnv() {
  if (process.env.PRDC_PDF_ENGINE === 'none') return 'none';
  const req = createRequire(join(ROOT, 'package.json'));
  for (const name of ['playwright', 'playwright-core']) {
    let mod;
    try {
      req.resolve(name);
      mod = req(name);
    } catch {
      continue;
    }
    try {
      return existsSync(mod.chromium.executablePath()) ? 'ready' : 'no-browser';
    } catch {
      return 'no-browser';
    }
  }
  return 'none';
}
const PDF_ENV = probePdfEnv();

function tmpOut(name) {
  return join(mkdtempSync(join(tmpdir(), 'prdc-pdf-')), name);
}

describe('build pdf', () => {
  it('lists pdf in the build usage error', () => {
    const r = runPrdc(['build', 'pdf']);
    expect(r.status).toBe(1);
    expect(r.output).toContain('usage: prdc build <html|markdown|gherkin|pdf> <dir> [--out path]');
  });

  it('prints a clear install hint when playwright is unavailable (PRDC_PDF_ENGINE=none)', () => {
    const out = tmpOut('should-not-exist.pdf');
    const r = runPrdc(['build', 'pdf', checkout, '--out', out], { env: { PRDC_PDF_ENGINE: 'none' } });
    expect(r.status).toBe(1);
    expect(r.output).toContain('pdf target needs playwright');
    expect(r.output).toContain('npm i -g playwright');
    expect(existsSync(out)).toBe(false);
  });

  it.skipIf(PDF_ENV !== 'no-browser')(
    'points at npx playwright install chromium when the browser is missing',
    () => {
      const r = runPrdc(['build', 'pdf', checkout, '--out', tmpOut('x.pdf')]);
      expect(r.status).toBe(1);
      expect(r.output).toContain('npx playwright install chromium');
    },
  );

  it.skipIf(PDF_ENV !== 'ready')('renders a real PDF from the checkout sample', () => {
    const out = tmpOut('checkout.pdf');
    const r = runPrdc(['build', 'pdf', checkout, '--out', out]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('built pdf ->');
    const buf = readFileSync(out);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(statSync(out).size).toBeGreaterThan(5000);
    rmSync(dirname(out), { recursive: true, force: true });
  });
});

describe('--version', () => {
  it('prints the package version', () => {
    const r = runPrdc(['--version']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
