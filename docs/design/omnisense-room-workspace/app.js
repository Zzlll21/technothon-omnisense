document.addEventListener('alpine:init',()=>{
  Alpine.data('omni',()=>({
    view:'floor',floorSelection:'open-office',range:'24h',nodeRange:'1h',selectedNode:'node-01',drawer:null,selectedEventId:null,
    floorSpaces:[{id:'open-office',name:'Open Office'},{id:'conference',name:'Conference Room'},{id:'meeting',name:'Meeting Room'},{id:'private',name:'Private Office'},{id:'collaborative',name:'Collaborative Workspace'},{id:'pantry',name:'Pantry & shared facilities'}],
    query:'',typeFilter:'All events',modeFilter:'All modes',occupancyFilter:'All occupancy',page:1,
    selectedTime:null,exported:false,closeTimer:null,trigger:null,
    init(){
      const p=new URLSearchParams(location.search),v=p.get('view');
      if(['floor','room','history','records'].includes(v))this.view=v;
      const state=p.get('state');
      if(state==='history')this.view='history';
      if(state==='records')this.view='records';
      if(state==='node'){this.view='room';this.$nextTick(()=>this.openNode('node-01'));}
      if(state==='forecast'){this.view='room';this.$nextTick(()=>this.openForecast());}
      if(state==='uncertain'){this.range='7d';this.view='records';this.$nextTick(()=>this.openEvent(OMNI.events.find(e=>e.kind==='Decision'&&e.occupancy==='Uncertain').id));}
      if(state==='stale'){this.view='records';this.$nextTick(()=>this.openEvent(OMNI.events.find(e=>e.kind==='Decision'&&e.snapshot.nodes.some(n=>!n.valid)).id));}
      if(state==='mismatch'){this.range='7d';this.view='records';this.$nextTick(()=>this.openEvent(OMNI.events.find(e=>e.mismatch).id));}
      if(state==='empty'){this.view='records';this.query='No matching record';}
      window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();this.navigate('records');this.$nextTick(()=>this.$refs.search.focus());}});
      window.addEventListener('popstate',()=>{const v=new URLSearchParams(location.search).get('view')||'floor';if(['floor','room','history','records'].includes(v))this.navigate(v,false);});
    },
    get now(){return OMNI.current;},get nodes(){return OMNI.current.nodes;},
    get zoneTemp(){const list=this.nodes.filter(n=>n.valid);return (list.reduce((a,n)=>a+n.temperature,0)/list.length).toFixed(1);},
    get zoneHumidity(){const list=this.nodes.filter(n=>n.valid);return Math.round(list.reduce((a,n)=>a+n.humidity,0)/list.length);},
    get forecast(){return OMNI.currentForecast;},get decision(){return OMNI.latestDecision;},
    get latestOutput(){return OMNI.events.find(e=>e.kind==='Reported output'&&e.requestId===this.decision.id);},
    get node(){return this.nodes.find(n=>n.id===this.selectedNode);},
    get event(){return OMNI.events.find(e=>e.id===this.selectedEventId)||this.decision;},
    get linkedDecision(){return OMNI.events.find(e=>e.id===this.event.requestId)||this.event;},
    get correlatedOutputs(){return OMNI.events.filter(e=>e.kind==='Reported output'&&e.requestId===this.linkedDecision.id).sort((a,b)=>a.t-b.t);},
    get eventDecision(){return OMNI.events.find(e=>e.kind==='Decision'&&(e.id===this.event.requestId||e.t===this.event.t));},
    reportSummary(e){if(e.kind==='Reported output')return e.mismatch?'Mismatch':e.reported;const report=OMNI.events.find(r=>r.kind==='Reported output'&&r.requestId===e.id);return report?report.reported:'—';},
    get nodeHistory(){const h={'1h':1,'24h':24,'7d':168}[this.nodeRange];const list=OMNI.samples.filter(s=>s.t>=OMNI.end-h*3600000);return [0,.25,.5,.75,1].map(r=>list[Math.round((list.length-1)*r)]).reverse();},
    get windowStart(){return OMNI.end-(this.range==='7d'?7:1)*86400000;},
    get windowSamples(){return OMNI.samples.filter(s=>s.t>=this.windowStart&&s.t<OMNI.end);},
    get stats(){
      const totals={Normal:0,Reduced:0,'Pre-cooling':0,Unknown:0,vacantNormal:0};
      const matrix={Occupied:{Normal:0,Reduced:0,'Pre-cooling':0},Vacant:{Normal:0,Reduced:0,'Pre-cooling':0},Uncertain:{Normal:0,Reduced:0,'Pre-cooling':0}};
      for(const s of this.windowSamples){if(s.mode){totals[s.mode]++;matrix[s.occupancy][s.mode]++;if(s.mode==='Normal'&&s.occupancy==='Vacant')totals.vacantNormal++;}else totals.Unknown++;}
      const total=this.windowSamples.length;
      return {...totals,total,known:total-totals.Unknown,coverage:((total-totals.Unknown)/total*100).toFixed(1),matrix};
    },
    get events(){return OMNI.events.filter(e=>e.t>=this.windowStart&&e.t<=OMNI.end);},
    get filtered(){const q=this.query.trim().toLowerCase();return this.events.filter(e=>(this.typeFilter==='All events'||e.kind===this.typeFilter)&&(this.modeFilter==='All modes'||e.mode===this.modeFilter)&&(this.occupancyFilter==='All occupancy'||e.occupancy===this.occupancyFilter)&&(!q||(e.id+' '+e.title+' '+e.explanation+' '+e.occupancy+' '+(e.requestId||'')).toLowerCase().includes(q)));},
    get pageEvents(){return this.filtered.slice((this.page-1)*12,this.page*12);},
    get pages(){return Math.max(1,Math.ceil(this.filtered.length/12));},
    get historyPoint(){return OMNI.samples.reduce((a,b)=>Math.abs(b.t-(this.selectedTime??OMNI.end))<Math.abs(a.t-(this.selectedTime??OMNI.end))?b:a);},
    time(t,seconds=false){return OMNI.clock(t,seconds);},
    date(t){return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short'}).format(new Date(t));},
    duration(m){return Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m';},
    modeClass(mode){return {'Normal':'normal','Reduced':'reduced','Pre-cooling':'precool'}[mode]||'unknown';},
    occupancyClass(occ){return occ.toLowerCase();},
    get floorSpaceName(){return this.floorSpaces.find(s=>s.id===this.floorSelection)?.name||'Open Office';},
    selectFloorZone(id){if(!this.floorSpaces.some(s=>s.id===id))return;this.floorSelection=id;if(id==='open-office')this.enterZone();else if(matchMedia('(max-width:800px)').matches)this.$nextTick(()=>this.$refs.floorInspector.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'}));},
    enterZone(){this.floorSelection='open-office';this.navigate('room');},
    navigate(v,push=true){
      const focus=()=>this.$nextTick(()=>{if(v==='floor')this.$refs.floorHeading?.focus({preventScroll:true});if(v==='room')this.$refs.zoneHeading?.focus({preventScroll:true});});
      const change=()=>{this.view=v;this.selectedTime=null;window.scrollTo({top:0,behavior:'instant'});if(push){const url=new URL(location.href);url.searchParams.delete('state');url.searchParams.set('view',v);history.pushState({view:v},'',url);}return this.$nextTick();};
      if(this.view===v)return;
      if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!this.transitioning){this.transitioning=true;document.startViewTransition(change).finished.finally(()=>{this.transitioning=false;focus();});}else change().then(focus);
    },
    setRange(v){this.range=v;this.page=1;this.selectedTime=null;},
    clearFilters(){this.query='';this.typeFilter='All events';this.modeFilter='All modes';this.occupancyFilter='All occupancy';this.page=1;},
    showRecords(mode=null,occupancy=null){this.clearFilters();if(mode)this.modeFilter=mode;if(occupancy)this.occupancyFilter=occupancy;this.navigate('records');},
    openNode(id){this.selectedNode=id;this.openDrawer('node');},
    openForecast(){this.openDrawer('forecast');},
    openEvent(id){this.selectedEventId=id;this.openDrawer('event');},
    openDrawer(type){clearTimeout(this.closeTimer);if(!this.$refs.detail.open){this.trigger=document.activeElement;while(this.trigger?.shadowRoot?.activeElement)this.trigger=this.trigger.shadowRoot.activeElement;}this.drawer=type;this.$nextTick(()=>{this.$refs.detail.classList.remove('leaving');if(!this.$refs.detail.open)this.$refs.detail.showModal();this.$refs.close.focus();});},
    closeDrawer(){const close=()=>{this.$refs.detail.close();this.drawer=null;this.trigger?.focus();};if(matchMedia('(prefers-reduced-motion: reduce)').matches){close();return;}this.$refs.detail.classList.add('leaving');this.closeTimer=setTimeout(close,150);},
    exportCSV(){
      const rows=[['Timestamp (MYT)','Record ID','Event type','Occupancy','Requested mode','Simulated reported mode','Linked request','Explanation'],...this.filtered.map(e=>[this.date(e.t)+' 2026 '+this.time(e.t,true),e.id,e.kind,e.occupancy,e.mode??'Unknown',e.reported??'',e.requestId??'',e.explanation])];
      const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='omnisense-operating-record-'+this.range+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.exported=true;setTimeout(()=>this.exported=false,2400);
    },
    selectChartTime(event){
      if(event.target.closest('[data-event]'))return;
      const svg=event.currentTarget,rect=svg.getBoundingClientRect();
      const ratio=Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*1100-112)/956));
      this.selectedTime=this.windowStart+(OMNI.end-this.windowStart)*ratio;
    },
    get selectedTimeEvent(){return this.events.filter(e=>e.kind==='Decision').reduce((a,b)=>Math.abs(b.t-(this.selectedTime??OMNI.end))<Math.abs(a.t-(this.selectedTime??OMNI.end))?b:a,this.decision);},
    get operationBar(){return ['Normal','Reduced','Pre-cooling','Unknown'].map(m=>`<span class="${this.modeClass(m)}" style="width:${this.stats[m]/this.stats.total*100}%" title="${m}: ${this.duration(this.stats[m])}"></span>`).join('');},
    get horizonSVG(){
      const start=OMNI.end-50*60000,end=OMNI.end+70*60000,x=t=>112+(t-start)/(end-start)*956;
      const future=x(OMNI.end),f=this.forecast;
      const past=OMNI.samples.filter(s=>s.t>=start&&s.t<OMNI.end);
      const band=(field,top)=>this.segments(past,field).map(s=>{const color=field==='mode'?s.value==='Normal'?'#315f50':s.value==='Reduced'?'#91a88a':'#c8a553':s.value==='Uncertain'?'#d3b476':'#d9e2d4';const width=x(Math.min(s.end,OMNI.end))-x(s.start);return `<g><title>${s.value} · recorded ${this.time(s.start)}–${this.time(Math.min(s.end,OMNI.end))}</title><rect x="${x(s.start)}" y="${top}" width="${width}" height="29" rx="2" fill="${color}"/>${width>95?`<text x="${x(s.start)+12}" y="${top+19}" style="fill:${field==='mode'&&s.value==='Normal'?'#fff':'#183e35'}">${s.value} · ${field==='mode'?'requested':'recorded'}</text>`:''}</g>`;}).join('');
      return `<svg viewBox="0 0 1100 174" role="img" aria-label="Current Reduced request, pre-cooling planned at13:40, expected room use14:00 with a13:55 to14:10 forecast window.">
        <defs><pattern id="planned" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7 7 0" stroke="#a49061" stroke-width="1"/></pattern></defs>
        <g class="axis">${[750,780,800,820,840,870].map(m=>{const t=OMNI.end+(m-800)*60000;return `<text x="${x(t)}" y="20" text-anchor="middle">${this.time(t)}</text>`;}).join('')}</g>
        <text x="0" y="62">Occupancy</text><text x="0" y="111">Cooling</text>
        <path d="M112 62H1068M112 111H1068" stroke="#d4ddd2"/>
        ${band('occupancy',44)}
        <rect x="${x(f.windowStart)}" y="44" width="${x(f.windowEnd)-x(f.windowStart)}" height="29" rx="3" fill="#f0ead9" stroke="#aa8c45" stroke-dasharray="4 3"/>
        <text x="${x(f.expected)+8}" y="39" class="gold">Expected use</text>
        ${band('mode',93)}
        <rect x="${future}" y="93" width="${x(f.restart)-future}" height="29" rx="2" fill="#e8eddf" stroke="#a2b79a" stroke-dasharray="3 3"/><text x="${future+10}" y="112">Reduced · planned</text>
        <rect x="${x(f.restart)}" y="93" width="${x(f.expected)-x(f.restart)}" height="29" rx="3" fill="url(#planned)" stroke="#aa8c45"/>
        <text x="${x(f.restart)+10}" y="112" class="dark">Pre-cooling · planned</text>
        <path d="M${future} 28V140" stroke="#214f43" stroke-dasharray="3 4"/>
        <text x="${future}" y="159" text-anchor="middle" class="ink">Now 13:20</text>
        <path d="M${x(f.restart)} 78V133" stroke="#9d7a2c"/><text x="${x(f.restart)}" y="159" text-anchor="middle" class="gold">Restart 13:40</text>
      </svg>`;
    },
    segments(list,field){const output=[];for(const item of list){const val=item[field];const last=output.at(-1);if(last&&last.value===val)last.end=item.t+60000;else output.push({start:item.t,end:item.t+60000,value:val});}return output;},
    get historySVG(){
      const list=this.windowSamples,x=t=>112+(t-this.windowStart)/(OMNI.end-this.windowStart)*956;
      const y=v=>106-(v-24)/4*55;
      const temperaturePath=index=>{let path='',valid=false;list.filter((s,i)=>i%Math.max(1,Math.floor(list.length/300))===0||!s.nodes[index].valid||(i>0&&!list[i-1].nodes[index].valid)||i===list.length-1).forEach(s=>{const value=s.nodes[index].temperature;if(value===null){valid=false;return;}path+=(valid?'L':'M')+x(s.t).toFixed(1)+','+y(value).toFixed(1);valid=true;});return path;};
      const blocks=(field,top,colors)=>this.segments(list,field).map(s=>`<rect x="${x(s.start)}" y="${top}" width="${Math.max(.4,x(Math.min(s.end,OMNI.end))-x(s.start))}" height="24" fill="${colors[s.value]||'#e0e1d7'}"/>`).join('');
      const events=this.events.filter(e=>e.kind==='Decision'&&e.mode==='Pre-cooling');
      const forecasts=OMNI.events.filter(e=>e.kind==='Forecast'&&e.forecast.windowStart>=this.windowStart&&e.forecast.windowEnd<=OMNI.end);
      const reports=this.events.filter(e=>e.kind==='Reported output');
      return `<svg viewBox="0 0 1100 360" role="group" aria-label="Aligned recorded node temperatures, occupancy, requested cooling modes and simulated report markers. Select a decision or output marker to inspect its record." @click="selectChartTime($event)">
        <g class="axis">${[0,.25,.5,.75,1].map(r=>{const t=this.windowStart+(OMNI.end-this.windowStart)*r;return `<path d="M${x(t)} 40V319" stroke="#dce2d7"/><text x="${x(t)}" y="347" text-anchor="${r===1?'end':'middle'}">${this.range==='7d'?this.date(t):this.time(t)}</text>`;}).join('')}</g>
        ${forecasts.map(e=>`<rect x="${x(e.forecast.windowStart)}" y="38" width="${x(e.forecast.windowEnd)-x(e.forecast.windowStart)}" height="79" fill="#eae1c9" opacity=".6"/>`).join('')}
        <text x="0" y="24">Temperature · °C</text>
        ${[24,26,28].map(v=>`<text x="88" y="${y(v)+4}" text-anchor="end">${v}°</text><path d="M112 ${y(v)}H1068" stroke="#dce2d7" stroke-dasharray="3 4"/>`).join('')}
        <path d="${temperaturePath(0)}" fill="none" stroke="#315f50" stroke-width="2"/><path d="${temperaturePath(1)}" fill="none" stroke="#a78232" stroke-width="2"/>
        <text x="0" y="161">Occupancy</text>${blocks('occupancy',143,{Occupied:'#315f50',Vacant:'#d4dfcd',Uncertain:'#d3b476'})}
        <text x="0" y="215">Requested</text>${blocks('mode',197,{Normal:'#315f50',Reduced:'#a2b79a','Pre-cooling':'#c8a553'})}
        <text x="0" y="257">Sim. reported</text><path d="M112 252H1068" stroke="#d4ddd2"/>
        ${reports.map(e=>`<g role="button" tabindex="0" data-event="${e.id}" aria-label="Inspect simulated ${e.reported} report at ${this.date(e.t)} ${this.time(e.t,true)}" @click.stop="openEvent('${e.id}')" @keydown.enter.prevent="openEvent('${e.id}')" @keydown.space.prevent="openEvent('${e.id}')"><rect x="${x(e.t)-2.5}" y="244" width="5" height="16" rx="1" fill="${e.mismatch?'#9c503c':e.reported==='Pre-cooling'?'#ad852c':e.reported==='Reduced'?'#809a74':'#315f50'}"/></g>`).join('')}
        <text x="0" y="302" class="muted">Pre-cooling</text><path d="M112 298H1068" stroke="#d4ddd2"/>
        ${events.map(e=>`<g role="button" tabindex="0" data-event="${e.id}" aria-label="Inspect Pre-cooling decision at ${this.date(e.t)} ${this.time(e.t)}" @click.stop="openEvent('${e.id}')" @keydown.enter.prevent="openEvent('${e.id}')" @keydown.space.prevent="openEvent('${e.id}')"><circle cx="${x(e.t)}" cy="298" r="6" fill="#aa822d" stroke="#f6f7f2" stroke-width="2"/></g>`).join('')}
        ${this.selectedTime?`<path d="M${x(this.selectedTime)} 36V319" stroke="#153f35" stroke-width="1.5"/><circle cx="${x(this.selectedTime)}" cy="298" r="4" fill="#153f35"/>`:''}
      </svg>`;
    },
    nodeChart(metric){
      const hours={'1h':1,'24h':24,'7d':168}[this.nodeRange],start=OMNI.end-hours*3600000;
      const list=OMNI.samples.filter(s=>s.t>=start),index=this.selectedNode==='node-01'?0:1;
      const x=t=>34+(t-start)/(OMNI.end-start)*320;
      const min=metric==='temperature'?23:54,max=metric==='temperature'?29:66,y=v=>91-(v-min)/(max-min)*70;
      const step=Math.max(1,Math.floor(list.length/100));let path='',lastValid=false;
      list.filter((s,i)=>i%step===0||!s.nodes[index].valid||(i>0&&!list[i-1].nodes[index].valid)||i===list.length-1).forEach(s=>{const val=s.nodes[index][metric];if(val===null){lastValid=false;return;}path+=(lastValid?'L':'M')+x(s.t).toFixed(1)+','+y(val).toFixed(1);lastValid=true;});
      return `<svg viewBox="0 0 380 124" role="img" aria-label="${this.node.name} historical ${metric}, ${this.nodeRange}. Gaps are missing or invalid readings.">
        ${[min,(min+max)/2,max].map(v=>`<text x="2" y="${y(v)+4}">${v}</text><path d="M34 ${y(v)}H354" stroke="#dce2d7" stroke-dasharray="3 4"/>`).join('')}
        <path d="${path}" fill="none" stroke="${metric==='temperature'?'#315f50':'#8c7437'}" stroke-width="2"/>
        <text x="34" y="118">${this.nodeRange==='7d'?this.date(start):this.time(start)}</text><text x="354" y="118" text-anchor="end">${this.nodeRange==='7d'?this.date(OMNI.end):this.time(OMNI.end)}</text>
      </svg>`;
    },
    get nodeOccupancySVG(){
      const hours={'1h':1,'24h':24,'7d':168}[this.nodeRange],start=OMNI.end-hours*3600000,index=this.selectedNode==='node-01'?0:1;
      const list=OMNI.samples.filter(s=>s.t>=start&&s.t<OMNI.end).map(s=>({t:s.t,occupancy:s.nodes[index].occupancy}));
      const x=t=>34+(t-start)/(OMNI.end-start)*320;
      return `<svg viewBox="0 0 380 58" role="img" aria-label="${this.node.name} recorded Occupied, Vacant and Uncertain classifications over ${this.nodeRange}.">${this.segments(list,'occupancy').map(s=>`<rect x="${x(s.start)}" y="8" width="${Math.max(.4,x(Math.min(s.end,OMNI.end))-x(s.start))}" height="17" fill="${s.value==='Occupied'?'#315f50':s.value==='Uncertain'?'#d3b476':'#d4dfcd'}"/>`).join('')}<text x="34" y="49">${this.nodeRange==='7d'?this.date(start):this.time(start)}</text><text x="354" y="49" text-anchor="end">${this.nodeRange==='7d'?this.date(OMNI.end):this.time(OMNI.end)}</text></svg>`;
    }
  }));
});

