import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

describe('npm run demo', () => {
  it('runs the full validate, lint, build, diff pipeline green', () => {
    const r = spawnSync('npm', ['run', 'demo'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('validation passed');
    expect(r.stdout).toContain('lint clean');
    expect(r.stdout).toContain('built html');
    expect(r.stdout).toContain('Diff v1 -> v2');
    // The demo writes ./_demo-out; confirm and clean up.
    const demoOut = join(ROOT, '_demo-out');
    if (existsSync(demoOut)) rmSync(demoOut, { recursive: true, force: true });
  });
});
