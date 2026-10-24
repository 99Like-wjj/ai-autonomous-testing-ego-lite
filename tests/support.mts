import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { object } from '../src/core/common.mjs';
export type MutableFixture<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : T extends readonly (infer Item)[] ? MutableFixture<Item>[] : T extends object ? { -readonly [Key in keyof T]: MutableFixture<T[Key]> } : T;
/** Fixtures may intentionally violate enum/number constraints; never use this in runtime code. */
function mutable<T>(value: T): MutableFixture<T> { return structuredClone(value) as MutableFixture<T>; }
export function at<T>(items: readonly T[], index = 0): T { const value = items[index]; if (value === undefined) throw new Error('Missing synthetic fixture item at ' + index); return value; }
export function objectValue(value: unknown): Record<string, unknown> { assert.ok(object(value)); return value; }
/** Small deterministic DOM fixture; the generated browser program runs independently in vm. */
export class FakeElement {
  tagName: string; children: FakeElement[] = []; dataset: Record<string, string> = {};
  listeners: Record<string, ((event: Record<string, unknown> & { target: FakeElement }) => void)[]> = {};
  hidden = false; value = ''; open = false; textContent = ''; parentNode: FakeElement | null = null;
  className = ''; alt = ''; src = ''; tabIndex = 0;
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); }
  append(...nodes: (FakeElement | null | undefined)[]) { for (const node of nodes) if (node != null) { node.parentNode = this; this.children.push(node); } }
  replaceWith(node: FakeElement) { if (!this.parentNode) return; const index = this.parentNode.children.indexOf(this); if (index < 0) return; node.parentNode = this.parentNode; this.parentNode.children.splice(index, 1, node); this.parentNode = null; }
  addEventListener(type: string, handler: (event: Record<string, unknown> & { target: FakeElement }) => void) { (this.listeners[type] ??= []).push(handler); }
  dispatch(type: string, event: Record<string, unknown> = {}) { for (const handler of this.listeners[type] ?? []) handler({ target: this, ...event }); }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
export async function readJson<T>(filename: string, decoder: (value: unknown) => T): Promise<MutableFixture<T>>;
export async function readJson(filename: string): Promise<Record<string, unknown>>;
export async function readJson(filename: string, decoder?: (value: unknown) => unknown): Promise<unknown> {
  const value: unknown = JSON.parse(await fs.readFile(filename, 'utf8'));
  return decoder ? mutable(decoder(value)) : objectValue(value);
}
export interface SchemaNode {
  [key: string]: unknown; $ref?: string; const?: unknown; enum?: unknown[]; required?: string[];
  properties?: Record<string, SchemaNode>; $defs?: Record<string, SchemaNode>; allOf?: SchemaNode[];
  if?: SchemaNode; then?: SchemaNode; items?: SchemaNode; additionalProperties?: boolean | SchemaNode;
}
export function schemaNode(value: unknown): SchemaNode {
  const input = objectValue(value), result: SchemaNode = { ...input };
  if (input.$ref !== undefined) { assert.equal(typeof input.$ref, 'string'); result.$ref = String(input.$ref); }
  if (input.required !== undefined) { assert.ok(Array.isArray(input.required) && input.required.every(item => typeof item === 'string')); result.required = input.required; }
  for (const key of ['properties', '$defs'] as const) if (input[key] !== undefined) result[key] = Object.fromEntries(Object.entries(objectValue(input[key])).map(([name, child]) => [name, schemaNode(child)]));
  if (input.allOf !== undefined) { assert.ok(Array.isArray(input.allOf)); result.allOf = input.allOf.map(schemaNode); }
  for (const key of ['if', 'then', 'items'] as const) if (input[key] !== undefined) result[key] = schemaNode(input[key]);
  return result;
}
