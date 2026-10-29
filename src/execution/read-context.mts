/** Metadata-only snapshot under the caller's lock. Never recovers or opens historical evidence. */
import path from 'node:path';
import { fail, readJSON } from '../core/common.mjs';
import { readAndValidateBaseline } from '../core/baseline.mjs';
import { existingRegularFile } from '../core/file-integrity.mjs';
import { parseManifest } from '../core/validation.mjs';
import { readExecution } from './ledger.mjs';

export async function readExecutionMetadataUnlocked(root: string) {
  const manifest = parseManifest(await readJSON(path.join(root, 'manifest.json')));
  if (manifest.schemaVersion !== 7) fail('Execution commands require a v7 run; older formats are not supported or migrated.');
  const { baseline } = await readAndValidateBaseline(root, manifest);
  const ledger = await readExecution(root, manifest, baseline);
  const evidenceMarker: 'present' | 'absent' = await existingRegularFile(path.join(root, '.evidence.pending.json')) ? 'present' : 'absent';
  return { ledger, baseline, evidenceMarker };
}
