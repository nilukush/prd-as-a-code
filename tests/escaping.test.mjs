import { describe, it, expect } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runPrdc, makePrd, cleanup, VALID_META } from './helpers.mjs';

const HOSTILE_REQS = `- id: FR-01
  as_a: "<img src=x onerror=alert(1)>"
  i_want: "<script>alert('pwned')</script>"
  so_that: "<svg onload=alert(2)>"
  priority: P1
  acceptance_criteria:
    - "payload <img src=x onerror=alert(3)> in an AC"
  traces_to: ["<b>JIRA-1</b>"]
`;

const HOSTILE_META = `id: PRD-9006
title: "<script>alert('title')</script>"
status: draft
owner: 'o''mallo"y'
stakeholders: ["<i>legal</i>"]
depends_on: []
`;

describe('HTML escaping in build output', () => {
  it('escapes hostile requirement and meta fields in HTML', () => {
    const dir = makePrd({ 'meta.yaml': HOSTILE_META, 'requirements.yaml': HOSTILE_REQS });
    const out = join(dir, 'out.html');
    const r = runPrdc(['build', 'html', dir, '--out', out]);
    expect(r.status).toBe(0);
    const html = readFileSync(out, 'utf8');

    // No raw executable markup may survive from YAML-derived fields.
    // (Attribute names like onerror= can appear as escaped text content,
    // which is inert; only unescaped tags are dangerous.)
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img ');
    expect(html).not.toContain('<svg ');
    expect(html).not.toContain('<i>');
    expect(html).not.toContain('<b>1</b>');

    // Content must survive, escaped.
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('&lt;b&gt;JIRA-1&lt;/b&gt;');
    expect(html).toContain('o&#39;mallo&quot;y');
    cleanup(dir);
  });

  it('escapes hostile metric fields in HTML', () => {
    const dir = makePrd({
      'meta.yaml': VALID_META,
      'requirements.yaml': `- id: FR-01
  as_a: shopper
  i_want: a metric row
  so_that: I see numbers
  priority: P1
  acceptance_criteria:
    - metric row renders escaped
`,
      'metrics.yaml': `- name: "<script>m</script>"
  baseline: "<b>1</b>"
  target: 2
  window: "<i>30d</i>"
`,
    });
    const out = join(dir, 'out.html');
    const r = runPrdc(['build', 'html', dir, '--out', out]);
    expect(r.status).toBe(0);
    const html = readFileSync(out, 'utf8');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>1</b>');
    expect(html).not.toContain('<i>30d</i>');
    expect(html).toContain('&lt;script&gt;m&lt;/script&gt;');
    cleanup(dir);
  });

  it('keeps escaping the built sample artifact sane', () => {
    const out = join(process.cwd(), 'sample', 'checkout-redesign', '.esc-test.html');
    const r = runPrdc(['build', 'html', 'sample/checkout-redesign', '--out', out]);
    expect(r.status).toBe(0);
    const html = readFileSync(out, 'utf8');
    // The `checkout.preselect_v2` rollback text contains backticks, not markup,
    // but apostrophes and ampersands must round-trip escaped.
    expect(html).not.toContain('<script>');
    rmSync(out, { force: true });
  });
});
