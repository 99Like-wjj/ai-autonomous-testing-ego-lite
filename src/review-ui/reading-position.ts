/** In-page reading state only. No business state or cross-version persistence. */
export interface ReadingPosition {
  pageY: number; treeY: number; reviewY: number;
  editorY: number; editorStart: number; editorEnd: number; globalEditorY: number;
  details: boolean[]; reviewDetails: boolean[];
  search: string; filter: string; openCases: string[];
  overviewSearch: string; overviewFilter: string; expanded: string[]; filterCollapsed: boolean;
}
export function boundedPosition(value: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(value, Math.max(0, maximum))) : 0;
}
export function filteredNeighbor<T>(items: readonly T[], index: number, direction: -1 | 1): T | undefined {
  return index < 0 || index >= items.length ? undefined : items[index + direction];
}
