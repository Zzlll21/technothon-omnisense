import { readFileSync } from 'node:fs';
import ts from 'typescript';

export function sourceUrl(path, rewrites = []) {
  let output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [from, to] of rewrites) output = output.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}
export async function compileSource(path, rewrites = []) { return import(sourceUrl(path, rewrites)); }
const contract = new URL('../../../packages/sdp-contract/dist/index.js', import.meta.url).href;
export const runtimeRewrite = [['../../../../packages/sdp-contract/src', contract]];
const model = await compileSource(new URL('../../../services/sdp-generator/src/model.ts', import.meta.url), [['../../../packages/sdp-contract/dist/index.js', contract]]);

// Test-only records from the existing model. Never imported into application code.
export function overviewFixture(anchor = '2026-10-21T04:50:00.000Z', history = false) {
  const definition = model.createRun('55555555-5555-4555-8555-555555555555', anchor);
  const events = [];
  const frames = [], samples = [];
  let tick;
  do {
    tick = model.generateTick(definition, tick?.checkpoint ?? null);
    if (history) {
      frames.push({ run_id: definition.run_id, zone_id: 'zone-1', ...tick.frame, inserted_at: anchor });
      samples.push(...tick.samples.map(sample => ({ run_id: definition.run_id, zone_id: 'zone-1', ...sample, sequence: tick.frame.sequence, inserted_at: anchor })));
    }
    events.push(...tick.events.map((event, ordinal) => ({ run_id: definition.run_id, zone_id: 'zone-1', sequence: tick.frame.sequence, ordinal, event_id: event.event_id, event_type: event.event_type, occurred_at: event.occurred_at, event })));
  } while (tick.frame.simulated_at < anchor);
  const scope = { run_id: definition.run_id, zone_id: 'zone-1' };
  return {
    sdp_runs: [{ run_id: definition.run_id, status: 'ACTIVE', model_version: definition.model_version, last_sequence: tick.frame.sequence, last_simulated_at: anchor, history_start: definition.history_start, live_anchor: anchor, updated_at: anchor, created_at: anchor }],
    sdp_zones: [{ ...scope, room_id: 'demo-room', name: 'SDP Demo Cooling Zone', config: definition.config }],
    sdp_nodes: definition.config.payload.required_nodes.map(node => ({ ...scope, ...node, required: true })),
    sdp_zone_frames: history ? frames : [{ ...scope, ...tick.frame, inserted_at: anchor }],
    sdp_node_samples: history ? samples : tick.samples.map(sample => ({ ...scope, ...sample, sequence: tick.frame.sequence, inserted_at: anchor })),
    sdp_events: events
  };
}
export function selectRows(rows, filters, orders, limit = Infinity) {
  const fieldValue=(row,field)=>field.split(/->>?/).reduce((v,key)=>v?.[key],row);
  const like=(raw,pattern)=>{
    let regex='';for(let i=0;i<pattern.length;i++){let c=pattern[i];if(c==='\\'&&i+1<pattern.length)c=pattern[++i];else if(c==='%'){regex+='.*';continue;}else if(c==='_'){regex+='.';continue;}regex+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
    return raw!=null&&new RegExp(`^${regex}$`,'is').test(typeof raw==='object'?JSON.stringify(raw):String(raw));
  };
  const result = rows.filter(row => filters.every(([method, field, value]) => {const actual=fieldValue(row,field);return method === 'eq' ? actual === value : method === 'neq' ? actual !== value : method === 'lte' ? actual <= value : method === 'lt' ? actual < value : method === 'gte' ? actual >= value : method === 'gt' ? actual > value : method === 'ilike' ? like(actual,value) : value.includes(actual);}));
  result.sort((a, b) => {
    for (const [field, ascending] of orders) {
      const comparison = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
      if (comparison) return ascending ? comparison : -comparison;
    }
    return 0;
  });
  return result.slice(0, limit);
}
export function fakeClient(tables, intercept) {
  const queries = [];
  return { queries, from(table) {
    const query = { table, filters: [], orders: [], limit: Infinity };
    const chain = {
      select(columns, options) { query.columns = columns; query.count = options?.count; return chain; },
      eq(field, value) { query.filters.push(['eq', field, value]); return chain; },
      neq(field, value) { query.filters.push(['neq', field, value]); return chain; },
      lte(field, value) { query.filters.push(['lte', field, value]); return chain; },
      lt(field, value) { query.filters.push(['lt', field, value]); return chain; },
      gte(field, value) { query.filters.push(['gte', field, value]); return chain; },
      gt(field, value) { query.filters.push(['gt', field, value]); return chain; },
      in(field, value) { query.filters.push(['in', field, value]); return chain; },
      ilike(field, value) { query.filters.push(['ilike', field, value]); return chain; },
      order(field, options = {}) { query.orders.push([field, options.ascending !== false]); return chain; },
      limit(value) { query.limit = value; return chain; },
      range(start, end) { query.offset = start; query.limit = end - start + 1; return chain; },
      abortSignal(signal) { query.signal = signal; return chain; },
      then(resolve, reject) { queries.push(query); return Promise.resolve().then(() => {
        if (query.signal?.aborted) throw new Error('Aborted');
        const selected=selectRows(tables[table] ?? [],query.filters,query.orders);
        return intercept?.(query, queries) ?? { data: selected.slice(query.offset ?? 0, (query.offset ?? 0) + query.limit), count: query.count ? selected.length : undefined, error: null };
      }).then(resolve, reject); }
    };
    return chain;
  } };
}
