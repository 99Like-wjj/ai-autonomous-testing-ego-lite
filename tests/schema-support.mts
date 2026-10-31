import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export type Schema = boolean | Record<string, unknown>;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const asObject = (value: unknown): Record<string, unknown> => { assert.ok(object(value)); return value; };
export const schema = (value: unknown): Schema => { assert.ok(typeof value === 'boolean' || object(value)); return value; };
const stable = (value: unknown): string => JSON.stringify(Array.isArray(value) ? value.map(stable) : object(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, stable(v)])) : value);

/** Test-only evaluator for the standard JSON Schema keywords used by these fixtures.
 * Unsupported keywords fail the test rather than silently passing. This is not a runtime validator. */
export function conforms(input: unknown, node: Schema, document: Record<string, unknown>, documents: ReadonlyMap<string, Record<string, unknown>> = new Map()): boolean {
  if (typeof node === 'boolean') return node;
  const supported = new Set(['$schema', '$id', '$defs', '$ref', '$comment', 'title', 'description', 'default', 'examples', 'type', 'const', 'enum', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else']);
  for (const key of Object.keys(node)) assert.ok(supported.has(key), 'Unsupported fixture-schema keyword: ' + key);
  if (node.$ref !== undefined) {
    assert.equal(typeof node.$ref, 'string'); const [file, fragment] = String(node.$ref).split('#');
    const targetDocument = file ? documents.get(file) : document; assert.ok(targetDocument, 'Unknown fixture-schema reference: ' + file);
    assert.ok(fragment === undefined || fragment === '' || fragment.startsWith('/'), 'Only JSON Pointer schema fragments are supported');
    let target: unknown = targetDocument;
    for (const part of fragment?.slice(1).split('/').filter(Boolean) ?? []) target = asObject(target)[part.replaceAll('~1', '/').replaceAll('~0', '~')];
    if (!conforms(input, schema(target), targetDocument, documents)) return false;
  }
  if (node.const !== undefined && stable(input) !== stable(node.const)) return false;
  if (node.enum !== undefined) { assert.ok(Array.isArray(node.enum)); if (!node.enum.some(value => stable(input) === stable(value))) return false; }
  if (node.type !== undefined) {
    const kinds = Array.isArray(node.type) ? node.type : [node.type];
    if (!kinds.some(kind => kind === 'object' ? object(input) : kind === 'array' ? Array.isArray(input) : kind === 'null' ? input === null : kind === 'integer' ? typeof input === 'number' && Number.isInteger(input) : typeof input === kind)) return false;
  }
  if (object(input)) {
    if (node.required !== undefined) { assert.ok(Array.isArray(node.required)); if (node.required.some(key => !Object.hasOwn(input, String(key)))) return false; }
    const properties = node.properties === undefined ? {} : asObject(node.properties);
    for (const [key, value] of Object.entries(input)) {
      if (Object.hasOwn(properties, key)) { if (!conforms(value, schema(properties[key]), document, documents)) return false; }
      else if (node.additionalProperties !== undefined && !conforms(value, schema(node.additionalProperties), document, documents)) return false;
    }
  }
  if (Array.isArray(input)) {
    if (typeof node.minItems === 'number' && input.length < node.minItems || typeof node.maxItems === 'number' && input.length > node.maxItems) return false;
    if (node.uniqueItems === true && new Set(input.map(stable)).size !== input.length) return false;
    if (node.items !== undefined && !input.every(value => conforms(value, schema(node.items), document, documents))) return false;
  }
  if (typeof input === 'string' && (typeof node.minLength === 'number' && [...input].length < node.minLength || typeof node.maxLength === 'number' && [...input].length > node.maxLength)) return false;
  if (typeof input === 'string' && typeof node.pattern === 'string' && !new RegExp(node.pattern).test(input)) return false;
  if (typeof input === 'number' && (typeof node.minimum === 'number' && input < node.minimum || typeof node.maximum === 'number' && input > node.maximum)) return false;
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) if (node[keyword] !== undefined) {
    const branches = node[keyword]; assert.ok(Array.isArray(branches)); const count = branches.filter(branch => conforms(input, schema(branch), document, documents)).length;
    if (keyword === 'allOf' && count !== branches.length || keyword === 'anyOf' && count === 0 || keyword === 'oneOf' && count !== 1) return false;
  }
  if (node.not !== undefined && conforms(input, schema(node.not), document, documents)) return false;
  if (node.if !== undefined) {
    const branch = conforms(input, schema(node.if), document, documents) ? node.then : node.else;
    if (branch !== undefined && !conforms(input, schema(branch), document, documents)) return false;
  }
  return true;
}

export async function loadSchemaDocuments(directory: string): Promise<Map<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const filename of (await fs.readdir(directory)).filter(name => name.endsWith('.schema.json'))) {
    const document = asObject(JSON.parse(await fs.readFile(path.join(directory, filename), 'utf8')));
    result.set(filename, document); if (typeof document.$id === 'string') result.set(document.$id, document);
  }
  return result;
}
