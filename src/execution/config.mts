import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConfigurationSnapshot } from '../contracts/execution-model.mjs';
import { assertClosed, errorInfo, hash, safePath } from '../core/common.mjs';
import { integer } from '../core/validation.mjs';

export function parallelLimit(value: unknown): number { return integer(value, 'maxParallelCases (positive safe integer)', 1); }
export function cliParallelLimit(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error('max-parallel-cases must be a positive integer.');
  return parallelLimit(Number(value));
}
export async function resolveConfiguration({ projectDir, configFile, maxParallelCases }: { projectDir: string; configFile?: string | undefined; maxParallelCases?: number | undefined }): Promise<ConfigurationSnapshot> {
  let configuration = { schemaVersion: 5 as const, maxParallelCases: 1 };
  let kind: ConfigurationSnapshot['kind'] = 'default';
  let file: string | undefined, sha256: string | undefined;
  const candidate = configFile ?? path.join(projectDir, 'execution-config.json');
  try {
    file = await safePath(candidate, { existing: true });
    if (!(await fs.lstat(file)).isFile()) throw new Error('Execution configuration must be a regular file.');
    const bytes = await fs.readFile(file); const value: unknown = JSON.parse(bytes.toString('utf8'));
    assertClosed(value, ['schemaVersion', 'maxParallelCases'], 'execution configuration');
    if (value.schemaVersion !== 5) throw new Error('Execution configuration requires schemaVersion 5.');
    configuration = { schemaVersion: 5, maxParallelCases: parallelLimit(value.maxParallelCases) };
    sha256 = hash(bytes); kind = configFile === undefined ? 'project' : 'file';
  } catch (caught) { const error = errorInfo(caught); if (configFile !== undefined || error.code !== 'ENOENT') throw error; file = undefined; }
  const limit = maxParallelCases === undefined ? configuration.maxParallelCases : parallelLimit(maxParallelCases);
  return { kind: maxParallelCases === undefined ? kind : 'override', initialMaxParallelCases: limit, requestedMaxParallelCases: limit, configuration,
    ...(file === undefined ? {} : { configFile: file }), ...(sha256 === undefined ? {} : { configSha256: sha256 }) };
}
