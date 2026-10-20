import { useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, BookOpen, Building2, ChartNoAxesCombined, ChevronRight, CircleHelp, Gauge, LayoutDashboard, Map, Menu, Snowflake, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Tone } from "../../lib/overviewDisplay";

export const destinations = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "nodes", label: "Room & Nodes", icon: Map },
  { id: "prediction", label: "Predictive Cooling", icon: Sparkles },
  { id: "utilization", label: "AC Utilization", icon: ChartNoAxesCombined },
  { id: "records", label: "Operating Records", icon: BookOpen }
] as const;
export type Destination = typeof destinations[number]["id"];
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>;
}
export function ProductShell({ view, onNavigate, feed, children, model }: { view: Destination; onNavigate: (id: Destination) => void; feed: { label: string; tone: Tone }; children: ReactNode; model?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [methodology, setMethodology] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => { if (methodology) dialog.current?.showModal(); else dialog.current?.close(); }, [methodology]);
  useEffect(() => {
    if (!menuOpen) return;
    navigation.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [menuOpen]);
  return <div className="product-shell">
    <a href="#main-content" className="skip-link">Skip to content</a>
    {menuOpen && <button className="menu-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <a className="brand" href="#overview" onClick={() => { onNavigate("overview"); setMenuOpen(false); }}><span className="brand-mark"><Snowflake size={24} /></span><span>OmniSense<small>Cooling management</small></span></a>
      <div className="workspace-label">Workspace</div>
      <div className="workspace"><Building2 size={19} /><span>SDP Building<small>Cooling operations</small></span></div>
      <div className="nav-label">Management</div>
      <nav ref={navigation} aria-label="Main navigation" id="main-navigation">
        {destinations.map(({ id, label, icon: Icon }) => <button key={id} aria-current={view === id ? "page" : undefined} className={`nav-item ${view === id ? "nav-active" : ""}`} onClick={() => { onNavigate(id); setMenuOpen(false); }}><Icon size={19} /><span>{label}</span>{view === id && <ChevronRight size={16} />}</button>)}
      </nav>
      <div className="sidebar-bottom"><span className="sidebar-service"><Activity size={16} />SDP workspace</span><button className="methodology-button" onClick={() => setMethodology(true)}><CircleHelp size={17} />Data sources & methodology<ArrowUpRight size={14} /></button><span className="sidebar-version">OmniSense Edge / SDP</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button ref={menuButton} className="icon-button menu-toggle" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}><Menu size={21} /></button><Building2 size={17} /><span>SDP Building</span><ChevronRight size={14} /><strong>{destinations.find(d => d.id === view)?.label}</strong></div><div className="topbar-status"><Badge tone={feed.tone}>{feed.label}</Badge><button className="icon-button" title="Data sources & methodology" aria-label="Data sources and methodology" onClick={() => setMethodology(true)}><CircleHelp size={19} /></button></div></header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="page-footer"><span>OmniSense Smart Cooling Management</span><button onClick={() => setMethodology(true)}>Data sources & methodology <ArrowUpRight size={13} /></button></footer>
    </div>
    <dialog ref={dialog} className="methodology-dialog" aria-labelledby="methodology-title" onCancel={() => setMethodology(false)} onClose={() => setMethodology(false)} onClick={e => { if (e.target === e.currentTarget) setMethodology(false); }}><div className="dialog-content"><div className="dialog-title"><span className="dialog-icon"><Gauge size={23} /></span><button className="icon-button" title="Close" aria-label="Close methodology" onClick={() => setMethodology(false)}><X size={20} /></button></div><h2 id="methodology-title">A clear view of the data</h2><p>This workspace displays stored simulation records from the dedicated OmniSense SDP database. They are not live ESP32 measurements or verified physical HVAC feedback.</p><dl className="methodology-list"><div><dt>Data source</dt><dd>SDP generator / Supabase</dd></div><div><dt>Model</dt><dd>{model ?? "Not yet available"}</dd></div><div><dt>History & updates</dt><dd>Seven-day seed; new frames every 30 seconds</dd></div><div><dt>Predictions</dt><dd>Synthetic booking timetable, not a trained model</dd></div><div><dt>Reported output</dt><dd>Simulated acknowledgement, not physical actuation</dd></div><div><dt>Room diagram</dt><dd>Illustrative layout; stored node coordinates</dd></div><div><dt>Time display</dt><dd>Browser local time; original records use UTC</dd></div></dl><p className="methodology-note">Cooling decisions are displayed as recorded, not calculated in the browser. Operating modes do not establish measured electricity consumption or verified energy savings.</p></div></dialog>
  </div>;
}
