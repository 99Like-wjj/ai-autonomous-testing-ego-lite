/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type SourceReference = {
  id: string;
  locator: string;
  file: string | null;
  sha256: string | null;
  excerpt: string;
  limitations: string[];
};

export interface RunBindingRequestV2 {
  regressionVersion: 2;
  selection: Selection;
  reviewFiles: string[];
  plans: {
    caseId: string;
    pointIds: string[];
    conditionIds?: string[];
    stepIds?: string[];
    includeRequiredPath?: boolean;
  }[];
  deferred: {
    pointId: string;
    reason: string;
  }[];
  parameterBindings: {
    caseId: string;
    parameterId: string;
    value:
      | string
      | number
      | {
          id: string;
          label: string | null;
        };
    source: SourceReference;
  }[];
  currentConditions: {
    declaredBy: string;
    declaredAt: string;
    forCurrentRun: true;
    items: {
      id: string;
      caseIds: string[];
      aspect: 'identity' | 'environment' | 'data' | 'authorization' | 'path' | 'other';
      state: 'verified' | 'pending' | 'deferred';
      statement: string;
      source: {
        kind: 'ai_declaration' | 'current_user_statement' | 'current_evidence';
        locator: string;
        file: string | null;
        sha256: string | null;
      };
    }[];
  };
  history: {
    parents: {
      runDir: string;
      runId: string;
      baselineSha256: string;
      resultsRevision: number;
      resultsSha256: string;
    }[];
    primaryBaseline: {
      runDir: string;
      runId: string;
      baselineSha256: string;
      resultsRevision: number;
      resultsSha256: string;
    } | null;
    reason: string;
  };
}
export interface Selection {
  regressionVersion: 2;
  request: Request;
  selectedPointIds: string[];
  matchedPointIds: string[];
  notSelectedPointIds: string[];
  sourceStates: {
    pointId: string;
    status: ('verified' | 'violation' | 'inconclusive' | 'not_tested') | null;
    inSourceScope: boolean;
  }[];
  candidatePlans: {
    caseId: string;
    pointIds: string[];
    conditionIds: string[];
    stepIds: string[];
    includeRequiredPath: boolean;
  }[];
  gaps: {
    pointId: string | null;
    sourceInventoryId: string | null;
    code: string;
    reason: string;
  }[];
  selectionSha256: string;
}
export interface Request {
  regressionVersion: 2;
  casesFile: string;
  cases: CasesReference;
  mode: 'points' | 'status' | 'full';
  pointIds: string[];
  sourceRun: {
    runDir: string;
    runId: string;
    baselineSha256: string;
    resultsRevision: number;
    resultsSha256: string;
  } | null;
  statuses: ('verified' | 'violation' | 'inconclusive' | 'not_tested')[];
  includeUnassessedCases: boolean;
}
export interface CasesReference {
  projectId: string;
  caseVersion: number;
  sha256: string;
}
