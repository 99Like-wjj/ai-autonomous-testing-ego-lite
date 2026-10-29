/** Bounded projections with explicit inspection scope. No file I/O, storage or scheduling. */
import type { ExecutionLedger, ExecutionSummary, ExecutionReadView, Assignment } from '../contracts/execution-model.mjs';
import { fail } from '../core/common.mjs';

export type ReadView = 'summary' | 'assignment' | 'full';
export type ReadIntegrity = 'metadata' | 'full';
export function readOptions(view = 'summary', assignmentId?: string, integrity?: string): { view: ReadView; assignmentId?: string; integrity: ReadIntegrity } {
  if (!['summary', 'assignment', 'full'].includes(view)) fail('Unknown execution read view. Use summary, assignment or full.');
  if ((view === 'assignment') !== (assignmentId !== undefined)) fail('Only the assignment view requires --assignment-id.');
  const scope = integrity ?? (view === 'full' ? 'full' : 'metadata');
  if (scope !== 'metadata' && scope !== 'full') fail('Unknown integrity scope. Use metadata or full.');
  if (view === 'full' && scope !== 'full') fail('The full view requires full integrity checks.');
  return { view: view as ReadView, integrity: scope, ...(assignmentId === undefined ? {} : { assignmentId }) };
}
function page<T, R>(items: readonly T[], limit: number, project: (item: T) => R, latest = false) { return { total: items.length, truncated: items.length > limit, items: (latest ? items.slice(-limit).reverse() : items.slice(0, limit)).map(project) }; }
function preview(text: string) { const prefix = Array.from(text.slice(0, 512)).slice(0, 256).join(''); return { text: prefix, truncated: prefix.length < text.length }; }
function mini(a: Assignment) { return { id: a.id, caseId: a.caseId, state: a.state, workerDirectory: a.workerDirectory, workerId: a.workerId ?? null, model: a.model ?? null, reasoning: a.reasoning ?? null, defaultSpaceId: a.defaultSpaceId, updatedAt: a.updatedAt }; }
export function projectExecutionRead(state: ExecutionLedger & { project: string; summary: ExecutionSummary }, options: { view: 'summary' | 'assignment'; assignmentId?: string; integrity: ReadIntegrity; evidenceMarker: 'present' | 'absent' }): ExecutionReadView {
  const selected = options.view === 'assignment' ? state.assignments.find(a => a.id === options.assignmentId) : undefined;
  if (options.view === 'assignment' && !selected) fail('Unknown assignment for execution read.');
  const assignments = selected ? [selected] : state.assignments.filter(a => !['completed', 'stopped', 'failed'].includes(a.state));
  const imports = state.imports.filter(imp => selected ? imp.assignmentId === selected.id : !['complete', 'superseded'].includes(imp.phase));
  const notes = state.events.filter(event => event.kind.startsWith('note:') && (!selected || event.assignmentId === selected.id));
  const noteCounts: Record<string, number> = {};
  for (const note of notes) noteCounts[note.kind] = (noteCounts[note.kind] ?? 0) + 1;
  const integrity: ExecutionReadView['integrity'] = options.integrity === 'full'
    ? { scope: 'full', baselineHash: 'matched', executionLedger: 'validated', recordedResults: 'checked', evidenceFiles: 'verified' }
    : { scope: 'metadata', baselineHash: 'matched', executionLedger: 'validated', recordedResults: 'not_checked', evidenceFiles: 'not_checked' };
  return {
    viewVersion: 6, view: options.view, runId: state.runId, baselineSha256: state.baselineSha256, revision: state.revision, project: state.project,
    configuration: state.configuration, knownAvailableWorkers: state.knownAvailableWorkers, capacityReason: preview(state.capacityReason), integrity,
    recovery: { evidenceMarker: options.evidenceMarker, pendingImports: state.summary.pendingImportIds.length },
    counts: { activeReservations: state.summary.activeReservations, peakReservations: state.peakReservations, reportedExecutionPeak: state.summary.reportedExecutionPeak, draining: state.summary.draining, totalAssignments: state.assignments.length, unfinishedAssignments: state.summary.unfinishedAssignmentIds.length, failedAssignments: state.assignments.filter(a => a.state === 'failed').length, pendingImports: state.summary.pendingImportIds.length, operations: state.operations.length, events: state.events.length, protectedSpaces: state.protectedSpaceIds?.length ?? null },
    assignments: page(assignments, 20, mini), assignment: selected ?? null,
    imports: page(imports, 20, imp => ({ operationId: imp.operationId, assignmentId: imp.assignmentId, packetId: imp.packetId, packetFile: imp.packetFile, packetSha256: imp.packetSha256, phase: imp.phase, resultOperationId: imp.resultReceipt?.operationId ?? null })),
    noteCounts, notes: page(notes, 5, event => ({ operationId: event.operationId, kind: event.kind, assignmentId: event.assignmentId ?? null, at: event.at, reason: preview(event.reason) }), true),
    caveat: (options.integrity === 'metadata' ? 'Metadata snapshot only; result records, historical evidence files and physical references were not rechecked. Pending recovery is only reported, not performed. ' : 'Full file checks used the existing strict path. ') + 'Stored states, goal assessments and worker intervals are operator supplied, not fresh business verification. Counts are run-wide; lists are view-scoped. Truncated content remains in the full view.'
  };
}
