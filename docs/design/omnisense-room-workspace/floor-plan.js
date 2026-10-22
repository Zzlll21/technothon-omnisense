// Spatial proposal only. Operational data is supplied by the existing workspace.
(() => {
  const spaces = [
    {id:'open-office',name:'Open Office',x:40,y:40,w:460,h:280,supported:true},
    {id:'conference',name:'Conference Room',x:520,y:40,w:270,h:280},
    {id:'meeting',name:'Meeting Room',x:810,y:40,w:230,h:280},
    {id:'private',name:'Private Office',x:40,y:410,w:230,h:180},
    {id:'collaborative',name:'Collaborative Workspace',x:290,y:410,w:460,h:180},
    {id:'pantry',name:'Pantry & shared facilities',x:770,y:410,w:270,h:180}
  ];
  const desk=(x,y)=>`<g class="furniture"><rect x="${x}" y="${y}" width="70" height="35" rx="2"/><rect x="${x+20}" y="${y+5}" width="27" height="5"/><path d="M${x+28} ${y+14}h14M${x+29} ${y+35}v8m-10 0h30"/><rect x="${x+23}" y="${y+43}" width="24" height="17" rx="6"/></g>`;
  const table=(x,y,w,h,n)=>`<g class="furniture"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w,h)/4}"/>${Array.from({length:n},(_,i)=>`<rect x="${x+12+i*(w-36)/(n-1)}" y="${y-15}" width="20" height="11" rx="4"/><rect x="${x+12+i*(w-36)/(n-1)}" y="${y+h+4}" width="20" height="11" rx="4"/>`).join('')}</g>`;
  const plant=(x,y)=>`<g class="plant"><circle cx="${x}" cy="${y}" r="13"/><path d="m${x-8} ${y+4} 16-8m-13-3 10 14m-14-8h18"/></g>`;
  const furniture =
    desk(129,130)+desk(337,130)+desk(129,218)+desk(337,218)+
    table(563,170,181,58,4)+table(851,168,146,60,3)+desk(69,487)+
    `<g class="furniture"><rect x="191" y="475" width="46" height="75" rx="3"/><rect x="330" y="485" width="100" height="36" rx="9"/><rect x="330" y="528" width="100" height="11" rx="4"/><rect x="451" y="490" width="58" height="48" rx="8"/><rect x="532" y="485" width="100" height="36" rx="9"/><rect x="532" y="528" width="100" height="11" rx="4"/><rect x="797" y="471" width="218" height="24"/><circle cx="840" cy="482" r="8"/><rect x="966" y="474" width="30" height="16" rx="2"/></g>`+
    table(841,533,103,24,2)+plant(469,76)+plant(1010,76)+plant(701,552)+plant(244,552);
  const walls=`<path class="outer-wall" d="M40 320V40h1000v550H40V410M40 320h362m68 0h30V40m20 280h181m67 0h22V40m20 280h144m66 0h20M40 410h134m65 0h31v180m20-180h363m66 0h31v180m20-180h188m64 0h18"/><g class="door"><path d="M402 320v-60a60 60 0 0 1 60 60m239 0v-60a60 60 0 0 1 60 60m193 0v-60a60 60 0 0 1 60 60M174 410v60a60 60 0 0 0 60-60m419 0v60a60 60 0 0 0 60-60m245 0v60a60 60 0 0 0 60-60"/></g><path class="windows" d="M85 40h350m130 0h180m100 0h160M40 90v170m1000-170v170M80 590h140m110 0h340m140 0h180"/>`;
  const style=`:host{display:block;width:100%;color:#183e35;font-family:inherit}*{box-sizing:border-box}.plan-scroll{overflow-x:auto;overscroll-behavior-x:contain}.floor{display:block;width:100%;min-width:640px;height:auto;max-height:545px}.room-fill{fill:#edf0e8;stroke:#d3dccc;stroke-width:1}.space{cursor:pointer;outline:none}.space .room-fill{transition:fill 180ms,stroke 180ms}.space[data-selected=true] .room-fill{fill:#dce9d1;stroke:#5e8050;stroke-width:2}.space:focus-visible .room-fill{stroke:#183e35;stroke-width:4}.space:hover .room-fill{fill:#e1e8d9}.space.supported .room-fill{fill:#e3edda}.space.supported:hover .room-fill{fill:#d4e6c7}.space.supported[data-selected=true] .room-fill{fill:#dce9d1}.name{fill:#183e35;font-size:18px;font-weight:600}.meta{fill:#60725e;font-size:13px}.supported-note{fill:#3c6036;font-size:13px;font-weight:600}.furniture{fill:#e7e5d8;stroke:#a1ad96;stroke-width:1.2;pointer-events:none}.plant{fill:#d2dfc7;stroke:#91a47f;stroke-width:1;pointer-events:none}.outer-wall{fill:none;stroke:#596d53;stroke-width:7;stroke-linejoin:miter;pointer-events:none}.door{fill:none;stroke:#9ba894;stroke-width:1;pointer-events:none}.windows{fill:none;stroke:#8baca7;stroke-width:4;pointer-events:none}.corridor{fill:#667660;font-size:13px;letter-spacing:2px}.sensing{fill:none;stroke:#8ba579;stroke-dasharray:4 4;pointer-events:none}.node{fill:#f8fcf3;stroke:#5c7c4f}.node-number{fill:#496c40;font-size:11px;font-weight:600}.north{font-size:12px;fill:#63735c}.hint{display:none;font-size:13px;color:#627064;margin:8px 0 0}.room-data{fill:#2b503f;font-size:14px}@media(max-width:800px){.hint{display:block}.floor{min-width:720px}}@media(prefers-reduced-motion:reduce){.space .room-fill{transition:none}}`;
  class OmniFloor extends HTMLElement {
    static get observedAttributes(){return ['selected-zone'];}
    constructor(){super();this.attachShadow({mode:'open'});}
    connectedCallback(){
      if(this.abort)return;this.abort=new AbortController();const {signal}=this.abort;
      this.shadowRoot.innerHTML=`<style>${style}</style><div class="plan-scroll" tabindex="0" role="region" aria-label="Office floor plan. Scroll horizontally on a narrow screen. Each space can be selected; only Open Office has monitoring records."><svg class="floor" viewBox="0 0 1080 640" role="group" aria-label="Proposed office floor with one supported demo zone and five illustrative spaces"><rect x="40" y="40" width="1000" height="550" fill="#f8faf5"/>${spaces.map(s=>`<g class="space ${s.supported?'supported':''}" data-zone="${s.id}" role="button" tabindex="0" aria-label="${s.name}. ${s.supported?'Supported demo cooling zone. Open 3D workspace.':'Illustrative space. View connection information.'}"><rect class="room-fill" x="${s.x+4}" y="${s.y+4}" width="${s.w-8}" height="${s.h-8}"/><text class="name" x="${s.x+22}" y="${s.y+37}">${s.name}</text><text class="${s.supported?'supported-note':'meta'}" x="${s.x+22}" y="${s.y+59}">${s.supported?'Supported demo zone ↗':'Illustrative · no operational data'}</text></g>`).join('')}<rect class="sensing" x="67" y="116" width="194" height="177" rx="2"/><rect class="sensing" x="275" y="116" width="194" height="177" rx="2"/>${[164,372].map((x,i)=>`<circle class="node" cx="${x}" cy="202" r="12"/><text class="node-number" x="${x}" y="206" text-anchor="middle">0${i+1}</text>`).join('')}${furniture}${walls}<text class="corridor" x="540" y="367" text-anchor="middle">CIRCULATION</text><path d="M40 365H12m8-6-8 6 8 6" fill="none" stroke="#6e8063"/><text class="north" x="40" y="625">SCHEMATIC FLOOR · NOT TO SCALE</text></svg></div><p class="hint">Swipe the plan, or choose a space from the list below.</p>`;
      this.shadowRoot.addEventListener('click',e=>{const room=e.target.closest('[data-zone]');if(room)this.choose(room.dataset.zone);},{signal});
      this.shadowRoot.addEventListener('keydown',e=>{const room=e.target.closest('[data-zone]');if(room&&['Enter',' '].includes(e.key)){e.preventDefault();this.choose(room.dataset.zone);}},{signal});
      this.update();
    }
    disconnectedCallback(){this.abort?.abort();this.abort=null;}
    attributeChangedCallback(){if(this.abort)this.update();}
    choose(id){this.setAttribute('selected-zone',id);this.dispatchEvent(new CustomEvent('floor-zone-select',{detail:{id},bubbles:true,composed:true}));}
    update(){this.shadowRoot.querySelectorAll('[data-zone]').forEach(s=>s.setAttribute('data-selected',String(s.dataset.zone===(this.getAttribute('selected-zone')||'open-office'))));}
  }
  if(!customElements.get('omni-floor'))customElements.define('omni-floor',OmniFloor);
})();
