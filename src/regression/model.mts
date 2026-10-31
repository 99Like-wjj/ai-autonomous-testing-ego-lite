/** Regression assets describe AI-authored intent. They are never current authorization or business verdicts. */
import type { Baseline, Case, Manifest, Report, Results } from '../contracts/model.mjs';

export interface RuleRef { ruleId: string; revision: number; contentSha256: string }
export interface TaskRef { taskId: string; revision: number; contentSha256: string }
export interface RuleSource {
  kind: 'requirement' | 'user_confirmation' | 'approved_specification';
  contentFile: string; locator: string; excerpt: string; version: string | null; contentSha256: string;
}
export interface RuleDraft {
  kind: 'rule'; ruleId: string; statement: string; scope: string[]; source: RuleSource;
  confirmation: { state: 'explicit' | 'confirmed' | 'pending' | 'conflict'; basis: string[] };
  supersedes: RuleRef | null; reason: string;
}
/** resultsSha256 hashes the canonical results prefix through resultsRevision, not a mutable current file. */
export interface SourceRef {
  id: string; runDir: string; runId: string; baselineSha256: string;
  resultsRevision: number; resultsSha256: string; caseId: string; goalId: string;
  observationIds: string[]; actionIds: string[];
  evidence: { evidenceId: string; sha256: string }[];
}
export interface TaskDraft {
  kind: 'task'; taskId: string; title: string;
  maturity: 'candidate' | 'incomplete' | 'defined';
  review: { author: string; basis: string; gaps: string[] };
  applicability: { state: 'applicable' | 'uncertain' | 'inapplicable'; conditions: string[]; reason: string; replacedBy: TaskRef | null };
  casePlan: Case | null;
  ruleBindings: { goalId: string; ruleRefs: RuleRef[] }[];
  sourceRefs: SourceRef[];
  goalMappings: { sourceRefId: string; taskGoalId: string | null; reason: string }[];
  pathKnowledge: { planRef: string; state: 'observed' | 'required_unreached' | 'unknown'; sourceRefIds: string[]; detail: string; gaps: string[] }[];
  dataConstraints: { requiredRelationships: string[]; allowedSubstitutions: string[]; equivalenceRequirements: string[] };
  risks: { unresolvedSideEffects: string[]; idempotencyBasis: string[]; authorizationToRecheck: string[] };
  auxiliaryActions: { purpose: 'preparation' | 'exploration' | 'recovery' | 'cleanup'; intent: string; conditions: string[]; limits: string[] }[];
  supersedes: TaskRef | null; reason: string;
}
export type ArtifactDraft = RuleDraft | TaskDraft;
export interface ArtifactCommitRequest { regressionVersion: 1; operationId: string; expectedRevision: number; artifact: ArtifactDraft }
export interface CommitMetadata {
  regressionVersion: 1; revision: number; operationId: string; expectedRevision: number;
  payloadSha256: string; contentSha256: string; recordedAt: string; timeSource: 'local_transaction_clock';
}
export type StoredRule = RuleDraft & CommitMetadata;
export type StoredTask = TaskDraft & CommitMetadata;
export type StoredArtifact = StoredRule | StoredTask;
export interface ArtifactReceipt {
  regressionVersion: 1; kind: 'rule' | 'task'; artifactId: string; revision: number;
  operationId: string; contentSha256: string; recordedAt: string; replayed: boolean;
}
export interface RegressionLibrary { regressionVersion: 1; projectDir: string; rules: StoredRule[]; tasks: StoredTask[] }
export interface SourceRun {
  runDir: string; manifest: Manifest; baseline: Baseline; results: Results; checked: Report;
  baselineSha256: string; resultsSha256: string;
  evidenceScope: { kind: 'complete_current_catalog' | 'results_prefix_references'; catalogRevision: number; note: string };
}
export interface SourceTaskLink extends TaskRef {
  sourceRefId: string; sourceResultsRevision: number; sourceResultsSha256: string;
  relation: 'exact' | 'earlier';
}
export interface SourceContext {
  regressionVersion: 1; source: SourceRun;
  rules: StoredRule[];
  facts: { caseId: string; goalId: string; assessment: Report['cases'][number]['assessments'][number] | null;
    taskRefs: SourceTaskLink[]; gap: string | null }[];
  caveat: string;
}
