import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, RefreshCw, Search, X } from "lucide-react";
import type { OverviewData } from "../../types/overview";
import type { RecordCategory, RecordFilters, RecordSnapshot, SearchField } from "../../api/operatingRecords";
import { validateRecordFilters } from "../../api/operatingRecords";
import { buildOperatingCsv } from "../../api/exportOperatingRecords";
import { RECORD_PAGE_SIZE, useOperatingRecords } from "../../hooks/useOperatingRecords";
import { displayedReport, malaysiaDay, malaysiaTime, recordPresentation, recordRange } from "../../lib/operatingRecordsDisplay";
import { eventTypeLabels } from "../../lib/sdpRecords";
import { modeLabels, outputLabel } from "../../lib/overviewDisplay";
import type { CoolingMode } from "../../../../../packages/sdp-contract/src";
import { supabase } from "../../lib/supabase";
import { Badge } from "./ProductShell";
import { RecordDetail } from "./RecordDetail";

const quickCategories = [{ value: "ALL", label: "All" }, { value: "ZONE_DECISION", label: "Decisions" }, { value: "ZONE_FORECAST", label: "Forecasts" }, { value: "APPLIED_OUTPUT", label: "Reports" }] as const;
function snapshotFor(data: OverviewData): RecordSnapshot { return { modelVersion: data.run.model_version, runId: data.run.run_id, zoneId: data.zone.zone_id, zoneName: data.zone.name, sequence: data.frame.sequence, at: data.frame.simulated_at }; }
export function OperatingRecords({ data, initialEventId }: { data: OverviewData; initialEventId?: string }) {
  const [snapshot, setSnapshot] = useState(() => snapshotFor(data));
  const [range, setRange] = useState<"24" | "168" | "custom">(initialEventId ? "168" : "24");
  const [from, setFrom] = useState(() => malaysiaDay(Date.now())), [to, setTo] = useState(() => malaysiaDay(Date.now()));
  const [category, setCategory] = useState<RecordCategory>(initialEventId ? "ALL" : "ZONE_DECISION"), [mode, setMode] = useState<CoolingMode | "">("");
  const [search, setSearch] = useState(initialEventId ?? ""), [searchField, setSearchField] = useState<SearchField>(initialEventId ? "event_id" : "all");
  const [advancedOpen, setAdvancedOpen] = useState(!!initialEventId);
  const advancedCount = Number(!!mode) + Number(searchField !== "all") + Number(!quickCategories.some(item => item.value === category));
  const draftKey = JSON.stringify([range, from, to, category, mode, search.trim(), searchField]);
  const [appliedKey, setAppliedKey] = useState(draftKey);
  const dirty = draftKey !== appliedKey;
  const [filters, setFilters] = useState<RecordFilters>(() => ({ ...recordRange(initialEventId ? "168" : "24", Date.now(), "", ""), category: initialEventId ? "ALL" : "ZONE_DECISION", mode: "", search: initialEventId ?? "", searchField: initialEventId ? "event_id" : "all" }));
  const [page, setPage] = useState(1), [retry, setRetry] = useState(0), [filterError, setFilterError] = useState<string | null>(null), [selected, setSelected] = useState<string | null>(null);
  const state = useOperatingRecords(snapshot, filters, page, retry);
  const exportController = useRef<AbortController | null>(null);
  const [exportState, setExportState] = useState({ pending: false, done: 0, total: 0, message: "", error: false });
  useEffect(() => () => exportController.current?.abort(), []);
  function apply(nextCategory: RecordCategory = category) {
    if (exportController.current) return;
    try {
      const next = { ...recordRange(range, Date.now(), from, to), category: nextCategory, mode, search: search.trim(), searchField };
      validateRecordFilters(next); setFilters(next); setSnapshot(snapshotFor(data)); setPage(1); setSelected(null); setFilterError(null); setAppliedKey(JSON.stringify([range, from, to, nextCategory, mode, search.trim(), searchField])); setExportState({ pending: false, done: 0, total: 0, message: "", error: false });
    } catch (error) { setFilterError(error instanceof Error ? error.message : "Check the filters."); }
  }
  async function exportCsv() {
    if (exportController.current || !supabase || dirty) return;
    const controller = new AbortController(); exportController.current = controller;
    setExportState({ pending: true, done: 0, total: state.result?.total ?? 0, message: "Preparing matching records…", error: false });
    try {
      const result = await buildOperatingCsv(supabase, snapshot, filters, AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]), (done, total) => setExportState({ pending: true, done, total, message: "Preparing matching records…", error: false }));
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob(result.parts, { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `omnisense-simulated-records-${malaysiaDay(Date.parse(filters.start))}.csv`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportState({ pending: false, done: result.count, total: result.count, message: `CSV prepared · ${result.count.toLocaleString()} matching records`, error: false });
    } catch (error) {
      setExportState(previous => ({ ...previous, pending: false, message: controller.signal.aborted ? "Export cancelled" : error instanceof Error ? error.message : "Export failed. Please retry.", error: !controller.signal.aborted }));
    } finally { if (exportController.current === controller) exportController.current = null; }
  }
  const rows = state.result?.rows ?? [], total = state.result?.total ?? 0;
  const detail = selected ? rows.find(context => context.row.event_id === selected) : null;
  return <div className="operating-records">
    <div className="records-toolbar"><div><button className="records-export" disabled={dirty || state.loading || !!state.error || exportState.pending || !total} onClick={() => void exportCsv()}><Download size={16} />{exportState.pending ? "Exporting…" : "Export CSV"}</button></div></div>
    <form className="record-filters record-filters-simple" onSubmit={event => { event.preventDefault(); apply(); }}><fieldset disabled={exportState.pending}>
      <div className="record-filter-main"><label>Date range<select aria-label="Date range" value={range} onChange={event => setRange(event.target.value as typeof range)}><option value="24">Last 24 hours</option><option value="168">Last 7 days</option><option value="custom">Custom dates</option></select></label>
      <label className="record-search">Search records<input aria-label="Search records" type="search" maxLength={120} placeholder="Search reasons, nodes or record IDs" value={search} onChange={event => setSearch(event.target.value)} /></label><button className="records-apply" type="submit"><Search size={16} />Apply filters</button></div>
      {range === "custom" && <div className="record-date-fields"><label>From · Malaysia date<input type="date" value={from} max={malaysiaDay(Date.now())} onChange={event => setFrom(event.target.value)} /></label><label>Through · Malaysia date<input type="date" value={to} max={malaysiaDay(Date.now())} onChange={event => setTo(event.target.value)} /></label></div>}
      <div className="record-quick-categories" role="group" aria-label="Record categories">{quickCategories.map(item => <button type="button" key={item.value} aria-pressed={category === item.value} onClick={() => { setCategory(item.value); apply(item.value); }}>{item.label}</button>)}</div>
      <details className="records-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}><summary>Advanced filters{advancedCount > 0 && <span> · {advancedCount} active</span>}</summary><div className="record-advanced-fields">
        <label>Cooling mode<select aria-label="Cooling mode" value={mode} onChange={event => setMode(event.target.value as CoolingMode | "")}><option value="">Any mode</option>{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Record type<select aria-label="Record type" value={category} onChange={event => setCategory(event.target.value as RecordCategory)}><option value="ALL">All stored records</option><option value="OPERATIONS">Operating records only</option>{Object.entries(eventTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Search scope<select aria-label="Search scope" value={searchField} onChange={event => setSearchField(event.target.value as SearchField)}><option value="all">Descriptions and IDs</option><option value="text">Recorded descriptions only</option><option value="event_id">Record ID only</option><option value="correlation_id">Related-event ID only</option></select></label>
      </div>{mode && <p className="records-filter-note">Cooling mode matches decision and override-request records, not reports or forecasts.</p>}</details>
    </fieldset></form>
    {dirty && <p className="records-filter-note" role="status"><strong>Unapplied changes · CSV export paused.</strong></p>}
    {filterError && <div className="notice notice-error" role="alert">{filterError}</div>}
    <div className="records-snapshot"><span>{state.loading ? "Loading records…" : `${total.toLocaleString()} matching records`} · Newest first</span><span title={snapshot.at}>Snapshot {malaysiaTime(snapshot.at)} MYT</span></div>
    {exportState.message && <div className={`record-export-status ${exportState.error ? "export-error" : ""}`} role={exportState.error ? "alert" : "status"}><div><strong>{exportState.message}</strong>{exportState.pending && <><progress max={Math.max(1, exportState.total)} value={exportState.done} /><span>{exportState.done.toLocaleString()} / {exportState.total.toLocaleString()} records</span></>}</div>{exportState.pending && <button className="icon-button" title="Cancel export" aria-label="Cancel export" onClick={() => exportController.current?.abort()}><X size={18} /></button>}</div>}
    {state.error && <div className="notice notice-error" role="alert"><div><strong>Operating records unavailable</strong><p>{state.error}</p></div><button className="text-action" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
    {state.loading && !state.result ? <div className="history-empty" role="status" aria-busy="true"><RefreshCw size={22} className="spinning" /><p>Loading operating history</p></div> : !rows.length && !state.error ? <div className="history-empty"><FileText size={28} /><h3>No matching records</h3><p>Adjust the category, mode, search or date range.</p></div> : rows.length > 0 && <>
      <div className="records-table-scroll"><table className="records-table"><thead><tr><th>Malaysia time</th><th>Event / description</th><th>Cooling zone</th><th>Requested mode</th><th>Reported output</th><th>Correlation</th></tr></thead><tbody>{rows.map(context => {
        const view = recordPresentation(context), report = displayedReport(context), event = context.row.event;
        return <tr key={context.row.event_id}><td><button className="record-time-button" onClick={() => setSelected(context.row.event_id)} aria-label={`View record: ${view.title}, ${malaysiaTime(event.occurred_at)}`}><time dateTime={event.occurred_at} title={event.occurred_at}>{malaysiaTime(event.occurred_at)}</time><span>MYT · UTC+08:00</span></button></td><td><Badge tone={view.tone}>{view.category}</Badge><button className="record-description" onClick={() => setSelected(context.row.event_id)}>{view.title}</button>{view.reason && <p>{view.reason}</p>}</td><td>{snapshot.zoneName}</td><td>{context.decision ? modeLabels[context.decision.payload.requested_mode] : event.event_type === "OVERRIDE_REQUEST" && event.payload.action === "SET_OVERRIDE" ? modeLabels[event.payload.requested_mode] : "—"}</td><td>{report ? <><strong>{report.payload.status.toLowerCase()}</strong><span>{outputLabel(report.payload.reported_output)}</span><small>{event.event_type === "ZONE_DECISION" ? "Latest matching report at snapshot" : "Simulated report"}</small></> : "—"}</td><td><Badge tone={context.warnings.length ? "attention" : "neutral"}>{context.warnings.length ? "Review" : "Matched"}</Badge></td></tr>;
      })}</tbody></table></div>
      <div className="records-pagination"><span>{((page - 1) * RECORD_PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * RECORD_PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()}</span><div><button className="icon-button" title="Previous page" aria-label="Previous records page" disabled={page === 1 || state.loading} onClick={() => { setSelected(null); setPage(p => p - 1); }}><ChevronLeft size={19} /></button><span>Page {page} / {Math.max(1, Math.ceil(total / RECORD_PAGE_SIZE))}</span><button className="icon-button" title="Next page" aria-label="Next records page" disabled={page * RECORD_PAGE_SIZE >= total || state.loading} onClick={() => { setSelected(null); setPage(p => p + 1); }}><ChevronRight size={19} /></button></div></div>
    </>}
    {detail && <RecordDetail key={detail.row.event_id} context={detail} snapshot={snapshot} onClose={() => setSelected(null)} />}
  </div>;
}
