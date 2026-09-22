import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPrdc, makePrd, cleanup, VALID_META } from './helpers.mjs';

const PARTIAL_REQS = `- id: FR-01
  acceptance_criteria:
    - only the id and one criterion exist
`;

describe('build guards', () => {
  it('build html exits 1 with a friendly error when meta.yaml is missing', () => {
    const dir = makePrd({ 'requirements.yaml': PARTIAL_REQS });
    const r = runPrdc(['build', 'html', dir, '--out', join(dir, 'out.html')]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('missing meta.yaml');
    expect(r.output).not.toContain('TypeError');
    expect(r.output).not.toMatch(/^\s+at\s/m);
    cleanup(dir);
  });

  it('build markdown exits 1 with a friendly error when meta.yaml is missing', () => {
    const dir = makePrd({ 'requirements.yaml': PARTIAL_REQS });
    const r = runPrdc(['build', 'markdown', dir, '--out', join(dir, 'out.md')]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('missing meta.yaml');
    cleanup(dir);
  });

  it('build html never renders literal undefined for missing fields', () => {
    const dir = makePrd({ 'meta.yaml': VALID_META, 'requirements.yaml': PARTIAL_REQS });
    const out = join(dir, 'out.html');
    const r = runPrdc(['build', 'html', dir, '--out', out]);
    expect(r.status).toBe(0);
    const html = readFileSync(out, 'utf8');
    expect(html).not.toContain('undefined');
    expect(html).toContain('FR-01');
    cleanup(dir);
  });

  it('build markdown never renders literal undefined or a dangling priority dash', () => {
    const dir = makePrd({ 'meta.yaml': VALID_META, 'requirements.yaml': PARTIAL_REQS });
    const out = join(dir, 'out.md');
    const r = runPrdc(['build', 'markdown', dir, '--out', out]);
    expect(r.status).toBe(0);
    const md = readFileSync(out, 'utf8');
    expect(md).not.toContain('undefined');
    expect(md).not.toMatch(/^### FR-01\s*[—-]\s*$/m);
    expect(md).toContain('FR-01');
    cleanup(dir);
  });

  it('renders the story line with whichever user-story parts exist', () => {
    const dir = makePrd({
      'meta.yaml': VALID_META,
      'requirements.yaml': `- id: FR-02
  i_want: only the want is present
  priority: P2
  acceptance_criteria:
    - something observable
`,
    });
    const out = join(dir, 'out.html');
    const r = runPrdc(['build', 'html', dir, '--out', out]);
    expect(r.status).toBe(0);
    const html = readFileSync(out, 'utf8');
    expect(html).toContain('I want <b>only the want is present</b>');
    expect(html).not.toContain('As a <b></b>');
    cleanup(dir);
  });
});
