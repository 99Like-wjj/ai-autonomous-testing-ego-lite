/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface RetrospectiveReportContextV8NoBusinessExecution {
  schemaVersion: 8;
  kind: 'retrospective';
  summary: string;
  /**
   * @minItems 1
   */
  limitations: string[];
  /**
   * @minItems 1
   */
  sources: {
    label: string;
    file: string;
    sha256: string;
  }[];
  supplementalCaseIds: string[];
}
