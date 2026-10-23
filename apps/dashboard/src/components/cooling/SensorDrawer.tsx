import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { OverviewData } from "../../types/overview";
import { RoomNodes } from "./RoomNodes";

export function SensorDrawer({ data, now, refreshToken, nodeId, onClose }: { data: OverviewData; now: number; refreshToken: string | null; nodeId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { element?.close(); trigger.current?.focus(); }; }, []);
  return <dialog ref={dialog} className="sensor-drawer" aria-labelledby="sensor-drawer-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.currentTarget === event.target) onClose(); }}><header><div><span className="eyebrow">Room evidence</span><h2 id="sensor-drawer-title">Sensor inspection</h2></div><button className="icon-button" aria-label="Close sensor inspection" onClick={onClose}><X size={22} /></button></header><RoomNodes data={data} now={now} refreshToken={refreshToken} initialNode={nodeId} /></dialog>;
}
