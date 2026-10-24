/** Opaque internal IDs remain plain JSON strings at the boundary. */
declare const kind: unique symbol;
export type CaseId = string & { readonly [kind]: 'case' };
export type AssignmentId = string & { readonly [kind]: 'assignment' };
export type OperationId = string & { readonly [kind]: 'operation' };
export type SpaceId = number & { readonly [kind]: 'space' };
function valid(value: unknown): string { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) throw new Error('Invalid identifier.'); return value; }
export function caseId(value: unknown): CaseId { return valid(value) as CaseId; }
export function assignmentId(value: unknown): AssignmentId { const id = valid(value); if (!/^asg-[a-f0-9]{32}$/.test(id)) throw new Error('Invalid assignment ID.'); return id as AssignmentId; }
export function operationId(value: unknown): OperationId { return valid(value) as OperationId; }
export function spaceId(value: unknown): SpaceId { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid Space ID.'); return value as SpaceId; }
