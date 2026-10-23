import { useEffect, useId, useRef, useState } from "react";
import { CircleHelp, Mouse, MoveHorizontal, MousePointer2, X } from "lucide-react";

export function TimelineGuide() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    };
  }, [open]);
  return <>
    <button ref={trigger} className="su-guide-trigger" aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? `${id}-dialog` : undefined} onClick={() => setOpen(true)}>
      <CircleHelp size={16} aria-hidden="true" />How to use this chart
    </button>
    {open && <dialog ref={dialog} id={`${id}-dialog`} className="su-guide-dialog" aria-labelledby={`${id}-title`}
      onCancel={event => { event.preventDefault(); setOpen(false); }}
      onClose={() => setOpen(false)}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setOpen(false);
      }}>
      <header className="su-guide-dialog-header">
        <div><h2 id={`${id}-title`}>Chart guide</h2><p>Explore the timeline and inspect stored records.</p></div>
        <button autoFocus aria-label="Close chart guide" onClick={() => setOpen(false)}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="su-interaction-guide su-guide-body">
        <ul className="su-gesture-list">
          <li><Mouse size={19} aria-hidden="true" /><span><strong>Zoom</strong><span>Scroll or use + / −.</span></span></li>
          <li><MoveHorizontal size={19} aria-hidden="true" /><span><strong>Move through time</strong><span>Drag left or right.</span></span></li>
          <li><MousePointer2 size={19} aria-hidden="true" /><span><strong>Inspect a moment</strong><span>Click or tap to keep its details open.</span></span></li>
        </ul>
        <section className="su-chart-data-notes" aria-label="Chart symbols">
          <p><i className="su-guide-dashed" aria-hidden="true" /><span><strong>Room occupancy:</strong> solid bands are recorded; dashed windows show expected use. Thin hatched strips show usage forecasts as issued, which may later change.</span></p>
          <p><i className="su-guide-solid" aria-hidden="true" /><span><strong>Cooling operation:</strong> colored bands show requested modes, not verified equipment operation. The solid gold line marks the inspected forecast’s planned restart; dotted gold lines show restarts planned in earlier forecasts.</span></p>
          <p><i className="su-note-forecast" aria-hidden="true" /><span><strong>Diamonds above occupancy:</strong> forecasts at the time they were issued.</span></p>
          <p><i className="su-note-decision" aria-hidden="true" /><span><strong>Dots above cooling:</strong> cooling decisions.</span></p>
          <p><i className="su-note-report" aria-hidden="true" /><span><strong>Ticks below cooling:</strong> simulated output reports, separate from cooling requests.</span></p>
          <p><i className="su-guide-unknown" aria-hidden="true" /><span><strong>Shaded areas:</strong> no recorded outcome.</span></p>
          <p>Select a forecast, decision or report marker to open its exact record.</p>
        </section>
        <section className="su-keyboard-help" aria-labelledby={`${id}-keys`}>
          <h3 id={`${id}-keys`}>Keyboard shortcuts</h3><dl>
            <div><dt><kbd>+</kbd> / <kbd>−</kbd></dt><dd>Zoom in / out</dd></div>
            <div><dt><kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd></dt><dd>Move earlier / later</dd></div>
            <div><dt><kbd>←</kbd> / <kbd>→</kbd></dt><dd>Inspect earlier / later records</dd></div>
            <div><dt><kbd>Home</kbd> / <kbd>End</kbd></dt><dd>Inspect first / last record in view</dd></div>
            <div><dt><kbd>0</kbd></dt><dd>Fit the selected period</dd></div>
            <div><dt><kbd>Esc</kbd></dt><dd>Show latest details; keep zoom</dd></div>
          </dl><p>Use these while the chart is focused. Press Escape to close this guide.</p>
        </section>
      </div>
    </dialog>}
  </>;
}
