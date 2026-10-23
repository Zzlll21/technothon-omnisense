import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { SpatialOverview } from "../../lib/spatialOverview";
import { number } from "../../lib/overviewDisplay";
import type { CameraAction, CameraAvailability, OfficeRenderer } from "./officeRenderer";

const controls: { action: CameraAction; label: string; symbol: string }[] = [
  { action: "left", label: "Rotate view left", symbol: "↶" }, { action: "right", label: "Rotate view right", symbol: "↷" },
  { action: "out", label: "Zoom out", symbol: "−" }, { action: "in", label: "Zoom in", symbol: "+" }, { action: "reset", label: "Reset view", symbol: "Reset view" }
];

export function OfficeCanvas({ nodes, selectedId, onSelect }: { nodes: SpatialOverview["nodes"]; selectedId: string | null; onSelect: (id: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), viewport = useRef<HTMLDivElement>(null);
  const renderer = useRef<OfficeRenderer | null>(null);
  const markers = useRef(new Map<string, HTMLButtonElement>());
  const latest = useRef({ nodes, selectedId, onSelect });
  latest.current = { nodes, selectedId, onSelect };
  const held = useRef<{ id: number; button: HTMLButtonElement } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [attempt, setAttempt] = useState(0);
  const [available, setAvailable] = useState<CameraAvailability>({ left: true, right: true, in: true, out: true });
  const limits = useRef(available);
  function finishHold(tap: boolean, id?: number) {
    const hold = held.current;
    if (!hold || (id !== undefined && hold.id !== id)) return;
    held.current = null;
    renderer.current?.endHold(tap);
    if (hold.button.hasPointerCapture(hold.id)) hold.button.releasePointerCapture(hold.id);
  }
  useEffect(() => {
    let cancelled = false;
    let projected = false;
    setStatus("loading");
    void import("./officeRenderer.js").then(({ createOfficeRenderer }) => {
      if (cancelled || !canvas.current || !viewport.current) return;
      renderer.current = createOfficeRenderer(canvas.current, viewport.current, {
        onSelect: id => latest.current.onSelect(id),
        // Projection is an imperative DOM transform; it never re-renders React per frame.
        onProject: positions => {
          positions.forEach(p => {
            const marker = markers.current.get(p.id);
            if (marker) { marker.style.transform = `translate3d(${p.x}px,${p.y}px,0)`; marker.style.visibility = p.visible ? "visible" : "hidden"; }
          });
          if (!projected && !cancelled) { projected = true; setStatus("ready"); }
        },
        onLimits: next => {
          if (Object.keys(next).some(key => next[key as keyof CameraAvailability] !== limits.current[key as keyof CameraAvailability])) { limits.current = next; setAvailable(next); }
        },
        onUnavailable: () => { if (!cancelled) setStatus("unavailable"); }
      });
      renderer.current.setNodes(latest.current.nodes);
      renderer.current.selectNode(latest.current.selectedId);
    }).catch(() => { if (!cancelled) setStatus("unavailable"); });
    const up = (event: globalThis.PointerEvent) => finishHold(true, event.pointerId);
    const cancel = (event: globalThis.PointerEvent) => finishHold(false, event.pointerId);
    const stop = () => { finishHold(false); renderer.current?.stopCameraInput(); };
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel); window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true; finishHold(false); renderer.current?.dispose(); renderer.current = null;
      window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [attempt]); // Intentional: readings and selected node update the existing renderer below.
  useEffect(() => { renderer.current?.setNodes(nodes); renderer.current?.selectNode(selectedId); }, [nodes, selectedId]);
  function startHold(event: PointerEvent<HTMLButtonElement>, action: CameraAction) {
    if (event.button !== 0 || action === "reset" || status !== "ready") return;
    finishHold(false); event.currentTarget.setPointerCapture(event.pointerId);
    held.current = { id: event.pointerId, button: event.currentTarget };
    renderer.current?.startHold(action);
  }
  return <div className="sz-office" data-renderer={status}>
    <strong className="sz-office-heading">One shared cooling zone</strong>
    <div className="sz-viewport" ref={viewport}>
      <canvas ref={canvas} tabIndex={status === "ready" ? 0 : -1} aria-hidden={status !== "ready"} aria-label="Interactive office model. Left and right arrows orbit, up and down adjust elevation, plus and minus zoom, Home resets." aria-describedby="sz-camera-help"
        onKeyDown={event => { if (event.ctrlKey || event.metaKey || event.altKey) return; const action: Record<string, CameraAction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", "+": "in", "=": "in", "-": "out", Home: "reset" }; if (action[event.key]) { event.preventDefault(); renderer.current?.moveCamera(action[event.key]); } }} />
      {nodes.map((node, index) => <button key={node.id} disabled={status !== "ready"} hidden={status === "unavailable"} aria-hidden={status !== "ready"} ref={element => { if (element) markers.current.set(node.id, element); else markers.current.delete(node.id); }} className="sz-marker" data-node-id={node.id} aria-label={`Inspect Node ${String(index + 1).padStart(2, "0")}, ${node.label}. ${node.classification}. ${node.freshness}.`} aria-pressed={selectedId === node.id} onClick={() => onSelect(node.id)} onPointerEnter={() => renderer.current?.hoverNode(node.id)} onPointerLeave={() => renderer.current?.hoverNode(null)} onFocus={() => renderer.current?.hoverNode(node.id)} onBlur={() => renderer.current?.hoverNode(null)}>{String(index + 1).padStart(2, "0")}</button>)}
      {status !== "ready" && <div className="sz-scene-fallback" role="status"><p>{status === "loading" ? "Preparing the 3D workspace…" : "The 3D view is unavailable. Stored readings and node inspection remain available below."}</p>{status === "unavailable" && <button onClick={() => setAttempt(n => n + 1)}>Retry 3D view</button>}</div>}
    </div>
    <div className="sz-camera-toolbar"><span id="sz-camera-help"><span className="sz-mouse-help">Drag to orbit · scroll to zoom</span><span className="sz-touch-help">Hold arrows to orbit · + / − to zoom</span></span><div role="group" aria-label="Office camera controls">{controls.map(({ action, label, symbol }) => <button key={action} type="button" aria-label={label} disabled={status !== "ready" || (action in available && !available[action as keyof CameraAvailability])}
      onPointerDown={event => startHold(event, action)} onPointerUp={event => finishHold(true, event.pointerId)} onPointerCancel={event => finishHold(false, event.pointerId)} onLostPointerCapture={event => finishHold(false, event.pointerId)}
      onClick={event => { if (action === "reset" || event.detail === 0) renderer.current?.moveCamera(action); }}>{symbol}</button>)}</div></div>
    <div className="sz-node-readings" role="group" aria-label="Sensor readings and history">{nodes.map((node, index) => <button key={node.id} data-node-id={node.id} aria-pressed={selectedId === node.id} onClick={() => onSelect(node.id)} onPointerEnter={() => renderer.current?.hoverNode(node.id)} onPointerLeave={() => renderer.current?.hoverNode(null)} onFocus={() => renderer.current?.hoverNode(node.id)} onBlur={() => renderer.current?.hoverNode(null)}>
      <span className="sz-reading-title"><strong>{node.x < 0.5 ? "Left" : node.x > 0.5 ? "Right" : "Central"} sensing area</strong></span><span className="sz-reading-meta">Node {String(index + 1).padStart(2, "0")} · {node.label}</span>
      <span className="sz-reading-values"><strong>{number(node.temperature)}<small>°C</small></strong><span>{number(node.humidity)}% RH</span></span><span className="sz-reading-meta">Occupancy: <strong>{node.occupancy}</strong> · Headcount: <strong>{node.headcount === null ? "Unavailable" : node.headcount === 3 ? "3+" : node.headcount}</strong></span><span className="sz-reading-meta">{node.freshness} · {node.headcount !== null && node.freshness !== "Connected" && "Last reported · "}{!node.evidenceValid && "Evidence incomplete / unavailable · "}Inspect ↗</span>
    </button>)}</div>
  </div>;
}
