/* Shared presentation component. No service, query, forecast or control logic. */
(() => {
  const point = (x,y,z=0) => [450+(x-y)*.82,170+(x+y)*.36-z*.82];
  const coords = points => points.map(p=>p.map(v=>v.toFixed(2)).join(',')).join(' ');
  const polygon = (points,fill,stroke='none',extra='') => `<polygon points="${coords(points)}" fill="${fill}" stroke="${stroke}" stroke-width=".8" ${extra}/>`;
  const surface = (points,fill,stroke='none',extra='') => polygon(points.map(p=>point(...p)),fill,stroke,extra);
  const line = (a,b,color,width=1,extra='') => `<path d="M${point(...a).join(' ')}L${point(...b).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" ${extra}/>`;
  function box(x,y,w,d,h,z=0,colors=['#edf0e7','#c7d0c0','#a9b9a2']) {
    const [top,front,side]=colors;
    return surface([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,z+h],[x,y+d,z+h]],front)+
      surface([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,z+h],[x+w,y,z+h]],side)+
      surface([[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]],top);
  }
  function desk(x,y,withScreen=true) {
    let art=surface([[x-4,y+4,0],[x+137,y+4,0],[x+148,y+83,0],[x+8,y+83,0]],'#183e35','none','opacity=".055"');
    for(const [a,b] of [[3,5],[123,5],[3,58],[123,58]])art+=box(x+a,y+b,4,4,65,0,['#c2ccc0','#a2b09f','#849981']);
    art+=box(x,y,132,68,5,65,['#eadcc0','#d5c19b','#bea77e']);
    if(!withScreen){
      art+=box(x+45,y+21,28,34,1,70,['#f4f2e6','#dedccf','#c7cbbb']);
      art+=line([x+49,y+28,71.2],[x+69,y+28,71.2],'#bdc9b3',.8);
      art+=line([x+49,y+34,71.2],[x+69,y+34,71.2],'#bdc9b3',.8);
      return art;
    }
    art+=box(x+44,y+13,35,16,2,70,['#b7c3b3','#8e9e89','#7c9076']);
    art+=box(x+59,y+15,5,5,12,72,['#a6b1a3','#8d9d87','#6d8269']);
    art+=box(x+35,y+15,56,5,35,83,['#657c71','#29483e','#1d392f']);
    art+=surface([[x+38,y+20,86],[x+88,y+20,86],[x+88,y+20,115],[x+38,y+20,115]],'#385a4c');
    art+=surface([[x+40,y+20,111],[x+64,y+20,111],[x+83,y+20,88],[x+58,y+20,88]],'#a5c3ad','none','opacity=".16"');
    art+=box(x+37,y+43,49,18,1,70,['#e5e9e0','#c0cbb9','#a8b69f']);
    for(let i=1;i<5;i++)art+=line([x+39,y+44+i*3,71.2],[x+84,y+44+i*3,71.2],'#b6c3ad',.6);
    art+=box(x+102,y+42,13,19,1,70,['#f8f6ed','#dedac9','#ccc8b5']);
    art+=line([x+105,y+45,71.2],[x+112,y+45,71.2],'#b0bba5',.8);
    return art;
  }
  function chair(x,y,reverse=false) {
    const center=point(x+19,y+18,9);
    let art=`<ellipse cx="${center[0]}" cy="${center[1]+4}" rx="25" ry="9" fill="#233e30" opacity=".07"/>`;
    for(const [dx,dy] of [[-10,8],[45,6],[40,36],[-5,35]]) {
      art+=line([x+19,y+18,10],[x+dx,y+dy,3],'#879982',3);
      const p=point(x+dx,y+dy,3); art+=`<ellipse cx="${p[0]}" cy="${p[1]}" rx="3.5" ry="2.5" fill="#778b71"/>`;
    }
    art+=box(x+17,y+16,5,5,33,8,['#a8b69f','#8b9e81','#728a68']);
    art+=box(x,y,39,36,6,40,['#879d7b','#657c5c','#506c48']);
    art+=box(x,reverse?y:y+32,39,5,31,45,['#9baf90','#6f8963','#536e49']);
    art+=line([x+3,y+4,44],[x+3,y+4,56],'#5b7252',2.5)+line([x+35,y+4,44],[x+35,y+4,56],'#5b7252',2.5);
    art+=box(x-1,y+2,6,23,3,54,['#778f6a','#607956','#4e6845']);
    art+=box(x+34,y+2,6,23,3,54,['#778f6a','#607956','#4e6845']);
    return art;
  }
  function plant(x,y) {
    let art=box(x,y,23,23,23,0,['#d6d8cb','#c1c7b5','#a6b19a']);
    art+=surface([[x+3,y+3,23.2],[x+20,y+3,23.2],[x+20,y+20,23.2],[x+3,y+20,23.2]],'#7b8865');
    const [cx,cy]=point(x+12,y+12,28);
    for(const [dx,dy,r] of [[-13,-12,-35],[10,-18,28],[-4,-30,-8],[16,-4,54],[-16,1,-60],[1,-12,15]]) {
      art+=`<path d="M${cx} ${cy}q${dx*.6} ${dy*.5} ${dx} ${dy}" fill="none" stroke="#78905f" stroke-width="1.4"/>`;
      art+=`<ellipse cx="${cx+dx}" cy="${cy+dy}" rx="5" ry="12" fill="${dy<-20?'#839c6a':'#688851'}" transform="rotate(${r} ${cx+dx} ${cy+dy})"/>`;
    }
    return art;
  }
  function coverage(id) {
    // These are spatial sensing sub-areas, not desk assignments or HVAC zones.
    // Drawing coordinates and footprint shape remain schematic, not surveyed.
    const left=id===1, x=left?12:214, end=left?206:408;
    const boundary=[[x,17,.7],[end,17,.7],[end,307,.7],[x,307,.7]];
    return `<g class="coverage-area ${left?'left':'right'}" data-coverage-node="node-0${id}" aria-hidden="true">${surface(boundary,left?'#a3bd88':'#8db9ad',left?'#6b8a50':'#5c9286','class="coverage-footprint" stroke-dasharray="5 4"')}</g>`;
  }
  function node(id,x,y) {
    const p=point(x,y,170);
    return `<g class="office-node" data-node-id="node-0${id}" role="button" tabindex="0" aria-label="Inspect Node 0${id}">
      <circle cx="${p[0]}" cy="${p[1]}" r="26" class="node-hit" fill="transparent"/>
      ${surface([[x-24,y-24,175],[x+24,y-24,175],[x+24,y+24,175],[x-24,y+24,175]],'#f8fbf2','#a9bca0','opacity=".8" stroke-dasharray="3 3"')}
      <ellipse cx="${p[0]}" cy="${p[1]+1}" rx="23" ry="10" class="node-ring"/>
      ${box(x-11,y-11,22,22,5,165,['#fffef6','#dce5d2','#afc2a1'])}
      <circle class="sensor-led" cx="${p[0]}" cy="${p[1]-1}" r="3"/>
      <text x="${p[0]+28}" y="${p[1]+4}" class="node-index">0${id}</text>
    </g>`;
  }
  function scene() {
    let art=box(0,0,420,320,14,-14,['#e7dfcf','#cfc6b3','#b8b89f']);
    for(let y=18;y<320;y+=23)art+=line([0,y,.1],[420,y,.1],'#d1c6b1',.65);
    for(let y=18;y<320;y+=46)for(let x=65;x<420;x+=105)art+=line([x,y,.2],[x,y+23,.2],'#d1c6b1',.65);
    art+=surface([[50,176,.4],[356,176,.4],[356,291,.4],[50,291,.4]],'#d5ddcb','#c8d2bd');
    for(let y=185;y<291;y+=13)art+=line([54,y,.5],[352,y,.5],'#c1cdb7',.45);
    art+=coverage(1)+coverage(2);
    art+=surface([[4,4,1],[416,4,1],[416,316,1],[4,316,1]],'none','#41634a','class="shared-zone-boundary"');
    art+=box(-6,-6,6,326,130,0,['#f8faf3','#dce4d5','#bdccb6']);
    art+=box(0,-6,420,6,130,0,['#fffef8','#eaf0e4','#ced8c5']);
    art+=line([0,0,4],[0,320,4],'#b9c6ac',2)+line([0,0,4],[420,0,4],'#ced7c2',2);
    art+=surface([[75,-.1,45],[352,-.1,45],[352,-.1,113],[75,-.1,113]],'#b1c3b3','#b5c3b0');
    art+=surface([[80,.1,49],[347,.1,49],[347,.1,109],[80,.1,109]],'url(#office-window)');
    art+=surface([[80,.2,109],[130,.2,109],[183,.2,49],[133,.2,49]],'#fff','none','opacity=".3"');
    art+=surface([[217,.2,109],[246,.2,109],[299,.2,49],[270,.2,49]],'#fff','none','opacity=".18"');
    for(const x of [80,169,258,347])art+=line([x,1,48],[x,1,111],'#f9fbf5',3);
    art+=line([78,1,79],[349,1,79],'#f9fbf5',2);
    art+=box(74,0,279,7,4,44,['#fffdf5','#d5ddcd','#b9c8af']);
    art+=surface([[2,190,20],[2,277,20],[2,277,111],[2,190,111]],'#cad4c2','#abbca1');
    art+=surface([[2.3,195,26],[2.3,272,26],[2.3,272,107],[2.3,195,107]],'#dce4d6');
    art+=line([3,256,55],[3,264,55],'#889b7d',2);
    art+=surface([[24,50,.3],[342,50,.3],[411,212,.3],[87,212,.3]],'#fffaf0','none','opacity=".16"');
    // Projection guides connect the cutaway ceiling position to the sensed
    // work area; they are not physical poles or calibrated beam boundaries.
    for(const x of [110,310])art+=line([x,185,163],[x,185,1],'#819773',1,'stroke-dasharray="3 5" opacity=".5"');
    art+=box(16,29,28,103,65,0,['#e6e9dd','#cbd4c1','#b3c3a9']);
    art+=line([45,82,5],[45,82,62],'#9daf92',.8);
    art+=box(17,32,27,96,3,65,['#dfd1b5','#bdad8a','#a39270']);
    art+=plant(378,20);
    art+=desk(45,36)+desk(235,36)+desk(45,244,false)+desk(235,244,false);
    art+=chair(89,126)+chair(279,126)+chair(89,195,true)+chair(279,195,true);
    art+=plant(24,283);
    art+=surface([[0,0,175],[420,0,175],[420,320,175],[0,320,175]],'none','#98ad8b','stroke-dasharray="6 7" opacity=".42"');
    const ceiling=point(18,18,175);
    art+=`<text x="${ceiling[0]}" y="${ceiling[1]+4}" text-anchor="middle" class="ceiling-note">CEILING · CUTAWAY</text>`;
    art+=node(1,110,185)+node(2,310,185);
    // Area identifiers sit outside the broad footprint edges, separate from furniture.
    for(const [id,x,color] of [[1,110,'#4d703e'],[2,310,'#3f776b']]) {
      const p=point(x,330,0);
      art+=`<g class="area-label" aria-hidden="true"><text x="${p[0]}" y="${p[1]+24}" text-anchor="middle" fill="${color}">0${id} · ${id===1?'LEFT':'RIGHT'} SENSING AREA</text></g>`;
    }
    return `<svg class="office-model" viewBox="100 20 740 440" role="group" aria-label="One shared cooling zone containing two sensing sub-areas: Node 01 covers the left desk, seating and circulation area; Node 02 covers the right desk, seating and circulation area. Approximately 10 square metres per ceiling-mounted node; schematic coverage.">
      <defs><linearGradient id="office-window" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e9f1ed"/><stop offset="1" stop-color="#b8d2cd"/></linearGradient></defs>${art}</svg>`;
  }
  const styles=`
    :host{display:block;position:relative;width:100%;height:100%;color:#193e35;font-family:inherit;--office-ease:cubic-bezier(.23,1,.32,1)}
    *{box-sizing:border-box}.office-shell{position:relative;width:100%;height:100%;min-height:200px;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:5px;isolation:isolate}
    .zone-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:0 18px;font-size:11px;color:#63755b}.zone-heading strong{font-size:14px;font-weight:600;color:#193e35}.zone-heading span{white-space:nowrap}
    :host([variant=preview]) .zone-heading{display:none}:host([variant=preview]) .office-shell{grid-template-rows:minmax(0,1fr) auto}
    .office-stage{position:relative;width:100%;height:100%;min-height:0}.office-model{display:block;position:absolute;inset:0;width:100%;height:100%;overflow:visible;transform-origin:50% 62%;z-index:1}
    .office-ground{position:absolute;left:25%;right:16%;bottom:9%;height:19%;border-radius:50%;background:radial-gradient(ellipse,#354a2c10,transparent 70%);pointer-events:none}
    .office-node{cursor:pointer;outline:none}.node-ring{fill:#f8fcf1;stroke:#739363;stroke-width:1.3;opacity:.85}.sensor-led{fill:#557943}.node-index{font:600 13px system-ui;fill:#47623a;letter-spacing:1px}
    .coverage-footprint{fill-opacity:.43;stroke-opacity:.85;stroke-width:1.5}.coverage-area[data-selected=true] .coverage-footprint{fill-opacity:.54;stroke-opacity:1;stroke-width:2}.shared-zone-boundary{stroke-width:2.5;stroke-opacity:.8}.area-label text{font:600 11px system-ui;letter-spacing:1px}
    .office-node[data-selected=true] .node-ring{stroke:#335a37;stroke-width:2.3}.office-node[data-state=Occupied] .sensor-led{fill:#264e37}.office-node[data-state=Uncertain] .sensor-led{fill:#b18e39}.office-node:focus-visible .node-ring{stroke:#193e35;stroke-width:4}
    .ceiling-note{font:9px system-ui;fill:#647b55;letter-spacing:1.4px}
    .office-readings{position:relative;z-index:2;display:grid;grid-template-columns:1fr 1fr;gap:14px;width:100%;padding:4px 18px 0}
    .reading{width:100%;background:#fbfdf7;border:1px solid #c9d7be;border-top:2px solid #7e9c64;border-radius:6px;padding:10px 13px;color:inherit;font:inherit;cursor:pointer;text-align:left;transition:border-color 160ms ease,transform 160ms var(--office-ease)}
    .reading.two{border-color:#c5d8d0;border-top-color:#70a294;background:#f8fcfa}.reading[data-selected=true]{border-color:#648a53}.reading.two[data-selected=true]{border-color:#4f8778}.reading:focus-visible{outline:3px solid #547a42;outline-offset:3px}
    .reading-head{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;font-weight:600}.coverage-size{font-size:11px;font-weight:400;color:#5a6f50}.reading-info{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0;font-size:10px;color:#5b7052}.occupancy{font-size:11px;color:#53674b}
    .reading-values{display:flex;align-items:baseline;gap:12px;white-space:nowrap}.temperature{font-size:20px;font-weight:500;letter-spacing:-.6px;font-variant-numeric:tabular-nums}.humidity{font-size:12px;color:#516b47}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
    @media(hover:hover) and (pointer:fine){.reading:hover{border-color:#648a53;transform:translateY(-1px)}}.reading:active{transform:scale(.98);transition-duration:100ms}
    @media(max-width:600px){.zone-heading{padding:0 8px}.zone-heading strong{font-size:12px}.zone-heading span{font-size:10px}.office-readings{padding:4px 8px 0;gap:10px}.reading{padding:10px}.reading-head{font-size:11px}.reading-info{font-size:9px;gap:5px}.reading-values{gap:8px}.humidity{font-size:11px}}
    @media(max-width:480px){.office-shell{height:auto;min-height:0;grid-template-rows:auto auto auto}.office-stage{height:auto;aspect-ratio:740/440}.office-readings{padding-bottom:6px}.reading-head{align-items:flex-start;flex-direction:column;gap:3px}.reading-info{flex-direction:column;align-items:flex-start;gap:4px}.temperature{font-size:20px}.node-index{font-size:19px}.area-label text{font-size:13px}.office-model path[stroke-dasharray]{display:none}.office-ground{bottom:6%}:host([variant=preview]) .office-shell{grid-template-rows:auto auto}}
    @media(max-width:480px){:host([variant=workspace]) .office-readings{display:none}}
    @media(prefers-reduced-motion:reduce){.office-model,.office-ground,.reading:hover,.reading:active{transform:none!important}.reading{transition:border-color 160ms ease}}
    @media(prefers-contrast:more){.reading{background:#fff;border-color:#193e35}.occupancy,.humidity{color:#193e35}}
  `;
  class OmniOffice extends HTMLElement {
    static get observedAttributes(){return ['node-one-temperature','node-one-humidity','node-one-occupancy','node-two-temperature','node-two-humidity','node-two-occupancy','selected-node'];}
    constructor(){super();this.attachShadow({mode:'open'});}
    connectedCallback(){
      if(this.controller)return;
      this.controller=new AbortController();const {signal}=this.controller;
      this.shadowRoot.innerHTML=`<style>${styles}</style><div class="office-shell"><div class="zone-heading"><strong>One shared cooling zone</strong><span>Two sensing sub-areas</span></div><div class="office-stage"><div class="office-ground"></div>${scene()}</div><div class="office-readings" aria-label="Readings for the two spatial sensing sub-areas">${[1,2].map(i=>`<button class="reading ${i===2?'two':''}" data-node-id="node-0${i}"><span class="reading-head"><span>${i===1?'Left':'Right'} sensing area</span><span class="coverage-size">≈10 m²</span></span><span class="reading-info"><span>Node 0${i} · Ceiling mounted</span><span class="occupancy"></span></span><span class="reading-values"><span class="temperature"></span><span class="humidity"></span></span></button>`).join('')}</div><span class="visually-hidden">One room-wide cooling zone contains a left sensing sub-area and a right sensing sub-area. Each ceiling-mounted node covers approximately 10 square metres across work surfaces, seating and circulation. Furniture is contextual. Coverage shapes and office dimensions are schematic.</span></div>`;
      this.shadowRoot.addEventListener('click',event=>{const node=event.target.closest('[data-node-id]');if(node)this.select(node.dataset.nodeId);},{signal});
      this.shadowRoot.addEventListener('keydown',event=>{if(event.target.matches('.office-node')&&['Enter',' '].includes(event.key)){event.preventDefault();this.select(event.target.dataset.nodeId);}},{signal});
      this.updateReadings();this.setupMotion(signal);
    }
    disconnectedCallback(){this.stopMotion?.();this.observer?.disconnect();this.controller?.abort();this.controller=null;}
    attributeChangedCallback(){if(this.controller)this.updateReadings();}
    select(id){this.setAttribute('selected-node',id);this.dispatchEvent(new CustomEvent('office-node-select',{detail:{id},bubbles:true,composed:true}));}
    updateReadings(){
      [1,2].forEach(i=>{
        const prefix=i===1?'node-one':'node-two',id=`node-0${i}`;
        const temp=this.getAttribute(prefix+'-temperature'),rh=this.getAttribute(prefix+'-humidity');
        const occupancy=this.getAttribute(prefix+'-occupancy')||'Uncertain';
        const selected=(this.getAttribute('selected-node')||'node-01')===id;
        const reading=this.shadowRoot.querySelector(`button[data-node-id="${id}"]`);
        if(!reading)return;
        const temperature=temp!==null&&temp!==''&&Number.isFinite(Number(temp))?Number(temp).toFixed(1)+'°C':'—';
        const humidity=rh!==null&&rh!==''&&Number.isFinite(Number(rh))?rh+'% RH':'—';
        reading.querySelector('.temperature').textContent=temperature;
        reading.querySelector('.humidity').textContent=humidity;
        reading.querySelector('.occupancy').textContent=occupancy;
        reading.setAttribute('aria-pressed',String(selected));
        reading.setAttribute('aria-label',`Inspect Node 0${i}: ${temperature}, ${humidity}, ${occupancy}. Ceiling mounted, approximately 10 square metres across the ${i===1?'left':'right'} work area and circulation.`);
        this.shadowRoot.querySelectorAll(`[data-node-id="${id}"]`).forEach(el=>{el.dataset.selected=String(selected);el.dataset.state=occupancy;});
        this.shadowRoot.querySelector(`[data-coverage-node="${id}"]`).dataset.selected=String(selected);
        this.shadowRoot.querySelector(`g[data-node-id="${id}"]`).setAttribute('aria-label',`Inspect Node 0${i}: ${temperature}, ${humidity}, ${occupancy}. Ceiling mounted, approximately 10 square metres across the ${i===1?'left':'right'} work area and circulation.`);
      });
    }
    setupMotion(signal){
      const fine=matchMedia('(hover:hover) and (pointer:fine)'),reduce=matchMedia('(prefers-reduced-motion:reduce)');
      const stage=this.shadowRoot.querySelector('.office-stage'),model=this.shadowRoot.querySelector('.office-model'),ground=this.shadowRoot.querySelector('.office-ground');
      const state={x:0,y:0,vx:0,vy:0},target={x:0,y:0};
      let active=false,bounds=null,visible=true;
      const clock=window.gsap?.ticker;
      // Critically damped spring: damping ratio 1, response .4s. Preserve
      // current position and velocity when a mouse reverses direction.
      const omega=2*Math.PI/.4;
      const paint=()=>{
        model.style.transform=`perspective(1100px) translate3d(${state.x*3}px,${state.y*2}px,0) rotateX(${-state.y*2.2}deg) rotateY(${state.x*2.8}deg)`;
        ground.style.transform=`translate(${state.x*-2}px,${state.y*-1.2}px)`;
      };
      const stop=()=>{if(active)clock?.remove(tick);active=false;model.style.willChange='';};
      const reset=()=>{stop();Object.assign(state,{x:0,y:0,vx:0,vy:0});target.x=target.y=0;model.style.transform='';ground.style.transform='';};
      const tick=(_time,delta)=>{
        const dt=Math.min(delta/1000,.032),decay=Math.exp(-omega*dt);
        for(const axis of ['x','y']){const v='v'+axis,offset=state[axis]-target[axis],c=state[v]+omega*offset;state[axis]=target[axis]+(offset+c*dt)*decay;state[v]=(state[v]-omega*c*dt)*decay;}
        paint();
        if(Math.abs(state.x-target.x)+Math.abs(state.y-target.y)+Math.abs(state.vx)+Math.abs(state.vy)<.003){state.x=target.x;state.y=target.y;state.vx=state.vy=0;paint();stop();}
      };
      const start=()=>{if(clock&&!active){active=true;model.style.willChange='transform';clock.add(tick);}};
      this.addEventListener('pointerenter',()=>{bounds=stage.getBoundingClientRect();},{signal});
      this.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse'||!clock||!fine.matches||reduce.matches||!visible||document.hidden)return;if(!bounds)bounds=stage.getBoundingClientRect();target.x=Math.max(-1,Math.min(1,((event.clientX-bounds.left)/bounds.width-.5)*2));target.y=Math.max(-1,Math.min(1,((event.clientY-bounds.top)/bounds.height-.5)*2));start();},{signal});
      this.addEventListener('pointerleave',()=>{target.x=target.y=0;bounds=null;start();},{signal});
      window.addEventListener('resize',()=>{bounds=null;reset();},{signal});
      document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();},{signal});
      reduce.addEventListener('change',reset,{signal});fine.addEventListener('change',reset,{signal});
      this.observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible)reset();});this.observer.observe(this);
      this.stopMotion=reset;
    }
  }
  if(!customElements.get('omni-office'))customElements.define('omni-office',OmniOffice);
})();
