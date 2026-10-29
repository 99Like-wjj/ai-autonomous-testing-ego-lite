import { retainReference } from '../core/file-integrity.mjs';
import type { Case } from '../contracts/model.mjs';
import type { Assignment, ExecutionLedger, FileReference, Receipt, Operation } from '../contracts/execution-model.mjs';
import { assignmentId, caseId } from '../contracts/ids.mjs';
import { canonicalHash, fail, now, withRunLock } from '../core/common.mjs';
import { checkUnlocked, recoverEvidence } from '../core/records.mjs';
import { parseRequest } from './parse.mjs';
import { activeCount, assignment, checkpoint, checkSlot, ensureWorkerDirectory, isActive, summarize } from './ledger.mjs';
import { importPacket } from './commit.mjs';
import type { ImportHooks } from './commit.mjs';
import { projectExecutionRead, readOptions } from './views.mjs';
import { readExecutionMetadataUnlocked } from './read-context.mjs';

async function context(root: string): Promise<{ ledger: ExecutionLedger; cases: Case[]; project: string }> {
  await recoverEvidence(root); const checked = await checkUnlocked(root);
  if (checked.schemaVersion !== 7 || !checked.execution) fail('Execution commands require a v7 run; older formats are not supported or migrated.');
  return { ledger: checked.execution, cases: checked.cases, project: checked.project };
}
export async function readExecutionView(runDir: unknown) {
  return withRunLock(runDir, async root => { const { ledger, cases, project } = await context(root); return { ...ledger, project, summary: summarize(ledger, { schemaVersion: 7, project, cases }) }; });
}
export async function readExecutionQuery(runDir: unknown, view = 'summary', assignmentId?: string, integrity?: string) {
  const options = readOptions(view, assignmentId, integrity);
  if (options.view === 'full') return readExecutionView(runDir);
  if (options.integrity === 'full') return projectExecutionRead(await readExecutionView(runDir), { ...options, view: options.view, evidenceMarker: 'absent' });
  const { ledger, baseline, evidenceMarker } = await withRunLock(runDir, readExecutionMetadataUnlocked);
  return projectExecutionRead({ ...ledger, project: baseline.project, summary: summarize(ledger, baseline) }, { ...options, view: options.view, evidenceMarker });
}
export async function executeRequest({ runDir, request: input }: { runDir: unknown; request: unknown }, hooks: ImportHooks = {}): Promise<Receipt & { replayed: boolean }> {
  const request = parseRequest(input), payloadSha256 = canonicalHash(input);
  return withRunLock(runDir, async root => {
    const { ledger, cases } = await context(root);
    const existing = ledger.operations.find(op => op.operationId === request.operationId);
    if (existing && existing.payloadSha256 !== payloadSha256) fail('Execution operation ID was already used with a different payload.');
    if (existing?.receipt) return { ...existing.receipt, replayed: true };
    if (!existing && request.expectedRevision !== ledger.revision) fail('Execution revision conflict: expected ' + request.expectedRevision + ', current ' + ledger.revision + '.');
    const operation: Operation = existing ?? { operationId: request.operationId, payloadSha256, request, startedAt: now() };
    if (request.kind === 'import') return { ...await importPacket(root, ledger, cases, request, operation, hooks), replayed: Boolean(existing) };
    if (existing) fail('Only incomplete packet imports can be resumed.');
    const evidenceFiles: FileReference[] = [];
    if ('evidenceFiles' in request) for (const name of request.evidenceFiles ?? []) evidenceFiles.push(await retainReference(root, name));
    const receipt: Receipt = { operationId: request.operationId, kind: request.kind, revision: ledger.revision + 1 };
    let a: Assignment | undefined;
    switch (request.kind) {
      case 'inventory':
        if (ledger.protectedSpaceIds !== null || ledger.assignments.length) fail('Initial protected Space inventory is immutable and must precede allocation.');
        ledger.protectedSpaceIds = request.spaceIds; break;
      case 'capacity': ledger.knownAvailableWorkers = request.availableWorkers; ledger.capacityReason = request.reason; receipt.availableWorkers = request.availableWorkers; break;
      case 'set-limit': ledger.configuration.requestedMaxParallelCases = request.maxParallelCases; receipt.maxParallelCases = request.maxParallelCases; break;
      case 'reserve': {
        if (ledger.protectedSpaceIds === null) fail('Record the initial protected Space inventory before reserving a case.');
        if (request.baselineSha256 !== ledger.baselineSha256 || !cases.some(c => c.id === caseId(request.caseId))) fail('Wrong frozen case or baseline hash.');
        const resources = request.resources ?? []; checkSlot(ledger, request.caseId, resources);
        const id = assignmentId('asg-' + canonicalHash({ runId: ledger.runId, operationId: request.operationId }).slice(0, 32));
        a = { id, caseId: request.caseId, attemptId: 'att-' + canonicalHash({ runId: ledger.runId, assignmentId: id }).slice(0, 32), state: 'reserved', workerDirectory: 'workers/' + id, resources, createdAt: now(), updatedAt: now(), defaultSpaceId: null, spaceHistory: [], ownedSpaces: [], ...(request.workerId === undefined ? {} : { workerId: request.workerId }), ...(request.model === undefined ? {} : { model: request.model }), ...(request.reasoning === undefined ? {} : { reasoning: request.reasoning }) };
        await ensureWorkerDirectory(root, a, request.operationId); ledger.assignments.push(a); ledger.peakReservations = Math.max(ledger.peakReservations, activeCount(ledger));
        receipt.assignmentId = a.id; receipt.caseId = a.caseId; receipt.workerDirectory = a.workerDirectory; receipt.state = a.state; break;
      }
      case 'attach-space': {
        a = assignment(ledger, assignmentId(request.assignmentId));
        if (ledger.protectedSpaceIds === null || ledger.protectedSpaceIds.includes(request.spaceId)) fail('Protected or unknown-inventory Space cannot be claimed.');
        if (ledger.assignments.some(other => other.id !== a?.id && other.ownedSpaces.some(space => space.spaceId === request.spaceId))) fail('Space already belongs to a different case assignment.');
        const reference = await retainReference(root, request.receiptFile);
        if (!reference.path.startsWith(a.workerDirectory + '/')) fail('Creation receipt belongs to a different assignment.');
        if (a.defaultSpaceId !== null && a.defaultSpaceId !== request.spaceId && !request.replaceDefault) fail('Changing the default Space requires an explicit recovery reason and replaceDefault.');
        const known = a.ownedSpaces.find(space => space.spaceId === request.spaceId);
        if (known && (known.name !== request.name || known.receipt.sha256 !== reference.sha256 || known.closedAt)) fail('Existing Space ownership receipt changed or Space was closed.');
        if (!known) a.ownedSpaces.push({ spaceId: request.spaceId, name: request.name, createdAt: now(), receipt: reference });
        a.spaceHistory.push({ spaceId: request.spaceId, kind: a.defaultSpaceId === null ? 'default' : 'recovery', at: now(), reason: request.reason }); a.defaultSpaceId = request.spaceId; a.updatedAt = now(); evidenceFiles.push(reference); receipt.assignmentId = a.id; break;
      }
      case 'reconcile': {
        a = assignment(ledger, assignmentId(request.assignmentId));
        if (isActive(request.state) !== request.inFlight) fail('Active/unknown execution retains its slot; terminal/paused states require an explicit no-in-flight observation.');
        if (isActive(request.state) && !isActive(a.state)) checkSlot(ledger, a.caseId, a.resources, a.id);
        a.state = request.state; a.updatedAt = now();
        if (request.workerId !== undefined) a.workerId = request.workerId;
        if (request.model !== undefined) a.model = request.model;
        if (request.reasoning !== undefined) a.reasoning = request.reasoning;
        ledger.peakReservations = Math.max(ledger.peakReservations, activeCount(ledger)); receipt.assignmentId = a.id; receipt.state = a.state; break;
      }
      case 'note': {
        if (request.assignmentId !== undefined) { a = assignment(ledger, assignmentId(request.assignmentId)); receipt.assignmentId = a.id; }
        if (request.category === 'space-deviation') {
          if (!a || !request.spaceIds?.length) fail('A Space deviation needs an assignment and actual IDs or an explicit unknown.');
          for (const id of request.spaceIds) a.spaceHistory.push({ spaceId: id, kind: 'deviation', at: now(), reason: request.reason });
        }
        if (request.category === 'cleanup') {
          if (!a || isActive(a.state) || !request.spaceIds?.length || !request.remainingSpaceIds || !evidenceFiles.length) fail('Cleanup readback needs an inactive owned assignment, precise IDs, remaining inventory, and evidence.');
          for (const id of request.spaceIds) {
            const owned = a.ownedSpaces.find(space => space.spaceId === id);
            if (id === null || !owned || ledger.protectedSpaceIds?.includes(id) || request.remainingSpaceIds.includes(id)) fail('Cleanup readback cannot claim an unknown/protected/still-present Space.');
            owned.closedAt = now(); a.spaceHistory.push({ spaceId: id, kind: 'cleaned', at: now(), reason: request.reason });
          }
        }
        if (a) a.updatedAt = now(); break;
      }
    }
    operation.receipt = receipt; ledger.operations.push(operation);
    await checkpoint(root, ledger, { operationId: request.operationId, kind: request.kind === 'note' ? 'note:' + request.category : request.kind, reason: request.reason, ...(a ? { assignmentId: a.id } : {}), ...(evidenceFiles.length ? { evidenceFiles } : {}) });
    return { ...receipt, replayed: false };
  });
}
