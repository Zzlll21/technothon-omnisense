import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, ChartNoAxesCombined, CircleHelp, Gauge, LayoutDashboard, Map, Snowflake, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Tone } from "../../lib/overviewDisplay";

export const destinations = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "nodes", label: "Room & Nodes", icon: Map },
  { id: "prediction", label: "Predictive Cooling", icon: Sparkles },
  { id: "utilization", label: "Cooling Statistics", icon: ChartNoAxesCombined },
  { id: "records", label: "Operating Records", icon: BookOpen }
] as const;
export type Destination = typeof destinations[number]["id"];
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>;
}
export function ProductShell({ view, onNavigate, feed, children, model }: { view: Destination; onNavigate: (id: Destination) => void; feed: { label: string; tone: Tone }; children: ReactNode; model?: string }) {
  const [methodology, setMethodology] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (methodology) dialog.current?.showModal(); else dialog.current?.close(); }, [methodology]);
  return <div className="product-shell decision-product">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="console-header"><div className="console-brand-row"><div className="brand-with-status"><a className="console-brand" href="#overview" onClick={event => { event.preventDefault(); onNavigate("overview"); }}><Snowflake size={28} strokeWidth={1.7} /><strong>OmniSense</strong></a><Badge tone={feed.tone}>{feed.label}</Badge><span className="brand-provenance">{model === "sdp-hybrid-v1" ? "Stored hybrid evidence" : "Stored simulation"} · Read only</span></div><div className="console-feed"><span className="site-label">Smart Cooling Decision Console</span><button className="icon-button" title="Data sources & methodology" aria-label="Data sources and methodology" onClick={() => setMethodology(true)}><CircleHelp size={19} /></button></div></div><nav className="console-navigation" aria-label="Main navigation">{destinations.map(({ id, label, icon: Icon }) => <button key={id} aria-current={view === id ? "page" : undefined} onFocus={event => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })} onClick={() => onNavigate(id)}><Icon size={17} strokeWidth={1.7} />{label}</button>)}</nav></header>
    <div className="main-shell">
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="page-footer"><span>OmniSense Smart Cooling Management</span><button onClick={() => setMethodology(true)}>Data sources & methodology <ArrowUpRight size={13} /></button></footer>
    </div>
    <dialog ref={dialog} className="methodology-dialog" aria-labelledby="methodology-title" onCancel={() => setMethodology(false)} onClose={() => setMethodology(false)} onClick={e => { if (e.target === e.currentTarget) setMethodology(false); }}><div className="dialog-content"><div className="dialog-title"><span className="dialog-icon"><Gauge size={23} /></span><button className="icon-button" title="Close" aria-label="Close methodology" onClick={() => setMethodology(false)}><X size={20} /></button></div><h2 id="methodology-title">A clear view of the data</h2><p>{model === "sdp-hybrid-v1" ? "This workspace displays stored hardware observations with gateway receipt times. Forecasts and reported HVAC output remain simulated." : "This workspace displays stored simulation records from the dedicated OmniSense SDP database. They are not live ESP32 measurements or verified physical HVAC feedback."}</p><dl className="methodology-list"><div><dt>Data source</dt><dd>SDP generator / Supabase</dd></div><div><dt>Model</dt><dd>{model ?? "Not yet available"}</dd></div><div><dt>History & updates</dt><dd>{model === "sdp-hybrid-v1" ? "No hardware backfill; state changes and 30-second heartbeat" : "Seven-day seed; new frames every 30 seconds"}</dd></div><div><dt>Predictions</dt><dd>Synthetic booking timetable, not a trained model</dd></div><div><dt>Reported output</dt><dd>Simulated acknowledgement, not physical actuation</dd></div><div><dt>Room diagram</dt><dd>Illustrative layout; stored node coordinates</dd></div><div><dt>Time display</dt><dd>Browser local time; original records use UTC</dd></div></dl><p className="methodology-note">Cooling decisions are displayed as recorded, not calculated in the browser. Operating modes do not establish measured electricity consumption or verified energy savings.</p></div></dialog>
  </div>;
}
