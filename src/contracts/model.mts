/** Portable data types. Schemas own external structure; runtime validators enforce semantics. */
import type { EgoLiteCaseInputAndNormalizedBaselineV3, Case, Basis, Step } from './generated/cases.mjs';
import type { EgoLiteRecordedResultsV3, ResultV3, AttemptV3, ResultOperationV3 } from './generated/results.mjs';
import type { EgoLiteEvidenceCatalogV3, EvidenceItemV3, EvidenceOperationV3 } from './generated/evidence.mjs';
import type { ResultOrAttemptRequestV3 } from './generated/record-request.mjs';
import type { EvidenceRegistrationRequestV3 } from './generated/evidence-request.mjs';
import type { EgoLiteRunManifestV3 } from './generated/manifest.mjs';
import type { EgoLiteGeneratedReportV3 } from './generated/report.mjs';
import type { RetrospectiveReportContextV1NoBusinessExecution } from './generated/report-context.mjs';
export type Baseline = EgoLiteCaseInputAndNormalizedBaselineV3;
export type { Case, Basis, Step };
export type Results = EgoLiteRecordedResultsV3;
export type ResultRecord = ResultV3;
export type Attempt = AttemptV3;
export type ResultOperation = ResultOperationV3;
export type EvidenceCatalog = EgoLiteEvidenceCatalogV3;
export type EvidenceItem = EvidenceItemV3;
export type EvidenceOperation = EvidenceOperationV3;
export type RecordRequest = ResultOrAttemptRequestV3;
export type RecordPayload = RecordRequest['record'];
export type Status = RecordPayload['status'];
export type Cause = NonNullable<RecordPayload['cause']>;
export type EvidenceKind = EvidenceItem['kind'];
export type EvidenceRequest = EvidenceRegistrationRequestV3;
export type Manifest = EgoLiteRunManifestV3;
export type ReportContext = RetrospectiveReportContextV1NoBusinessExecution;
export type CheckedCase = Case & ResultRecord & { cause: Cause };
export type Report = Omit<EgoLiteGeneratedReportV3, 'cases' | 'evidenceCoverage'> & {
  cases: CheckedCase[];
  evidenceCoverage: NonNullable<EgoLiteGeneratedReportV3['evidenceCoverage']>;
};
export interface FileIdentity { dev: number; ino: number }
export interface TestHooks { afterCommit?: () => Promise<void>; afterCopy?: () => Promise<void>; beforeCatalogCommit?: () => Promise<void> }
export interface PendingEvidence {
  schemaVersion: 1; operationId: string; payloadSha256: string; evidenceId: string;
  stagePath: string; finalPath: string; catalogTempPath: string; markerTempPath: string;
  sha256?: string; bytes?: number;
}
export interface Preview { preview: string | null; previewNote: string }
export interface HtmlPayload { htmlPayloadVersion: 1; report: Report; previews: Record<string, Preview> }
export type EvidenceReceipt = Pick<EvidenceOperation, 'operationId' | 'revision' | 'caseId' | 'evidenceId' | 'path' | 'sha256' | 'bytes'> & { collectedAt: string; replayed: boolean };
export type ResultReceipt = Pick<ResultOperation, 'operationId' | 'revision' | 'caseId' | 'mode' | 'status' | 'attemptId' | 'noOp'> & { replayed: boolean };
