import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, RefObject } from "react";
import { fitTimeWindow, panTimeWindow, zoomTimeWindow } from "../lib/timelineViewport";
import type { TimeWindow } from "../lib/timelineViewport";

interface Options { bounds: TimeWindow; periodKey: string; enabled: boolean; svg: RefObject<SVGSVGElement | null>; width: number; left: number; right: number; onNavigate: () => void }
interface View { key: string; window: TimeWindow | null }
interface Drag { id: number; x: number; y: number; window: TimeWindow; moved: boolean; element: SVGSVGElement }

export function useTimelineViewport(options: Options) {
  const { bounds, periodKey, enabled, svg } = options;
  const [view, setView] = useState<View>({ key: periodKey, window: null });
  const [dragging, setDragging] = useState(false);
  const pending = useRef<View | null>(null), frame = useRef<number | null>(null), drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const stored = pending.current?.key === periodKey ? pending.current : view;
  const visibleWindow = enabled && stored.key === periodKey && stored.window ? fitTimeWindow(stored.window, bounds) : bounds;
  const customized = enabled && stored.key === periodKey && stored.window !== null;
  const live = useRef({ ...options, window: visibleWindow });
  live.current = { ...options, window: visibleWindow };

  function publish(next: TimeWindow) {
    const state = live.current;
    next = fitTimeWindow(next, state.bounds);
    const full = Math.abs(next.start - state.bounds.start) < 1 && Math.abs(next.end - state.bounds.end) < 1;
    pending.current = { key: state.periodKey, window: full ? null : next };
    live.current.window = next;
    state.onNavigate();
    if (frame.current === null) frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const nextView = pending.current; pending.current = null;
      if (nextView) setView(nextView);
    });
  }
  function reset() { publish(live.current.bounds); }
  function zoom(factor: number, fraction = .5) { const s = live.current; publish(zoomTimeWindow(s.window, s.bounds, factor, fraction)); }
  function pan(fraction: number) { const s = live.current; publish(panTimeWindow(s.window, s.bounds, (s.window.end - s.window.start) * fraction)); }
  function finish() {
    const current = drag.current; drag.current = null; setDragging(false);
    if (current?.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
  }
  useEffect(() => {
    // Changing a preset cancels a gesture; ordinary data refreshes do not reset the saved window.
    finish(); pending.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, [periodKey, enabled]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  useEffect(() => {
    const element = svg.current;
    if (!element || !enabled) return;
    const wheel = (event: WheelEvent) => {
      // Keep browser-level zoom available; consume scrolling only over the plot itself.
      if (event.ctrlKey || event.metaKey || event.altKey || drag.current) return;
      const state = live.current, box = element.getBoundingClientRect();
      const point = (event.clientX - box.left) / box.width * state.width;
      if (point < state.left || point > state.right) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1;
      const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const delta = (horizontal ? event.deltaX || event.deltaY : event.deltaY) * unit;
      if (!delta) return;
      event.preventDefault();
      if (horizontal) {
        const pixels = (state.right - state.left) / state.width * box.width;
        publish(panTimeWindow(state.window, state.bounds, delta / pixels * (state.window.end - state.window.start)));
      } else zoom(Math.exp(Math.max(-.5, Math.min(.5, delta * .0025))), (point - state.left) / (state.right - state.left));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [enabled, svg]);
  useEffect(() => {
    const cancel = () => finish();
    const visibility = () => { if (document.hidden) finish(); };
    window.addEventListener("blur", cancel); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", cancel); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!live.current.enabled || event.button !== 0 || !event.isPrimary) return;
    suppressClick.current = false;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, window: { ...live.current.window }, moved: false, element: event.currentTarget };
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return false;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    if (!current.moved) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return true;
      // A vertical touch gesture continues scrolling the page.
      if (event.pointerType === "touch" && Math.abs(dy) > Math.abs(dx)) { finish(); return true; }
      current.moved = true; suppressClick.current = true; setDragging(true);
      current.element.setPointerCapture(event.pointerId);
    }
    const s = live.current, box = current.element.getBoundingClientRect();
    const pixels = (s.right - s.left) / s.width * box.width;
    publish(panTimeWindow(current.window, s.bounds, -dx / pixels * (current.window.end - current.window.start)));
    return true;
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    if (drag.current?.id !== event.pointerId) return;
    if (drag.current.moved) { pointerMove(event); event.preventDefault(); }
    finish();
  }
  function clickCapture(event: MouseEvent<SVGSVGElement>) {
    if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); }
  }
  return { window: visibleWindow, customized, dragging, zoom, pan, reset, pointerDown, pointerMove, pointerUp, cancel: finish, clickCapture };
}
