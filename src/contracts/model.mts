import type {RetainedReportHistoryV1} from './generated/report-history.mjs';
import type { ConversationEvidenceV1 } from './generated/conversation.mjs';
export type ConversationArtifact = ConversationEvidenceV1;
export type ConversationMessage = ConversationArtifact['messages'][number];
export type ConversationSourceRef = ConversationMessage['sourceRefs'][number];
export type ConversationSourceBinding = NonNullable<EvidenceMetadata['conversationSources']>[number];
export interface ConversationSourceView { sourceId: string; label: string; sha256: string; evidenceId?: string; text?: string; truncated?: boolean; mediaType?: string; attachmentPath?:string }
export interface ConversationView { id: string; artifact: ConversationArtifact; sources: ConversationSourceView[]; caseId: string; goalId?: string; evidenceId?: string; retrospective: boolean; limitations: string[]; actions: { observationId: string; actionId: string; messageIds: string[] }[]; artifactSource?:{label:string;sha256:string;attachmentPath?:string} }
/** External schemas define structure; runtime checks validate references and evidence semantics. */
import type { EgoLiteCaseInputAndNormalizedBaselineV9, Case, Basis, Step, Goal, SourceReference, ParameterDefinition } from './generated/cases.mjs';
import type { CaseReviewV9, CasesReference } from './generated/case-review.mjs';
import type { EgoLiteRecordedResultsV9, ResultEntry, RecordPayload, Observation, Assessment, Diagnosis, ActionEvent, FactSource, ExecutionContext, ContextFact, ActionFact, EvidenceLink, Phenomenon, GapDetail, ReproductionPreparation, Finding } from './generated/results.mjs';
import type { EgoLiteEvidenceCatalogV9, EvidenceItem, EvidenceOperation, EvidenceMetadata } from './generated/evidence.mjs';
import type { ResultOrAttemptRequestV9 } from './generated/record-request.mjs';
import type { EvidenceRegistrationRequestV9 } from './generated/evidence-request.mjs';
import type { EgoLiteRunManifestV9 } from './generated/manifest.mjs';
import type { RetrospectiveReportContextV9NoBusinessExecution } from './generated/report-context.mjs';
import type { ExecutionLedger, ExecutionSummary } from './execution-model.mjs';
export type Baseline = EgoLiteCaseInputAndNormalizedBaselineV9;
export type AiContext = NonNullable<Baseline['aiContext']>;
export type SourceRef = SourceReference;
export type CaseReview = CaseReviewV9;
export type CasesRef = CasesReference;
export type { ParameterDefinition };
export type { Case, Basis, Step, Goal, ResultEntry, RecordPayload, Observation, Assessment, Diagnosis };
export type RunContext = ExecutionContext;
export type { ActionEvent, FactSource };
export interface ActionAttemptProjection { actionId: string; label: string; detail: string; purpose: ActionEvent['purpose']; eventIds: string[]; issuedEventIds: string[]; dispositionEventIds: string[]; unresolved: boolean; reasons: string[] }
export type { ExecutionContext, ContextFact, ActionFact, EvidenceLink, Phenomenon, GapDetail, ReproductionPreparation, Finding, EvidenceMetadata };
export type Results = EgoLiteRecordedResultsV9;
export type EvidenceCatalog = EgoLiteEvidenceCatalogV9;
export type { EvidenceItem, EvidenceOperation };
export type RecordRequest = ResultOrAttemptRequestV9;
export type Status = Assessment['status'];
export type EvidenceKind = EvidenceItem['kind'];
export type EvidenceRequest = EvidenceRegistrationRequestV9;
export type Manifest = EgoLiteRunManifestV9;
export type ReportContext = RetrospectiveReportContextV9NoBusinessExecution;
export type ReaderNote = NonNullable<ReportContext['readerNotes']>[number];
export type CommittedAssessment = Assessment & Pick<ResultEntry, 'operationId' | 'revision' | 'recordedAt'>;
export type CheckedCase = Case & { assessments: CommittedAssessment[]; observations: Observation[]; contexts: ExecutionContext[]; findings: Finding[]; actionEvents: ActionEvent[]; entries: ResultEntry[]; missingGoalIds: string[] };
export interface Counts { verified: number; violation: number; inconclusive: number; not_tested: number; unassessed: number }
export type ReportHistory=RetainedReportHistoryV1;
export type HistoryRunRef=ReportHistory['roots'][number];
export type HistoryPoint=ReportHistory['nodes'][number]['points'][number];
export interface Report {
  schemaVersion: 9; runId: string; project: string; structurallyValid: true;
  aiContext?: AiContext; presentation?: import('../report/ui-text.mjs').Presentation;
  revision: number; evidenceRevision: number; caseCount: number; goalCount: number;
  sourceCaseCount?:number;sourceGoalCount?:number;projectId?:string;caseVersion?:number;history?:ReportHistory;
  counts: Counts; assessmentComplete: boolean; cases: CheckedCase[]; evidenceCatalog: EvidenceCatalog;
  conversationEvidence?: Record<string, ConversationArtifact>;
  evidenceIntegrity: { hashVerifiedItems: number; missingScreenshotIds?: string[] };
  evidenceCoverage: { registeredScreenshots: number; distinctRetainedContents: number; goalsWithoutScreenshots: { caseId: string; goalId: string }[] };
  execution?: ExecutionLedger; executionSummary?: ExecutionSummary; context?: ReportContext; regressionBinding?: unknown; actionAttempts?: (ActionAttemptProjection & { caseId: string })[]; caveat: string;
}
export interface FileIdentity { dev: number; ino: number }
export interface TestHooks { afterCommit?: () => Promise<void>; afterCopy?: () => Promise<void>; beforeCatalogCommit?: () => Promise<void> }
export interface PendingEvidence {
  schemaVersion: 9; operationId: string; payloadSha256: string; evidenceId: string;
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
  htmlPayloadVersion: 9; report: Report; previews: Record<string, Preview>;
  assets: Record<string, ReportAsset>; delivery: ReportDelivery;
  conversations?: Record<string, ConversationView>;
  conversationFiles?:Record<string,{sha256:string;bytes:number;attachmentPath:string}>;
}
export type EvidenceReceipt = Pick<EvidenceOperation, 'operationId' | 'revision' | 'caseId' | 'evidenceId' | 'path' | 'sha256' | 'bytes'> & { collectedAt: string; replayed: boolean };
export type ResultReceipt = Pick<ResultEntry, 'operationId' | 'revision' | 'caseId' | 'mode'> & { replayed: boolean };
