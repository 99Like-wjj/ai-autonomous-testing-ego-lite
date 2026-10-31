/** Verify the run-owned frozen copy; never repair or re-read mutable external assets. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Baseline, Manifest } from '../contracts/model.mjs';
import { fail, hash } from '../core/common.mjs';
import { regularFilePath } from '../core/file-integrity.mjs';
import { validateBinding } from './binding.mjs';
export async function readRunBinding(root: string, manifest: Manifest, baseline: Baseline) {
  if (manifest.regressionBindingFile === undefined) return undefined;
  const bytes = await fs.readFile(await regularFilePath(path.join(root, manifest.regressionBindingFile)));
  if (hash(bytes) !== manifest.regressionBindingSha256) fail('Frozen regression binding file hash mismatch.');
  return validateBinding(JSON.parse(bytes.toString('utf8')), baseline, manifest.runId);
}
