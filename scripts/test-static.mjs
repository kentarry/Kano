import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const example = JSON.parse(fs.readFileSync(new URL('../examples/Kano_Project_串燒收集遊戲.json', import.meta.url), 'utf8'));

const requiredFragments = [
  'id="auth-status"',
  'id="product-type"',
  'id="research-goals"',
  'id="openai-model"',
  'id="model-status"',
  'id="survey-package-summary"',
  'async function checkCodexAuth(',
  'async function loadCodexModels(',
  'async function sampleVideoFrames(',
  'async function buildCodexContent(',
  'async function callCodex(',
  'QUESTION_SET_SCHEMA',
  'schemaVersion: 2',
  'function auditSurveyPackage('
];

for (const fragment of requiredFragments) {
  assert.ok(html.includes(fragment), `Missing required fragment: ${fragment}`);
}

assert.ok(!html.includes('AIzaSy'), 'A Google API key must never be committed.');
assert.ok(!html.includes('generativelanguage.googleapis.com'), 'The browser must not call Gemini directly.');
assert.ok(!html.includes('x-goog-api-key'), 'No Google API key header should remain.');
assert.ok(!html.includes('sk-'), 'An OpenAI API key must never be committed.');
assert.equal(example.schemaVersion, 2, 'The example project must use schema version 2.');
assert.ok(example.surveyPackage?.questions?.length >= 4, 'The example project must include Kano questions.');

const marker = html.indexOf('<!-- ════════════ SCRIPT');
const scriptStart = html.indexOf('<script>', marker) + '<script>'.length;
const scriptEnd = html.lastIndexOf('</script>');
assert.ok(marker >= 0 && scriptStart > marker && scriptEnd > scriptStart, 'Main inline script was not found.');
new Function(html.slice(scriptStart, scriptEnd));

console.log('Static application checks passed.');
