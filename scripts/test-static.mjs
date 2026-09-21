import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const requiredFragments = [
  'id="api-key"',
  'id="product-type"',
  'id="research-goals"',
  'id="model-select"',
  'id="model-status"',
  'id="survey-package-summary"',
  'function testApiConnection()',
  'async function refreshAvailableModels(',
  'models?pageSize=1000',
  "supportedGenerationMethods?.includes('generateContent')",
  '已自動改用',
  'async function prepareMediaParts(',
  "'x-goog-api-key'",
  "responseMimeType: 'application/json'",
  'schemaVersion: 2',
  'function auditSurveyPackage('
];

for (const fragment of requiredFragments) {
  assert.ok(html.includes(fragment), `Missing required fragment: ${fragment}`);
}

assert.ok(!html.includes('AIzaSy'), 'A Google API key must never be committed.');
assert.ok(!html.includes(':generateContent?key='), 'API keys must be sent in a header, not a URL.');

const marker = html.indexOf('<!-- ════════════ SCRIPT');
const scriptStart = html.indexOf('<script>', marker) + '<script>'.length;
const scriptEnd = html.lastIndexOf('</script>');
assert.ok(marker >= 0 && scriptStart > marker && scriptEnd > scriptStart, 'Main inline script was not found.');
new Function(html.slice(scriptStart, scriptEnd));

console.log('Static application checks passed.');
