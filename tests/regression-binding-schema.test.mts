import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hash, SOURCE_ROOT } from '../src/core/common.mjs';
import { prepareBinding } from '../src/regression/binding.mjs';
import { selectRegression } from '../src/regression/selection.mjs';
import { bindingRequest, regressionFixture } from './regression-fixture.mjs';
import { asObject, conforms, loadSchemaDocuments, schema } from './schema-support.mjs';

async function schemaFixture() {
  const documents = await loadSchemaDocuments(path.join(SOURCE_ROOT, 'schemas')), document = documents.get('regression-binding.schema.json')!;
  return { documents, document, requestSchema: schema(asObject(document.$defs).request) };
}

test('binding sources distinguish statements from current retained evidence in both schema and parser', async t => {
  const f = await regressionFixture(t), s = await schemaFixture();
  const selection = await selectRegression({ projectDir: f.projectDir, request: f.selectionRequest }), request = bindingRequest(selection);
  const currentFile = path.join(f.root, 'current-condition.log'), bytes = 'Synthetic current evidence, outside historical run directories.';
  await fs.writeFile(currentFile, bytes);
  const check = (input: unknown) => conforms(input, s.requestSchema, s.document, s.documents);
  const prepare = (input: unknown) => prepareBinding({ projectDir: f.projectDir, request: input, baseline: f.baseline, runId: 'synthetic-binding-schema-run' });
  for (const kind of ['current_user_statement', 'ai_declaration'] as const) {
    const valid = structuredClone(request); valid.conditions.items[0]!.source = { kind, locator: 'Synthetic current statement location', file: null, sha256: null };
    assert.equal(check(valid), true); await assert.doesNotReject(prepare(valid));
    for (const fields of [{ file: currentFile, sha256: hash(bytes) }, { file: currentFile, sha256: null }, { file: null, sha256: hash(bytes) }]) {
      const invalid = structuredClone(valid); invalid.conditions.items[0]!.source = { ...invalid.conditions.items[0]!.source, ...fields };
      assert.equal(check(invalid), false); await assert.rejects(prepare(invalid), /statements may not disguise/);
    }
  }
  const evidence = structuredClone(request); evidence.conditions.items[0]!.source = { kind: 'current_evidence', locator: 'Synthetic current evidence location', file: currentFile, sha256: hash(bytes) };
  assert.equal(check(evidence), true); await assert.doesNotReject(prepare(evidence));
  for (const fields of [{ file: null, sha256: hash(bytes) }, { file: currentFile, sha256: null }, { file: null, sha256: null }, { file: '', sha256: hash(bytes) }, { file: 'relative/current.log', sha256: hash(bytes) }, { file: currentFile + '\0', sha256: hash(bytes) }, { file: currentFile, sha256: 'not-a-sha256' }]) {
    const invalid = structuredClone(evidence); invalid.conditions.items[0]!.source = { ...invalid.conditions.items[0]!.source, ...fields };
    assert.equal(check(invalid), false); await assert.rejects(prepare(invalid));
  }
  // JSON Schema checks the declaration shape; the runtime authenticates the retained local bytes.
  const wrongBytes = structuredClone(evidence); wrongBytes.conditions.items[0]!.source.sha256 = '0'.repeat(64);
  assert.equal(check(wrongBytes), true); await assert.rejects(prepare(wrongBytes), /file\/hash mismatch/);
});

test('binding declaration times require UTC seconds or milliseconds with Z, preserving the existing parser contract', async t => {
  const f = await regressionFixture(t), s = await schemaFixture();
  const selection = await selectRegression({ projectDir: f.projectDir, request: f.selectionRequest }), request = bindingRequest(selection);
  const check = (input: unknown) => conforms(input, s.requestSchema, s.document, s.documents);
  const prepare = (input: unknown) => prepareBinding({ projectDir: f.projectDir, request: input, baseline: f.baseline, runId: 'synthetic-timestamp-schema-run' });
  for (const declaredAt of ['2026-10-30T12:34:56Z', '2026-10-30T12:34:56.123Z']) {
    const valid = { ...request, conditions: { ...request.conditions, declaredAt } };
    assert.equal(check(valid), true); const result = await prepare(valid); assert.equal(result.binding.conditions.declaredAt, declaredAt);
  }
  for (const declaredAt of ['2026-10-30T12:34:56.123456+00:00', '2026-10-30T12:34:56+00:00', '2026-10-30T20:34:56+08:00', '2026-10-30T12:34:56.123456Z', '2026-10-30T12:34:56.12Z', '2026-10-30T12:34:56']) {
    const invalid = { ...request, conditions: { ...request.conditions, declaredAt } };
    assert.equal(check(invalid), false); await assert.rejects(prepare(invalid), /condition declaration time timestamp/);
  }
});

test('fixture schema evaluator resolves external references, union types and structural failures without ignoring unknown keywords', async () => {
  const s = await schemaFixture(), value = { type: ['string', 'null'] };
  assert.equal(conforms(null, value, s.document, s.documents), true); assert.equal(conforms('source', value, s.document, s.documents), true); assert.equal(conforms(3, value, s.document, s.documents), false);
  assert.equal(conforms('2026-10-30T12:34:56Z', { $ref: 'common.schema.json#/$defs/timestamp' }, s.document, s.documents), true);
  assert.equal(conforms('2026-10-30T12:34:56+00:00', { $ref: 'common.schema.json#/$defs/timestamp' }, s.document, s.documents), false);
  assert.throws(() => conforms({}, { $ref: 'missing-schema.json' }, s.document, s.documents), /Unknown fixture-schema reference/);
});
