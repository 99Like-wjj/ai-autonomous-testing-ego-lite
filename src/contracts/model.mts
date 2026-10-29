/** External schemas define structure; runtime checks validate references and evidence semantics. */
import type { EgoLiteCaseInputAndNormalizedBaselineV5, Case, Basis, Step, Goal } from './generated/cases.mjs';
import type { EgoLiteRecordedResultsV5, ResultEntry, RecordPayload, Observation, Assessment, Diagnosis } from './generated/results.mjs';
import type { EgoLiteEvidenceCatalogV5, EvidenceItem, EvidenceOperation } from './generated/evidence.mjs';
import type { ResultOrAttemptRequestV5 } from './generated/record-request.mjs';
import type { EvidenceRegistrationRequestV5 } from './generated/evidence-request.mjs';
import type { EgoLiteRunManifestV5 } from './generated/manifest.mjs';
import type { RetrospectiveReportContextV5NoBusinessExecution } from './generated/report-context.mjs';
import type { ExecutionLedger, ExecutionSummary } from './execution-model.mjs';
export type Baseline = EgoLiteCaseInputAndNormalizedBaselineV5;
export type { Case, Basis, Step, Goal, ResultEntry, RecordPayload, Observation, Assessment, Diagnosis };
export type Results = EgoLiteRecordedResultsV5;
export type EvidenceCatalog = EgoLiteEvidenceCatalogV5;
export type { EvidenceItem, EvidenceOperation };
export type RecordRequest = ResultOrAttemptRequestV5;
export type Status = Assessment['status'];
export type EvidenceKind = EvidenceItem['kind'];
export type EvidenceRequest = EvidenceRegistrationRequestV5;
export type Manifest = EgoLiteRunManifestV5;
export type ReportContext = RetrospectiveReportContextV5NoBusinessExecution;
export type CommittedAssessment = Assessment & Pick<ResultEntry, 'operationId' | 'revision' | 'recordedAt'>;
export type CheckedCase = Case & { assessments: CommittedAssessment[]; observations: Observation[]; entries: ResultEntry[]; missingGoalIds: string[] };
export interface Counts { verified: number; violation: number; inconclusive: number; not_tested: number; unassessed: number }
export interface Report {
  schemaVersion: 5; runId: string; project: string; structurallyValid: true;
  revision: number; evidenceRevision: number; caseCount: number; goalCount: number;
  counts: Counts; assessmentComplete: boolean; cases: CheckedCase[]; evidenceCatalog: EvidenceCatalog;
  evidenceIntegrity: { hashVerifiedItems: number };
  evidenceCoverage: { registeredScreenshots: number; distinctRetainedContents: number; goalsWithoutScreenshots: { caseId: string; goalId: string }[] };
  execution?: ExecutionLedger; executionSummary?: ExecutionSummary; context?: ReportContext; caveat: string;
}
export interface FileIdentity { dev: number; ino: number }
export interface TestHooks { afterCommit?: () => Promise<void>; afterCopy?: () => Promise<void>; beforeCatalogCommit?: () => Promise<void> }
export interface PendingEvidence {
  schemaVersion: 5; operationId: string; payloadSha256: string; evidenceId: string;
  stagePath: string; finalPath: string; catalogTempPath: string; markerTempPath: string;
  sha256?: string; bytes?: number;
}
export interface Preview { preview: string | null; previewNote: string }
export interface HtmlPayload { htmlPayloadVersion: 5; report: Report; previews: Record<string, Preview> }
export type EvidenceReceipt = Pick<EvidenceOperation, 'operationId' | 'revision' | 'caseId' | 'evidenceId' | 'path' | 'sha256' | 'bytes'> & { collectedAt: string; replayed: boolean };
export type ResultReceipt = Pick<ResultEntry, 'operationId' | 'revision' | 'caseId' | 'mode'> & { replayed: boolean };
