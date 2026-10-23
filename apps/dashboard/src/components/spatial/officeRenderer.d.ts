export type CameraAction = "left" | "right" | "in" | "out" | "reset" | "up" | "down";
export interface SceneNode { id: string; x: number; y: number }
export interface CameraAvailability { left: boolean; right: boolean; in: boolean; out: boolean }
export interface OfficeCallbacks {
  onSelect: (id: string) => void;
  onProject: (positions: { id: string; x: number; y: number; visible: boolean }[]) => void;
  onLimits: (available: CameraAvailability) => void;
  onUnavailable: () => void;
}
export interface OfficeRenderer {
  setNodes(nodes: SceneNode[]): void;
  selectNode(id: string | null): void;
  hoverNode(id: string | null): void;
  moveCamera(action: CameraAction): void;
  startHold(action: CameraAction): void;
  endHold(tap: boolean): void;
  stopCameraInput(): void;
  dispose(): void;
}
/** Imperative visualization boundary; React owns every accessible control and all SDP data. */
export function createOfficeRenderer(canvas: HTMLCanvasElement, viewport: HTMLElement, callbacks: OfficeCallbacks): OfficeRenderer;
