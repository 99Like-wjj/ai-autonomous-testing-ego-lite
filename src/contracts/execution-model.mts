import type { EgoLiteExecutionLedgerV5, ExecutionAssignment, ExecutionConfigurationSnapshot, ExecutionOperation, ExecutionReceipt, PacketImport, RetainedFileReference, ExecutionEvent, OwnedSpace } from './generated/execution.mjs';
import type { EgoLiteExecutionRequestV5, PacketReview } from './generated/execution-request.mjs';
import type { EgoLiteWorkerPacketV5, ExecutionWindow } from './generated/worker-packet.mjs';
import type { EgoLiteExecutionReadViewV5 } from './generated/execution-read.mjs';
export type ExecutionLedger = EgoLiteExecutionLedgerV5;
export type Assignment = ExecutionAssignment;
export type ConfigurationSnapshot = ExecutionConfigurationSnapshot;
export type ExecutionRequest = EgoLiteExecutionRequestV5;
export type Operation = ExecutionOperation;
export type Receipt = ExecutionReceipt;
export type ImportState = PacketImport;
export type FileReference = RetainedFileReference;
export type Event = ExecutionEvent;
export type { OwnedSpace, PacketReview, ExecutionWindow };
export type WorkerPacket = EgoLiteWorkerPacketV5;
export type PacketRecord = WorkerPacket['record'];
export interface ExecutionSummary {
  configuredMaxParallelCases: number; knownAvailableWorkers: number | null;
  activeReservations: number; peakReservations: number; reportedExecutionPeak: number | null;
  executionWindowSource: string; draining: boolean; unfinishedAssignmentIds: string[]; pendingImportIds: string[];
}
export type ExecutionReadView = EgoLiteExecutionReadViewV5;
export type AssignmentState = Assignment['state'];
export const activeStates: readonly AssignmentState[] = ['reserved', 'running', 'stop_requested', 'lost'];
