export interface Inspection { at: number | null; pinned: boolean }
export type InspectionAction = { type: "hover"; at: number } | { type: "pin"; at: number } | { type: "leave" } | { type: "clear" };
export const latestInspection: Inspection = { at: null, pinned: false };

export function inspectionReducer(state: Inspection, action: InspectionAction): Inspection {
  if (action.type === "clear") return latestInspection;
  if (action.type === "leave") return state.pinned ? state : latestInspection;
  if (!Number.isFinite(action.at)) return state;
  if (action.type === "pin") return { at: action.at, pinned: true };
  return state.pinned ? state : { at: action.at, pinned: false };
}
