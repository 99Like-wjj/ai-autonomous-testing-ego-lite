import test from 'node:test';
import assert from 'node:assert/strict';
import { reportThemes, reportThemeCss } from '../src/report/themes.mjs';
import { reportShell } from '../src/report/shell.mjs';

function luminance(hex: string): number {
  const values = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * values[0]! + .7152 * values[1]! + .0722 * values[2]!;
}
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (light! + .05) / (dark! + .05);
}
test('all eight themes retain readable text on every report surface', () => {
  assert.deepEqual(reportThemes.map(t => t.id), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  for (const t of reportThemes) {
    for (const surface of [t.panel, t.header, t.surface, t.background]) {
      assert.ok(contrast(t.ink, surface) >= 4.5, t.id + ' primary text contrast');
      assert.ok(contrast(t.muted, surface) >= 4.5, t.id + ' secondary text contrast');
    }
  }
});
test('theme shell is offline, keyboard-labelled and cannot recolor evidence pixels', () => {
  const html = reportShell('{}', ''), css = reportThemeCss();
  assert.equal((html.match(/class="theme-option"/g) ?? []).length, 8);
  assert.match(html, /aria-labelledby="theme-title"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /\[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(css, /filter\s*:|https?:|url\s*\(/i);
  assert.match(html, /filter:none/);
  assert.match(css, /color-scheme:dark/);
  assert.match(css, /color-scheme:light/);
});
