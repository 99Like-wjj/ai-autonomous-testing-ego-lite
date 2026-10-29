/** External schemas define structure; runtime checks validate references and evidence semantics. */
import type { EgoLiteCaseInputAndNormalizedBaselineV7, Case, Basis, Step, Goal } from './generated/cases.mjs';
import type { EgoLiteRecordedResultsV7, ResultEntry, RecordPayload, Observation, Assessment, Diagnosis, ExecutionContext, ContextFact, ActionFact, EvidenceLink, Phenomenon, GapDetail, ReproductionPreparation, Finding } from './generated/results.mjs';
import type { EgoLiteEvidenceCatalogV7, EvidenceItem, EvidenceOperation, EvidenceMetadata } from './generated/evidence.mjs';
import type { ResultOrAttemptRequestV7 } from './generated/record-request.mjs';
import type { EvidenceRegistrationRequestV7 } from './generated/evidence-request.mjs';
import type { EgoLiteRunManifestV7 } from './generated/manifest.mjs';
import type { RetrospectiveReportContextV7NoBusinessExecution } from './generated/report-context.mjs';
import type { ExecutionLedger, ExecutionSummary } from './execution-model.mjs';
export type Baseline = EgoLiteCaseInputAndNormalizedBaselineV7;
export type { Case, Basis, Step, Goal, ResultEntry, RecordPayload, Observation, Assessment, Diagnosis };
export type { ExecutionContext, ContextFact, ActionFact, EvidenceLink, Phenomenon, GapDetail, ReproductionPreparation, Finding, EvidenceMetadata };
export type Results = EgoLiteRecordedResultsV7;
export type EvidenceCatalog = EgoLiteEvidenceCatalogV7;
export type { EvidenceItem, EvidenceOperation };
export type RecordRequest = ResultOrAttemptRequestV7;
export type Status = Assessment['status'];
export type EvidenceKind = EvidenceItem['kind'];
export type EvidenceRequest = EvidenceRegistrationRequestV7;
export type Manifest = EgoLiteRunManifestV7;
export type ReportContext = RetrospectiveReportContextV7NoBusinessExecution;
export type CommittedAssessment = Assessment & Pick<ResultEntry, 'operationId' | 'revision' | 'recordedAt'>;
export type CheckedCase = Case & { assessments: CommittedAssessment[]; observations: Observation[]; contexts: ExecutionContext[]; findings: Finding[]; entries: ResultEntry[]; missingGoalIds: string[] };
export interface Counts { verified: number; violation: number; inconclusive: number; not_tested: number; unassessed: number }
export interface Report {
  schemaVersion: 7; runId: string; project: string; structurallyValid: true;
  revision: number; evidenceRevision: number; caseCount: number; goalCount: number;
  counts: Counts; assessmentComplete: boolean; cases: CheckedCase[]; evidenceCatalog: EvidenceCatalog;
  evidenceIntegrity: { hashVerifiedItems: number; missingScreenshotIds?: string[] };
  evidenceCoverage: { registeredScreenshots: number; distinctRetainedContents: number; goalsWithoutScreenshots: { caseId: string; goalId: string }[] };
  execution?: ExecutionLedger; executionSummary?: ExecutionSummary; context?: ReportContext; caveat: string;
}
export interface FileIdentity { dev: number; ino: number }
export interface TestHooks { afterCommit?: () => Promise<void>; afterCopy?: () => Promise<void>; beforeCatalogCommit?: () => Promise<void> }
export interface PendingEvidence {
  schemaVersion: 7; operationId: string; payloadSha256: string; evidenceId: string;
  stagePath: string; finalPath: string; catalogTempPath: string; markerTempPath: string;
  sha256?: string; bytes?: number;
}
export type EvidenceContentState = 'full' | 'selected_fields' | 'summary' | 'truncated' | 'excluded' | 'failed' | 'unknown' | 'missing' | 'unsupported';
export interface Preview {
  preview: null; previewNote: string; contentState: EvidenceContentState;
  assetId?: string; mediaType?: string; width?: number; height?: number; attachmentPath?: string;
}
export interface ReportAsset {
  kind: 'image' | 'text'; mediaType: string; bytes: number; retainedBytes: number; truncated: boolean;
  data?: string; text?: string;
}
export interface ReportDelivery {
  mode: 'inline' | 'bundle'; textPreviewLimitBytes: number; complete: boolean; allowMissingScreenshots: boolean;
}
export interface HtmlPayload {
  htmlPayloadVersion: 7; report: Report; previews: Record<string, Preview>;
  assets: Record<string, ReportAsset>; delivery: ReportDelivery;
}
export type EvidenceReceipt = Pick<EvidenceOperation, 'operationId' | 'revision' | 'caseId' | 'evidenceId' | 'path' | 'sha256' | 'bytes'> & { collectedAt: string; replayed: boolean };
export type ResultReceipt = Pick<ResultEntry, 'operationId' | 'revision' | 'caseId' | 'mode'> & { replayed: boolean };
