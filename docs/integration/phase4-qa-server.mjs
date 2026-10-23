// Test-only preview. Production code never imports these virtual fault/clock modules.
// Reads real SDP records; fault controls affect local query responses/freshness only.
// node phase4-qa-server.mjs <existing-dashboard-env-file>
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
process.loadEnvFile(resolve(process.argv[2]));
const app = resolve(import.meta.dirname, '../../apps/dashboard'), require = createRequire(resolve(app, 'package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
process.chdir(app);
const clientId = '\0phase4-qa-client', clockId = '\0phase4-qa-clock';
const plugin = {
  name: 'phase4-test-only-read-faults', enforce: 'pre',
  resolveId(source) {
    if (/\/lib\/supabase(?:\.ts)?$/.test(source)) return clientId;
    if (/\/hooks\/useOverview(?:\.ts)?$/.test(source)) return clockId;
  },
  load(id) {
    if (id === clientId) return `
      import { supabase as real } from '/src/lib/supabase.ts?phase4-real';
      export { supabaseConfigError } from '/src/lib/supabase.ts?phase4-real';
      function wrap(query, meta) { return new Proxy(query, { get(target, key) {
        const value = Reflect.get(target, key);
        if (key === 'then' && typeof value === 'function') return (resolve, reject) => { if(window.__phase4FailReads) return Promise.resolve({data:null,error:{code:'42501'}}).then(resolve,reject); const missing=window.__phase4MissingLinks && ((meta.table==='sdp_zone_frames' && meta.filters.some(f=>f[0]==='in'&&f[1]==='sequence')) || (meta.table==='sdp_events' && meta.filters.some(f=>f[0]==='in'&&f[1]==='event_id'))); const emptyRun=window.__phase4EmptyRun && meta.table==='sdp_runs'; const hidden=window.__phase4HideExact && meta.table==='sdp_events' && meta.filters.some(f=>f[0]==='eq'&&f[1]==='event_id'); return missing||hidden||emptyRun?Promise.resolve({data:[],error:null}).then(resolve,reject):value.call(target,resolve,reject); };
        return typeof value === 'function' ? (...args) => { if(['eq','in'].includes(key))meta.filters.push([key,args[0]]); const next=value.apply(target,args); return next && typeof next === 'object' ? wrap(next,meta) : next; } : value;
      }}); }
      export const supabase = real && new Proxy(real, { get(target,key) { const value=Reflect.get(target,key); if(key==='from') return (...args)=>wrap(value.apply(target,args),{table:args[0],filters:[]}); return typeof value==='function'?value.bind(target):value; }});
    `;
    if (id === clockId) return `
      import {useOverview as real} from '/src/hooks/useOverview.ts?phase4-real';
      import {useEffect,useState} from 'react';
      export function useOverview(){ const state=real(),[offset,setOffset]=useState(window.__phase4ClockOffset||0); useEffect(()=>{ const listener=()=>setOffset(window.__phase4ClockOffset||0); window.addEventListener('phase4-clock',listener); return()=>window.removeEventListener('phase4-clock',listener); },[]); return {...state,now:state.now+offset}; }
    `;
  },
  transformIndexHtml() { return [{ tag: 'script', injectTo: 'body', children: `
    const bar=document.createElement('aside');bar.id='phase4-qa-controls';bar.setAttribute('aria-label','Test-only read and freshness controls');bar.style.cssText='position:fixed;bottom:8px;left:8px;z-index:99999;padding:10px;background:#fff;border:1px solid #84622f;display:flex;gap:10px;flex-wrap:wrap;font:13px Segoe UI;max-width:calc(100% - 16px)';
    const status=document.createElement('span');status.textContent='QA only · live reads';bar.append(status);
    function button(label,fn){const b=document.createElement('button');b.textContent=label;b.style.cssText='padding:8px;min-height:40px';b.onclick=fn;bar.append(b);}
    button('Toggle read failures',()=>{window.__phase4FailReads=!window.__phase4FailReads;status.textContent=window.__phase4FailReads?'QA only · reads blocked locally':'QA only · live reads';});
    button('Toggle missing links',()=>{window.__phase4MissingLinks=!window.__phase4MissingLinks;status.textContent=window.__phase4MissingLinks?'QA only · linked reads omitted':'QA only · live reads';});
    button('Toggle missing exact record',()=>{window.__phase4HideExact=!window.__phase4HideExact;status.textContent=window.__phase4HideExact?'QA only · exact record read omitted':'QA only · live reads';});
    button('Toggle no active run',()=>{window.__phase4EmptyRun=!window.__phase4EmptyRun;status.textContent=window.__phase4EmptyRun?'QA only · active-run read omitted':'QA only · live reads';});
    button('Advance freshness clock',()=>{window.__phase4ClockOffset=600000;window.dispatchEvent(new Event('phase4-clock'));status.textContent='QA only · freshness clock +10 minutes';});
    button('Restore test conditions',()=>{window.__phase4FailReads=false;window.__phase4MissingLinks=false;window.__phase4HideExact=false;window.__phase4EmptyRun=false;window.__phase4ClockOffset=0;window.dispatchEvent(new Event('phase4-clock'));status.textContent='QA only · live reads';});
    document.body.append(bar);
  ` }]; }
};
const server = await createServer({ root: app, cacheDir: resolve(import.meta.dirname, '../../../phase4-qa-vite-cache'), plugins: [plugin], server: { host: '127.0.0.1', port: 8131, strictPort: true } });
await server.listen(); console.log('Test-only preview: http://127.0.0.1:8131/?experience=spatial&view=records');
