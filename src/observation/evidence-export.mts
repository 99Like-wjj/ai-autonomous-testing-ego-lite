/** Select committed local events into a new evidence file; never replay an HTTP request. */
import path from 'node:path';
import { assertClosed, canonicalHash, hash, inside, json, object, safeIdentifier, safePath, writeNew } from '../core/common.mjs';
import { parseQuery, reject, sensitiveKey, short, unsafeKey, whole } from './model.mjs';
import { queryNetwork } from './query.mjs';
import { networkRoot } from './store.mjs';

interface Selection { captureId: string; seq: number }
export interface NetworkEvidenceExportRequest {
  networkVersion: 1; query: unknown; selection: Selection[]; purpose: string; bodyFields?: string[];
}
export function parseEvidenceExport(input: unknown): NetworkEvidenceExportRequest {
  assertClosed(input, ['networkVersion', 'query', 'selection', 'purpose', 'bodyFields'], 'network evidence export');
  if (input.networkVersion !== 1) reject('unsupported_network_version');
  const query = parseQuery(input.query), purpose = short(input.purpose, 'purpose', 2048);
  if (!Array.isArray(input.selection) || input.selection.length < 1 || input.selection.length > 200) reject('invalid_export_selection');
  const selection = input.selection.map(item => { assertClosed(item, ['captureId', 'seq'], 'network event selection'); return { captureId: safeIdentifier(item.captureId), seq: whole(item.seq, 1, Number.MAX_SAFE_INTEGER, 'event_seq') }; });
  if (new Set(selection.map(item => item.captureId + ':' + item.seq)).size !== selection.length) reject('duplicate_export_selection');
  let bodyFields: string[] | undefined;
  if (input.bodyFields !== undefined) {
    if (!Array.isArray(input.bodyFields) || input.bodyFields.length < 1 || input.bodyFields.length > 64) reject('invalid_export_body_fields');
    bodyFields = input.bodyFields.map(value => short(value, 'body_field', 256));
    if (new Set(bodyFields).size !== bodyFields.length || bodyFields.some(field => !/^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*){0,15}$/.test(field) || field.split('.').some(key => unsafeKey(key) || sensitiveKey.test(key)))) reject('unsafe_export_body_field');
  }
  return { networkVersion: 1, query, selection, purpose, ...(bodyFields ? { bodyFields } : {}) };
}
function selectFields(event: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const { bodyPreview, ...rest } = event;
  if (!object(bodyPreview) || typeof bodyPreview.data !== 'string' || bodyPreview.encoding !== 'utf8') return { ...rest, bodySelection: { state: 'body_unavailable', fields, reason: 'The query did not supply a UTF-8 body; no original body was exported.' } };
  const bodyWindow = { offset: bodyPreview.offset, hasMore: bodyPreview.hasMore, totalLength: bodyPreview.totalLength, unit: bodyPreview.unit };
  if (bodyPreview.offset !== 0 || bodyPreview.hasMore !== false || bodyPreview.totalLength !== bodyPreview.data.length || bodyPreview.unit !== 'javascript_string_code_units') {
    return { ...rest, bodySelection: { state: 'partial_window', fields, reason: 'JSON root field selection requires the complete retained body window; partial content was omitted.' }, bodyWindow };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(bodyPreview.data); } catch { return { ...rest, bodySelection: { state: 'not_json', fields, reason: 'The supplied body window is not a complete JSON value; the body was omitted.' }, bodyWindow }; }
  const selected: Record<string, unknown> = {}, missing: string[] = [];
  for (const field of fields) {
    let value: unknown = parsed;
    for (const key of field.split('.')) { value = object(value) && Object.hasOwn(value, key) ? value[key] : undefined; }
    if (value === undefined) missing.push(field);
    else {
      if (value !== null && typeof value === 'object') reject('export_body_field_must_be_scalar_select_explicit_leaf_fields');
      selected[field] = value;
    }
  }
  return { ...rest, bodyPreview: { ...bodyPreview, data: JSON.stringify(selected), fieldSelected: true }, bodySelection: { state: 'selected_fields', fields, missing } };
}
export async function exportNetworkEvidence({ runDir, request, outputFile }: { runDir: unknown; request: unknown; outputFile: string }) {
  const parsed = parseEvidenceExport(request), { root, runId } = await networkRoot(runDir);
  const filename = await safePath(outputFile, { external: true });
  if (inside(path.join(root, 'captures'), filename)) reject('export_cannot_modify_capture');
  await safePath(path.dirname(filename), { existing: true });
  const result = await queryNetwork({ runDir, request: parsed.query });
  const selected = parsed.selection.map(item => {
    const event = result.events.find(event => event.captureId === item.captureId && event.seq === item.seq);
    if (!event) reject('selected_event_not_in_query_page_use_matching_cursor_or_filter');
    return parsed.bodyFields ? selectFields(event, parsed.bodyFields) : event;
  });
  const content = {
    networkVersion: 1, kind: 'network-evidence-export', runId, purpose: parsed.purpose,
    source: { query: parsed.query, querySha256: canonicalHash(parsed.query), resultSha256: hash(json(result)), selection: parsed.selection, snapshots: result.snapshots, coverage: result.coverage, scan: result.scan, hasMore: result.hasMore, cursor: result.cursor },
    ...(parsed.bodyFields ? { bodyFields: parsed.bodyFields } : {}), events: selected,
    contentState: selected.some(event => object(event.bodySelection) && event.bodySelection.state === 'selected_fields') ? 'selected_fields' : 'summary',
    caveat: 'Selected committed local observations only. Body windows, source policy, gaps and output omissions remain material limitations. No business request was sent and no business verdict was inferred.'
  };
  const serialized = json(content); await writeNew(filename, serialized);
  return { networkVersion: 1, path: filename, bytes: Buffer.byteLength(serialized), sha256: hash(serialized), selectedEvents: selected.length, hasMore: result.hasMore, immutable: true,
    registration: { sourceFile: filename, kind: 'tool_receipt', source: 'Selected committed local network observations', description: parsed.purpose,
      metadata: { mediaType: 'application/json', encoding: 'utf8', contentState: content.contentState, redaction: parsed.bodyFields ? 'Explicit field selection applied after source capture policy.' : 'Retained source policy and bounded body windows; no additional complete-body claim.', limitations: [content.caveat] } } };
}
