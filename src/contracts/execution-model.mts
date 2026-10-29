import type { EgoLiteExecutionLedgerV8, ExecutionAssignment, ExecutionConfigurationSnapshot, ExecutionOperation, ExecutionReceipt, PacketImport, RetainedFileReference, ExecutionEvent, OwnedSpace } from './generated/execution.mjs';
import type { EgoLiteExecutionRequestV8, PacketReview } from './generated/execution-request.mjs';
import type { EgoLiteWorkerPacketV8, ExecutionWindow } from './generated/worker-packet.mjs';
import type { EgoLiteExecutionReadViewV8 } from './generated/execution-read.mjs';
export type ExecutionLedger = EgoLiteExecutionLedgerV8;
export type Assignment = ExecutionAssignment;
export type ConfigurationSnapshot = ExecutionConfigurationSnapshot;
export type ExecutionRequest = EgoLiteExecutionRequestV8;
export type Operation = ExecutionOperation;
export type Receipt = ExecutionReceipt;
export type ImportState = PacketImport;
export type FileReference = RetainedFileReference;
export type Event = ExecutionEvent;
export type { OwnedSpace, PacketReview, ExecutionWindow };
export type WorkerPacket = EgoLiteWorkerPacketV8;
export type PacketRecord = WorkerPacket['record'];
export interface ExecutionSummary {
  configuredMaxParallelCases: number; knownAvailableWorkers: number | null;
  activeReservations: number; peakReservations: number; reportedExecutionPeak: number | null;
  executionWindowSource: string; draining: boolean; unfinishedAssignmentIds: string[]; pendingImportIds: string[];
}
export type ExecutionReadView = EgoLiteExecutionReadViewV8;
export type AssignmentState = Assignment['state'];
export const activeStates: readonly AssignmentState[] = ['reserved', 'running', 'stop_requested', 'lost'];
