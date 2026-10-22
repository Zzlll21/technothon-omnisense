/* Illustrative operating records. Exactly one zone and two nodes; no service connections. */
(() => {
  const end = Date.parse('2026-10-22T13:20:00+08:00');
  const start = end - 7 * 86400000;
  const modes = ['Normal', 'Reduced', 'Pre-cooling'];
  const parts = t => {
    const d = new Date(t + 8 * 3600000);
    return { day:d.toISOString().slice(0,10), minute:d.getUTCHours()*60+d.getUTCMinutes(), weekday:d.getUTCDay() };
  };
  function sample(t){
    const {day,minute:m}=parts(t);
    const gap=m>=260&&m<268;
    const stale=m>=600&&m<612;
    let occupancy='Vacant';
    if((m>=510&&m<600)||(m>=660&&m<750)||(m>=840&&m<960))occupancy='Occupied';
    if(stale||(m>=750&&m<758)||gap)occupancy='Uncertain';
    let mode='Reduced';
    if(occupancy==='Occupied'||occupancy==='Uncertain'||(m>=612&&m<622)||(m>=758&&m<768))mode='Normal';
    if((m>=490&&m<510)||(m>=640&&m<660)||(m>=820&&m<840))mode='Pre-cooling';
    if(gap)mode=null;
    const base=25.6+.65*Math.sin((m-800)/120)+.25*Math.sin((m-800)/23);
    const node1Valid=!gap&&!stale,node2Valid=!gap;
    const disagreement=m>=750&&m<758;
    const nodes=[
      {id:'node-01',name:'Node 01',temperature:node1Valid?+(base.toFixed(1)):null,humidity:node1Valid?Math.round(60+2*Math.sin((m-800)/75)):null,occupancy:node1Valid?(disagreement?'Occupied':occupancy):'Uncertain',valid:node1Valid,ageSeconds:node1Valid?6:(gap?480:720),status:node1Valid?'Fresh':'Stale'},
      {id:'node-02',name:'Node 02',temperature:node2Valid?+((base+.4+.1*Math.sin((m-800)/50)).toFixed(1)):null,humidity:node2Valid?Math.round(58+2*Math.sin((m-800)/80)):null,occupancy:node2Valid?(disagreement?'Vacant':stale?'Vacant':occupancy):'Uncertain',valid:node2Valid,ageSeconds:node2Valid?12:480,status:node2Valid?'Fresh':'Stale'}
    ];
    return {t,day,minute:m,occupancy,mode,nodes,coverage:mode!==null};
  }
  const samples=[];
  for(let t=start;t<=end;t+=60000)samples.push(sample(t));
  function forecast(t){
    const p=parts(t),base=t-p.minute*60000-new Date(t+8*3600000).getUTCSeconds()*1000;
    const next=[510,660,840].find(m=>m>p.minute)??(1440+510);
    return {id:'FRC-'+p.day.replaceAll('-','')+'-'+String(p.minute),generated:t,expected:base+next*60000,restart:base+(next-20)*60000,windowStart:base+(next-5)*60000,windowEnd:base+(next+10)*60000,source:'Historical occupancy pattern',quality:'Moderate',leadMinutes:20};
  }
  function explanation(s,f){
    if(s.mode===null)return 'Requested-mode records are unavailable in this interval. Operation duration is left unclassified.';
    if(s.mode==='Pre-cooling')return 'The next expected use is approaching. Pre-cooling is requested 20 minutes before the forecast time while the zone is still vacant.';
    if(s.occupancy==='Uncertain')return s.nodes.some(n=>!n.valid)?'Node 01 evidence is stale, so zone occupancy remains Uncertain. Normal mode is requested until fresh evidence returns.':'The fresh node classifications disagree. Zone occupancy is Uncertain, so Normal mode is requested as a cautious decision.';
    if(s.occupancy==='Occupied')return 'Both node readings support occupancy. Normal cooling is requested for the shared zone.';
    if(s.mode==='Normal')return 'Vacancy has been detected. The recorded request remains Normal during a short transition before Reduced mode.';
    return 'Both nodes support vacancy. Expected use is outside the pre-cooling lead window, so Reduced mode is requested.';
  }
  const events=[];
  let previous=null;
  const append=(ev)=>events.push(ev);
  samples.forEach((s,index)=>{
    const change=!previous||s.mode!==previous.mode;
    const evidenceChange=previous&&s.occupancy!==previous.occupancy;
    const forecastUpdate=[475,625,795].includes(s.minute);
    const idBase=s.day.replaceAll('-','')+'-'+String(s.minute).padStart(4,'0');
    const f=forecast(s.t);
    if(forecastUpdate)append({id:'FRC-'+idBase,t:s.t,kind:'Forecast',title:'Expected-use window refreshed',explanation:'Historical occupancy records place the next use near '+clock(f.expected)+'. A 20-minute lead places the planned restart at '+clock(f.restart)+'.',mode:s.mode,occupancy:s.occupancy,snapshot:s,forecast:f});
    if(evidenceChange)append({id:'EVD-'+idBase,t:s.t,kind:'Evidence',title:s.occupancy==='Uncertain'?'Occupancy evidence became uncertain':s.occupancy+' evidence recorded',explanation:s.occupancy==='Uncertain'?(s.nodes.some(n=>!n.valid)?'Fresh evidence is unavailable from a sensor. Stale readings are excluded and occupancy remains Uncertain.':'The fresh nodes disagree: Node 01 reports Occupied and Node 02 reports Vacant. The zone classification is Uncertain.'):'The node evidence now supports '+s.occupancy.toLowerCase()+' occupancy for the shared zone.',mode:s.mode,occupancy:s.occupancy,snapshot:s,forecast:f});
    if(change||evidenceChange||forecastUpdate){
      const id='DEC-'+idBase;
      const event={id,t:s.t,kind:s.mode===null?'Coverage':'Decision',title:s.mode===null?'Requested-operation gap':s.mode+' mode requested',explanation:explanation(s,f),mode:s.mode,occupancy:s.occupancy,snapshot:s,forecast:f,requestId:id};
      append(event);
      if(s.mode!==null){
        const mismatch=s.day==='2026-10-20'&&s.minute===820;
        append({id:'OUT-'+idBase+'-03',t:s.t+3000,kind:'Reported output',title:mismatch?'Simulated output differs from request':'Simulated '+s.mode+' output reported',explanation:mismatch?'The simulated report still contains Reduced while the linked request is Pre-cooling. A subsequent report is recorded separately.':'The simulated reported mode matches the linked request. This is a recorded software output, not physical HVAC actuation.',mode:s.mode,reported:mismatch?'Reduced':s.mode,occupancy:s.occupancy,snapshot:s,forecast:f,requestId:id,mismatch});
        if(mismatch)append({id:'OUT-'+idBase+'-18',t:s.t+18000,kind:'Reported output',title:'Simulated output matched after 18 seconds',explanation:'A later simulated Pre-cooling report now matches the linked request. Both reports remain in the operating record.',mode:s.mode,reported:s.mode,occupancy:s.occupancy,snapshot:s,forecast:f,requestId:id,mismatch:false});
      }
    }
    previous=s;
  });
  function clock(t,seconds=false){return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{})}).format(new Date(t));}
  events.sort((a,b)=>b.t-a.t||a.id.localeCompare(b.id));
  const latestDecision=events.find(e=>e.kind==='Decision');
  const currentForecast=events.find(e=>e.kind==='Forecast').forecast;
  window.OMNI={start,end,samples,events,current:samples.at(-1),latestDecision,currentForecast,modes,clock,parts,sample,forecast};
})();
