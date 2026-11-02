/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface FileInspectionRequestV9 {
  schemaVersion: 9;
  file: string;
  format?: 'auto' | 'bytes' | 'text' | 'json' | 'csv' | 'xlsx';
  maxBytes?: number;
  maxOutputBytes?: number;
  maxCells?: number;
  timeoutMs?: number;
  offset?: number;
  rowStart?: number;
  rowLimit?: number;
  sheet?: string | null;
  jsonPath?: string[];
  delimiter?: string;
  compareFile?: string | null;
}
