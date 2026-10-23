import { useEffect, useRef, useState } from "react";
import type { OverviewData } from "../../types/overview";
import type { RecordCategory, RecordContext, RecordFilters, RecordSnapshot, SearchField } from "../../api/operatingRecords";
import { validateRecordFilters } from "../../api/operatingRecords";
import { buildOperatingCsv } from "../../api/exportOperatingRecords";
import { RECORD_PAGE_SIZE, useOperatingRecords } from "../../hooks/useOperatingRecords";
import { displayedReport, malaysiaDay, malaysiaTime, recordPresentation, recordRange } from "../../lib/operatingRecordsDisplay";
import { eventTypeLabels } from "../../lib/sdpRecords";
import { modeLabels, outputLabel } from "../../lib/overviewDisplay";
import { quickRecordCategories, recordSnapshot } from "../../lib/spatialRecords";
import type { RecordFocus, SpatialRecordTarget } from "../../lib/spatialRecords";
import { supabase } from "../../lib/supabase";

interface Draft { range: "24" | "168" | "custom"; from: string; to: string; category: RecordCategory; mode: RecordFilters["mode"]; search: string; searchField: SearchField }
const draftKey = (d: Draft) => JSON.stringify({ ...d, search: d.search.trim() });
function initialRecords(data: OverviewData, focus?: RecordFocus | null) {
  const end = focus ? Date.parse(focus.occurredAt) + 1 : Date.now();
  const draft: Draft = { range: "24", from: malaysiaDay(end), to: malaysiaDay(end), category: "ALL", mode: "", search: focus?.eventId ?? "", searchField: focus ? "event_id" : "all" };
  return { snapshot: focus?.snapshot ?? recordSnapshot(data), draft, filters: { ...recordRange("24", end, "", ""), category: draft.category, mode: draft.mode, search: draft.search, searchField: draft.searchField } as RecordFilters };
}

export function OperatingRecordsWorkspace({ data, active, focus, onInspect, onHistory }: { data: OverviewData; active: boolean; focus?: RecordFocus | null; onInspect: (target: SpatialRecordTarget) => void; onHistory: () => void }) {
  const [initial] = useState(() => initialRecords(data, focus));
  const [snapshot, setSnapshot] = useState(initial.snapshot), [draft, setDraft] = useState(initial.draft), [filters, setFilters] = useState(initial.filters);
  const [appliedKey, setAppliedKey] = useState(draftKey(initial.draft)), [appliedFocus, setAppliedFocus] = useState(focus?.token ?? null);
  const [page, setPage] = useState(1), [retry, setRetry] = useState(0), [filterError, setFilterError] = useState<string | null>(null);
  const exportController = useRef<AbortController | null>(null), resultsHeading = useRef<HTMLHeadingElement>(null), focusResults = useRef(false);
  const [exportState, setExportState] = useState({ pending: false, done: 0, total: 0, message: "", error: false });
  const state = useOperatingRecords(snapshot, filters, page, retry);
  const pendingFocus = !!focus && focus.token !== appliedFocus;
  const dirty = draftKey(draft) !== appliedKey;
  const rows = pendingFocus ? [] : state.result?.rows ?? [], total = pendingFocus ? 0 : state.result?.total ?? 0;
  const advancedCount = Number(!!draft.mode) + Number(draft.searchField !== "all") + Number(!quickRecordCategories.some(q => q.value === draft.category));
  useEffect(() => () => exportController.current?.abort(), []);
  useEffect(() => { if (active) document.getElementById("sr-heading")?.focus({ preventScroll: true }); }, [active]);
  useEffect(() => {
    if (!focus || focus.token === appliedFocus) return;
    exportController.current?.abort();
    const next = initialRecords(data, focus);
    setSnapshot(next.snapshot); setDraft(next.draft); setFilters(next.filters); setAppliedKey(draftKey(next.draft)); setPage(1); setAppliedFocus(focus.token); setFilterError(null);
    setExportState({ pending: false, done: 0, total: 0, message: "", error: false });
  }, [focus?.token]);
  useEffect(() => { if (!state.loading && focusResults.current && active) { resultsHeading.current?.scrollIntoView({ block: "start" }); resultsHeading.current?.focus({ preventScroll: true }); focusResults.current = false; } }, [state.loading, active]);
  function update(value: Partial<Draft>) { setDraft(previous => ({ ...previous, ...value })); }
  function apply(nextDraft = draft) {
    if (exportController.current) return;
    try {
      const next = { ...recordRange(nextDraft.range, Date.now(), nextDraft.from, nextDraft.to), category: nextDraft.category, mode: nextDraft.mode, search: nextDraft.search.trim(), searchField: nextDraft.searchField };
      validateRecordFilters(next); setDraft(nextDraft); setFilters(next); setSnapshot(recordSnapshot(data)); setPage(1); setFilterError(null); setAppliedKey(draftKey(nextDraft)); focusResults.current = true;
      setExportState({ pending: false, done: 0, total: 0, message: "", error: false });
    } catch (error) { setFilterError(error instanceof Error ? error.message : "Check the record filters."); }
  }
  async function exportCsv() {
    if (exportController.current || !supabase || dirty || pendingFocus) return;
    const controller = new AbortController(); exportController.current = controller;
    setExportState({ pending: true, done: 0, total, message: "Preparing the complete filtered CSV…", error: false });
    try {
      const result = await buildOperatingCsv(supabase, snapshot, filters, AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]), (done, count) => { if (!controller.signal.aborted) setExportState({ pending: true, done, total: count, message: "Preparing the complete filtered CSV…", error: false }); });
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(new Blob(result.parts, { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `omnisense-simulated-records-${malaysiaDay(Date.parse(filters.start))}.csv`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportState({ pending: false, done: result.count, total: result.count, message: `CSV prepared · ${result.count.toLocaleString()} matching records`, error: false });
    } catch (error) {
      setExportState(previous => ({ ...previous, pending: false, message: controller.signal.aborted ? "Export cancelled · no partial CSV downloaded" : error instanceof Error ? error.message : "Export failed. Please retry.", error: !controller.signal.aborted }));
    } finally { if (exportController.current === controller) exportController.current = null; }
  }
  return <section className="sr-workspace" hidden={!active} aria-label="Operating records workspace">
    <div className="sr-heading"><div><h1 id="sr-heading" tabIndex={-1}>The operating record.</h1><p>Trace what was requested, what was reported, and the evidence behind it.</p></div><button className="sr-primary" onClick={() => void exportCsv()} disabled={dirty || pendingFocus || state.loading || !!state.error || exportState.pending || !total}>{exportState.pending ? "Preparing CSV…" : "Export filtered CSV ↓"}</button></div>
    <form className="sr-filter-form" onSubmit={event => { event.preventDefault(); apply(); }}><fieldset disabled={exportState.pending}>
      <div className="sr-filter-main"><label className="sr-search">Search stored records<input type="search" aria-label="Search operating records" maxLength={120} placeholder="Reason, node, event or related ID" value={draft.search} onChange={event => update({ search: event.target.value })} /></label><label>Date range<select aria-label="Operating records date range" value={draft.range} onChange={event => update({ range: event.target.value as Draft["range"] })}><option value="24">24 hours</option><option value="168">7 days</option><option value="custom">Custom dates</option></select></label><button className="sr-secondary" type="submit">Apply filters</button></div>
      {draft.range === "custom" && <div className="sr-custom-dates"><label>From · Malaysia date<input type="date" aria-label="From Malaysia date" value={draft.from} max={malaysiaDay(Date.now())} onChange={event => update({ from: event.target.value })} /></label><label>Through · Malaysia date<input type="date" aria-label="Through Malaysia date" value={draft.to} max={malaysiaDay(Date.now())} onChange={event => update({ to: event.target.value })} /></label><p>Inclusive local dates · up to seven days</p></div>}
      <div className="sr-filter-bottom"><div className="sr-categories" role="group" aria-label="Operating record categories">{quickRecordCategories.map(q => <button key={q.value} type="button" aria-pressed={draft.category === q.value} onClick={() => apply({ ...draft, category: q.value })}>{q.label}</button>)}</div><details className="sr-advanced"><summary>Advanced filters{advancedCount > 0 && ` · ${advancedCount} active`}</summary><div className="sr-advanced-fields"><label>Stored event category<select aria-label="Advanced record category" value={draft.category} onChange={event => update({ category: event.target.value as RecordCategory })}><option value="ALL">All stored records</option><option value="OPERATIONS">Operating events only</option>{Object.entries(eventTypeLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>Requested cooling mode<select aria-label="Requested cooling mode" value={draft.mode} onChange={event => update({ mode: event.target.value as Draft["mode"] })}><option value="">Any requested mode</option>{Object.entries(modeLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>Search scope<select aria-label="Operating record search scope" value={draft.searchField} onChange={event => update({ searchField: event.target.value as SearchField })}><option value="all">Descriptions and identifiers</option><option value="text">Stored payload text only</option><option value="event_id">Event ID only</option><option value="correlation_id">Correlation ID only</option></select></label></div><p>Requested-mode filtering matches stored decision and override-request fields. It does not infer a mode for reports or forecasts.</p></details></div>
    </fieldset></form>
    {dirty && <p className="sr-filter-pending" role="status">Filters changed · showing the last applied query. Apply filters before exporting.</p>}
    {filterError && <div className="sa-notice" role="alert">{filterError}</div>}
    <div className="sr-snapshot"><p>Snapshot <time title={snapshot.at}>{malaysiaTime(snapshot.at)} MYT</time> · sequence ≤ {snapshot.sequence}</p><button aria-label="Reload operating records" disabled={state.loading || exportState.pending} onClick={() => setRetry(n => n + 1)}>Reload records ↻</button>{data.frame.sequence > snapshot.sequence && <button disabled={exportState.pending || dirty} onClick={() => apply()}>Newer records available · update snapshot ↗</button>}</div>
    {exportState.message && <div className="sr-export-status" role={exportState.error ? "alert" : "status"}><div><strong>{exportState.message}</strong>{exportState.pending && <><progress max={Math.max(1, exportState.total)} value={exportState.done} /><span>{exportState.done.toLocaleString()} / {exportState.total.toLocaleString()} records · pinned snapshot</span></>}</div>{exportState.pending && <button onClick={() => exportController.current?.abort()} aria-label="Cancel operating CSV export">Cancel export ×</button>}</div>}
    {state.error && <div className="sa-notice" role="alert"><strong>Operating records could not refresh</strong><p>{state.error}{state.result && " Cached records for this exact query remain visible."}</p><button disabled={exportState.pending} onClick={() => setRetry(n => n + 1)}>Retry this query</button></div>}
    <div className="sr-results-heading"><h2 ref={resultsHeading} id="sr-results-heading" tabIndex={-1}>Recorded chronology</h2><span role="status">{state.loading || pendingFocus ? "Reading stored records…" : state.error ? state.result ? `${total.toLocaleString()} cached matching records` : "Record count unavailable" : `${total.toLocaleString()} matching records · newest first`}</span></div>
    <p className="sr-query-note">{malaysiaTime(filters.start)}–{malaysiaTime(filters.end)} MYT · {filters.category === "ALL" ? "All stored event types" : filters.category === "OPERATIONS" ? "Operating events" : eventTypeLabels[filters.category]}{filters.search && ` · ${filters.searchField === "all" ? "Search" : filters.searchField}: “${filters.search}”`}{filters.mode && ` · requested ${modeLabels[filters.mode]}`}</p>
    <div aria-busy={state.loading || pendingFocus} data-records-ready={!state.loading && !pendingFocus && !state.error ? "true" : "false"}>
      {(state.loading || pendingFocus) && !rows.length ? <p className="sr-empty" role="status">Loading the filtered operating history…</p> : !rows.length && !state.error && <div className="sr-empty"><h3>No matching records</h3><p>No records match this complete server-side query. Try another category, date range or search.</p><button className="sr-secondary" disabled={exportState.pending} onClick={() => apply({ ...draft, category: "ALL", mode: "", search: "", searchField: "all" })}>Clear search and advanced filters</button></div>}
      {rows.length > 0 && <OperatingRecordLedger rows={rows} snapshot={snapshot} onSelect={context => onInspect({ eventId: context.row.event_id, snapshot, origin: "records", context })} />}
    </div>
    {total > 0 && <div className="sr-pagination"><span>{((page - 1) * RECORD_PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * RECORD_PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()} · page {page} / {Math.ceil(total / RECORD_PAGE_SIZE)}</span><div><button aria-label="Previous operating records page" disabled={page === 1 || state.loading || exportState.pending} onClick={() => { setPage(p => p - 1); focusResults.current = true; }}>← Previous</button><button aria-label="Next operating records page" disabled={page * RECORD_PAGE_SIZE >= total || state.loading || exportState.pending} onClick={() => { setPage(p => p + 1); focusResults.current = true; }}>Next →</button></div></div>}
    <div className="sr-workspace-footer"><p>Server-side search covers the full matching dataset. CSV exports every filtered page at this pinned snapshot, with UTC and explicit Malaysia-local timestamps.</p><button onClick={onHistory}>Return to Usage &amp; Cooling ↗</button></div>
  </section>;
}

export function OperatingRecordLedger({ rows, snapshot, onSelect }: { rows: RecordContext[]; snapshot: RecordSnapshot; onSelect: (context: RecordContext) => void }) {
  return <ol className="sr-ledger" aria-label="Chronological operating events">{rows.map((context, index) => {
    const e = context.row.event, view = recordPresentation(context), report = displayedReport(context), day = malaysiaDay(Date.parse(e.occurred_at));
    const newDay = !index || malaysiaDay(Date.parse(rows[index - 1].row.occurred_at)) !== day;
    return <li key={e.event_id}>{newDay && <h3 className="sr-day">{day} <span>Malaysia · UTC+08:00</span></h3>}<button className="sr-entry" onClick={() => onSelect(context)} aria-label={`Inspect ${view.title}, ${malaysiaTime(e.occurred_at)} MYT`}><time dateTime={e.occurred_at} title={e.occurred_at}>{malaysiaTime(e.occurred_at).split(", ").at(-1)}</time><i className={`sr-event-dot sr-dot-${e.event_type}`} aria-hidden="true" /><span className="sr-entry-main"><span className="sr-entry-type">{view.category}</span><strong>{view.title}</strong><span>{view.reason}</span></span><span className="sr-entry-context">{context.decision && <span>{modeLabels[context.decision.payload.requested_mode]}</span>}{report && <span>{report.payload.status.toLowerCase()} · {outputLabel(report.payload.reported_output)}</span>}<small>{context.warnings.length ? "Review missing / unmatched links" : "Exact frame matched"} <span aria-hidden="true">↗</span></small></span></button></li>;
  })}</ol>;
}
