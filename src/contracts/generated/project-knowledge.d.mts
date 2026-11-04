/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export type ProjectKnowledgeV3 = Header | Configuration | Map | Topic | Source;
export type Id = string;
export type Text = string;
/**
 * @maxItems 2000
 */
export type Strings = string[];
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export type Meta = {
  state: 'confirmed' | 'observed' | 'pending';
  lifecycle: 'active' | 'superseded' | 'retired';
  /**
   * @maxItems 2000
   */
  sourceRefs: SourceRef[];
  updatedAt: string;
  changeReason: string;
  /**
   * @maxItems 2000
   */
  limitations: string[];
};
/**
 * @maxItems 2000
 */
export type Ids = Id[];
export type Check = {
  id: Id;
  targetId: Id;
  actorNote: string | null;
  outcome: 'verified' | 'violation' | 'inconclusive' | 'not_tested';
  coverage: string;
  observedAt: string | null;
  description: string;
  /**
   * @maxItems 2000
   */
  sourceRefs: SourceRef[];
  /**
   * @maxItems 2000
   */
  limitations: string[];
};

export interface Header {
  knowledgeFormatVersion: 3;
  knowledgeId: Id;
  projectId: Id;
  projectName: string;
  createdAt: string;
}
export interface Configuration {
  /**
   * @maxItems 2000
   */
  items: ConfigurationRecord[];
}
export interface ConfigurationRecord {
  id: Id;
  title: Text;
  summary?: Text;
  tags?: Strings;
  description?: Text;
  properties?: JsonObject;
}
export interface JsonObject {
  [k: string]: JsonValue;
}
export interface Map {
  /**
   * @maxItems 2000
   */
  domains: Domain[];
  /**
   * @maxItems 2000
   */
  modules: Module[];
  /**
   * @maxItems 2000
   */
  checks: Check[];
  /**
   * @maxItems 2000
   */
  issues: Issue[];
}
export interface Domain {
  id: Id;
  title: string;
  /**
   * @maxItems 2000
   */
  aliases: string[];
}
export interface Module {
  id: Id;
  domainId: Id | null;
  title: string;
  /**
   * @maxItems 2000
   */
  aliases: string[];
  summary: string;
  /**
   * @maxItems 2000
   */
  descriptions: Statement[];
  /**
   * @maxItems 2000
   */
  entryPoints: EntryPoint[];
  ruleIds: Ids;
  roleIds: Ids;
}
export interface Statement {
  id: Id;
  text: string;
  meta: Meta;
  /**
   * @maxItems 2000
   */
  relations: Relation[];
  issueIds: Ids;
  appliesTo?: Text;
}
export interface SourceRef {
  sourceId: Id;
  locator: string;
}
export interface Relation {
  type: 'requires' | 'uses_role' | 'operates_on' | 'affects' | 'navigates_to' | 'related_to';
  targetId: Id;
}
export interface EntryPoint {
  id: Id;
  /**
   * @maxItems 2000
   */
  menuPath: string[];
  accessNotes: string | null;
  meta: Meta;
  appliesTo?: Text;
  application?: Text;
  page?: Text;
  url?: string;
}
export interface Issue {
  id: Id;
  type: 'conflict' | 'stale' | 'needs_review' | 'missing';
  recordIds: Ids;
  summary: string;
  /**
   * @maxItems 2000
   */
  sourceRefs: SourceRef[];
  resolution: {
    text: string;
    /**
     * @minItems 1
     * @maxItems 2000
     */
    sourceRefs: SourceRef[];
  } | null;
}
export interface Topic {
  id: Id;
  title: string;
  /**
   * @maxItems 2000
   */
  entries: Entry[];
  /**
   * @maxItems 2000
   */
  issues: Issue[];
}
export interface Entry {
  id: Id;
  kind: 'rule' | 'role';
  title: string;
  /**
   * @maxItems 2000
   */
  aliases: string[];
  summary: string;
  moduleIds: Ids;
  /**
   * @maxItems 2000
   */
  businessTags: string[];
  /**
   * @maxItems 2000
   */
  statements: Statement[];
}
export interface Source {
  id: Id;
  documentId: Id;
  title: string;
  kind: 'requirement' | 'manual' | 'observation' | 'confirmation' | 'other';
  version: string | null;
  issuedAt: string | null;
  sha256: string | null;
  locator: string;
  /**
   * @maxItems 2000
   */
  limitations: string[];
}
