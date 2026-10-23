// Presentation-only 3D upgrade. Shares the existing office attribute/event contract.
const attributes=['node-one-temperature','node-one-humidity','node-one-occupancy','node-two-temperature','node-two-humidity','node-two-occupancy','selected-node'];
const MIN_ZOOM=.9,MAX_ZOOM=1.6,ZOOM_STEP=1.12,HOLD_ZOOM_RATE=.42,HOLD_ROTATION_RATE=Math.PI/6,ROTATION_STEP=Math.PI/12;
// Exact ease-out curve used for short, interruptible wheel/tap adjustments.
const cameraEase=t=>{
  let s=t;
  for(let i=0;i<6;i++){
    const u=1-s,x=3*.23*s*u*u+3*.32*s*s*u+s*s*s,dx=3*.23*u*u+6*(.32-.23)*u*s+3*(1-.32)*s*s;
    s=Math.max(0,Math.min(1,s-(x-t)/dx));
  }
  return 1-(1-s)**3;
};
const css=`
:host{display:block;width:100%;height:100%;color:#183e35;font-family:inherit}*{box-sizing:border-box}button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}button:focus-visible{outline:2px solid #315f50;outline-offset:3px}button:active{transform:scale(.97)}[hidden]{display:none!important}.experience{height:100%;display:grid;grid-template-rows:auto minmax(250px,1fr) auto auto;gap:8px}.heading{display:flex;align-items:baseline;justify-content:space-between;gap:15px;font-size:12px;color:#627064}.heading strong{font-size:14px;font-weight:600;color:#183e35}.viewport{position:relative;min-height:260px;overflow:hidden;border-radius:5px;background:radial-gradient(ellipse at 50% 60%,#e8ece1 0,transparent 65%)}canvas{position:absolute;inset:0;display:block;width:100%;height:100%;outline:none;cursor:grab;touch-action:pan-y}canvas:active{cursor:grabbing}canvas:focus-visible{outline:2px solid #6f8b5d;outline-offset:-3px}.marker{position:absolute;left:0;top:0;min-width:40px;min-height:36px;padding:5px 9px;background:#fcfdf7;border:1px solid #b3c5a6;border-radius:20px;font-size:12px;font-weight:600;box-shadow:0 2px 7px #183e3512;will-change:transform}.marker[data-selected=true]{background:#315f50;color:#fff;border-color:#315f50}.marker[data-hover=true]{border-color:#315f50}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:#627064}.camera-buttons{display:flex;align-items:center;gap:4px}.camera-buttons button{display:flex;align-items:center;justify-content:center;min-width:36px;min-height:36px;border:1px solid #d6dfd0;border-radius:4px;background:#fbfcf8;font-size:18px}.camera-buttons .reset{font-size:12px;padding:0 10px;margin-left:3px}.camera-buttons button:disabled{opacity:.35;cursor:default}.readings{display:grid;grid-template-columns:1fr 1fr;gap:14px}.reading{padding:11px 13px;border:1px solid #c9d7be;border-radius:5px;background:#fbfdf7;text-align:left;transition:border-color 160ms,background-color 160ms}.reading.two{background:#f6faf8;border-color:#c2d8ce}.reading[data-selected=true]{border-color:#587c4a}.reading.two[data-selected=true]{border-color:#48816d}.reading[data-hover=true]{background:#e7eee0}.row{display:flex;justify-content:space-between;gap:8px;align-items:center}.area{font-size:13px;font-weight:600}.size{font-size:12px;color:#627064}.meta{font-size:12px;color:#627064;margin:5px 0 7px}.temperature{font-size:23px;font-weight:500;letter-spacing:-.6px;font-variant-numeric:tabular-nums}.humidity{font-size:13px;margin-left:10px}.read-action{font-size:12px;color:#58734c}.fallback{height:100%;position:relative}.fallback omni-office{width:100%;height:calc(100% - 24px)}.fallback p{font-size:13px;color:#627064;margin:0}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
@media(hover:hover) and (pointer:fine){.reading:hover{border-color:#587c4a}.camera-buttons button:hover{background:#e5ecdf}.marker:hover{border-color:#315f50}}
@media(max-width:600px){.experience{grid-template-rows:auto minmax(260px,1fr) auto auto}.heading{gap:8px;font-size:11px}.heading strong{font-size:13px}.toolbar{flex-wrap:wrap;font-size:12px;gap:5px}.camera-buttons{margin-left:auto}.readings{gap:9px}.reading{padding:9px}.row{flex-wrap:wrap;gap:3px}.area{font-size:12px}.meta{font-size:11px}.temperature{font-size:21px}.humidity{font-size:12px;margin-left:7px}.read-action{display:none}.size{font-size:11px}.marker{font-size:11px;min-width:36px;min-height:34px}}
@media(prefers-reduced-motion:reduce){button,.reading{transition:none}}
`;
class OmniOffice3D extends HTMLElement {
  static get observedAttributes(){return attributes;}
  constructor(){super();this.attachShadow({mode:'open'});this.visible=false;this.frame=0;this.ready=false;this.loading=false;}
  connectedCallback(){
    if(this.abort)return;this.abort=new AbortController();const {signal}=this.abort;
    this.shadowRoot.innerHTML=`<style>${css}</style><div class="fallback"><omni-office variant="workspace"></omni-office><p class="fallback-note" role="status">Preparing the 3D workspace…</p></div><div class="experience" hidden><div class="heading"><strong>One shared cooling zone</strong></div><div class="viewport"><canvas tabindex="0" aria-label="Rotatable office model. Arrow keys rotate. Plus and minus zoom. Home resets. Select a labelled node to inspect its records." aria-describedby="camera-help"></canvas>${[1,2].map(i=>`<button class="marker" data-node-id="node-0${i}" aria-label="Inspect ceiling-mounted Node 0${i}">0${i}</button>`).join('')}</div><div class="toolbar"><span id="camera-help">Drag to orbit · + / − to zoom</span><div class="camera-buttons" aria-label="Office camera controls"><button data-camera="left" aria-label="Rotate view left">↶</button><button data-camera="right" aria-label="Rotate view right">↷</button><button data-camera="out" aria-label="Zoom out">−</button><button data-camera="in" aria-label="Zoom in">+</button><button class="reset" data-camera="reset">Reset view</button></div></div><div class="readings" aria-label="Sensor readings and history">${[1,2].map(i=>`<button class="reading ${i===2?'two':''}" data-node-id="node-0${i}"><span class="row"><span class="area">${i===1?'Left':'Right'} sensing area</span><span class="size">≈10 m²</span></span><span class="row meta"><span>Node 0${i} · Ceiling mounted</span><span class="occupancy"></span></span><span class="row"><span><span class="temperature"></span><span class="humidity"></span></span><span class="read-action">Inspect ↗</span></span></button>`).join('')}</div><span class="sr" role="status" aria-live="polite"></span></div>`;
    this.reduce=matchMedia('(prefers-reduced-motion:reduce)');
    this.shadowRoot.addEventListener('click',e=>{const node=e.target.closest('button[data-node-id]'),camera=e.target.closest('[data-camera]');if(node)this.select(node.dataset.nodeId);if(camera){if(camera.dataset.camera!=='reset'&&e.detail>0){e.preventDefault();return;}this.moveCamera(camera.dataset.camera);}},{signal});
    this.shadowRoot.addEventListener('pointerdown',e=>{
      const button=e.target.closest('[data-camera]:not([data-camera=reset])');
      if(!button||e.button!==0||button.disabled||!this.ready)return;
      this.stopCameraInput();button.setPointerCapture(e.pointerId);
      const action=button.dataset.camera,hold={button,id:e.pointerId,start:performance.now()};
      if(action==='in'||action==='out')this.zoomHold={...hold,direction:action==='in'?1:-1,startZoom:this.camera.zoom};
      else{
        // Flush any remaining drag momentum before direct button control.
        const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;
        this.rotationHold={...hold,direction:action==='left'?-1:1,startAngle:this.controls.getAzimuthalAngle()};
      }
      this.requestFrame();
    },{signal});
    const finishHold=(e,tap)=>{if(this.zoomHold?.id===e.pointerId)this.endZoomHold(tap);if(this.rotationHold?.id===e.pointerId)this.endRotationHold(tap);};
    document.addEventListener('pointerup',e=>finishHold(e,true),{signal});
    document.addEventListener('pointercancel',e=>finishHold(e,false),{signal});
    this.shadowRoot.addEventListener('lostpointercapture',e=>finishHold(e,false),{signal});
    window.addEventListener('blur',()=>this.stopCameraInput(),{signal});
    this.shadowRoot.querySelector('.viewport').addEventListener('wheel',e=>{
      if(!this.ready||e.ctrlKey||e.metaKey||!e.deltaY||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
      e.preventDefault();this.endZoomHold(false);this.endRotationHold(false);this.rotationTween=null;
      const unit=e.deltaMode===1?16:e.deltaMode===2?this.viewport.clientHeight:1;
      const delta=Math.max(-120,Math.min(120,e.deltaY*unit));
      this.setZoomTarget((this.zoomTween?.to??this.camera.zoom)*Math.exp(-delta*Math.log(ZOOM_STEP)/100));
    },{signal,passive:false});
    this.shadowRoot.addEventListener('pointerover',e=>{const node=e.target.closest('button[data-node-id]');if(node)this.setHover(node.dataset.nodeId);},{signal});
    this.shadowRoot.addEventListener('pointerout',e=>{if(e.target.closest('button[data-node-id]'))this.setHover(null);},{signal});
    this.shadowRoot.addEventListener('focusin',e=>{const node=e.target.closest('button[data-node-id]');if(node)this.setHover(node.dataset.nodeId);},{signal});
    this.shadowRoot.addEventListener('focusout',()=>this.setHover(null),{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.stopCameraInput();this.cancelFrame();}else this.requestFrame();},{signal});
    this.reduce.addEventListener('change',()=>{this.stopCameraInput();if(this.controls)this.controls.enableDamping=!this.reduce.matches;this.requestFrame();},{signal});
    this.observer=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;if(this.visible){if(!this.loading&&!this.ready)this.init3D();else this.resize?.();}else{this.stopCameraInput();this.cancelFrame();}});this.observer.observe(this);
    this.updateReadings();
  }
  disconnectedCallback(){this.stopCameraInput();this.abort?.abort();this.abort=null;this.observer?.disconnect();this.resizeObserver?.disconnect();this.cancelFrame();this.controls?.dispose();this.scene?.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.renderer?.dispose();this.ready=false;this.loading=false;}
  attributeChangedCallback(){if(this.abort)this.updateReadings();}
  select(id){this.setAttribute('selected-node',id);this.dispatchEvent(new CustomEvent('office-node-select',{detail:{id},bubbles:true,composed:true}));}
  updateReadings(){
    const fallback=this.shadowRoot.querySelector('omni-office');if(!fallback)return;
    attributes.forEach(a=>{const v=this.getAttribute(a);if(v===null)fallback.removeAttribute(a);else fallback.setAttribute(a,v);});
    [1,2].forEach(i=>{
      const p=i===1?'node-one':'node-two',id=`node-0${i}`,temp=this.getAttribute(p+'-temperature'),rh=this.getAttribute(p+'-humidity'),occ=this.getAttribute(p+'-occupancy')||'Uncertain';
      const t=temp!==null&&temp!==''&&Number.isFinite(+temp)?(+temp).toFixed(1)+'°C':'—',h=rh!==null&&rh!==''&&Number.isFinite(+rh)?rh+'% RH':'—';
      const card=this.shadowRoot.querySelector(`.reading[data-node-id="${id}"]`);card.querySelector('.temperature').textContent=t;card.querySelector('.humidity').textContent=h;card.querySelector('.occupancy').textContent=occ;
      this.shadowRoot.querySelectorAll(`button[data-node-id="${id}"]`).forEach(el=>{el.dataset.selected=String(id===(this.getAttribute('selected-node')||'node-01'));el.setAttribute('aria-pressed',el.dataset.selected);el.setAttribute('aria-label',`Inspect Node 0${i}, ${i===1?'left':'right'} sensing area. ${t}, ${h}, ${occ}. Ceiling mounted, approximately 10 square metres. Open status and historical records.`);});
    });this.syncHighlight();
  }
  setHover(id){if(this.hovered===id)return;this.hovered=id;this.shadowRoot.querySelectorAll('button[data-node-id]').forEach(b=>b.dataset.hover=String(b.dataset.nodeId===id));this.syncHighlight();}
  syncHighlight(){if(!this.footprints)return;const selected=this.getAttribute('selected-node')||'node-01';this.footprints.forEach((f,i)=>{const active=`node-0${i+1}`===(this.hovered||selected);f.material.opacity=active?.42:.25;this.boundaries[i].material.opacity=active?1:.75;this.nodeHalos[i].material.opacity=active?.85:.22;});this.requestFrame();}
  cancelFrame(){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;}
  requestFrame(){if(!this.ready||!this.visible||document.hidden||this.frame)return;this.frame=requestAnimationFrame(now=>{this.frame=0;const zooming=this.advanceZoom(now),rotating=this.advanceRotation(now),changed=this.controls.update();this.render();if(zooming||rotating||(changed&&this.controls.enableDamping))this.requestFrame();});}
  render(){this.renderer.render(this.scene,this.camera);const rect=this.viewport.getBoundingClientRect();this.nodePositions.forEach((pos,i)=>{const p=pos.clone().project(this.camera),label=this.shadowRoot.querySelector(`.marker[data-node-id="node-0${i+1}"]`);label.style.transform=`translate3d(${(p.x*.5+.5)*rect.width+15}px,${(-p.y*.5+.5)*rect.height-26}px,0)`;label.style.visibility=p.z>1?'hidden':'visible';});this.updateCameraButtons();}
  updateCameraButtons(){if(!this.camera)return;this.shadowRoot.querySelector('[data-camera=in]').disabled=this.camera.zoom>=MAX_ZOOM-1e-6;this.shadowRoot.querySelector('[data-camera=out]').disabled=this.camera.zoom<=MIN_ZOOM+1e-6;const angle=this.controls.getAzimuthalAngle();this.shadowRoot.querySelector('[data-camera=left]').disabled=angle<=this.controls.minAzimuthAngle+1e-6;this.shadowRoot.querySelector('[data-camera=right]').disabled=angle>=this.controls.maxAzimuthAngle-1e-6;}
  applyZoom(value){this.camera.zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,value));this.camera.updateProjectionMatrix();}
  setZoomTarget(value){
    const to=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,value));
    if(this.reduce.matches){this.zoomTween=null;this.applyZoom(to);}else this.zoomTween={from:this.camera.zoom,to,start:performance.now()};
    this.requestFrame();
  }
  advanceZoom(now){
    if(this.zoomHold){
      const hold=this.zoomHold;
      this.applyZoom(hold.startZoom*Math.exp(hold.direction*HOLD_ZOOM_RATE*Math.max(0,now-hold.start)/1000));
      if(this.camera.zoom===MIN_ZOOM||this.camera.zoom===MAX_ZOOM)this.endZoomHold(false);
    }else if(this.zoomTween){
      const tween=this.zoomTween,t=Math.max(0,Math.min(1,(now-tween.start)/180));
      this.applyZoom(tween.from+(tween.to-tween.from)*cameraEase(t));
      if(t===1)this.zoomTween=null;
    }
    return Boolean(this.zoomHold||this.zoomTween);
  }
  endZoomHold(tap){
    const hold=this.zoomHold;if(!hold)return;this.zoomHold=null;
    if(hold.button.hasPointerCapture(hold.id))hold.button.releasePointerCapture(hold.id);
    const elapsed=performance.now()-hold.start;
    if(tap&&elapsed<180)this.setZoomTarget(hold.startZoom*(hold.direction===1?ZOOM_STEP:1/ZOOM_STEP));
    else if(tap){this.applyZoom(hold.startZoom*Math.exp(hold.direction*HOLD_ZOOM_RATE*elapsed/1000));this.requestFrame();}
  }
  applyRotation(value){
    const angle=Math.max(this.controls.minAzimuthAngle,Math.min(this.controls.maxAzimuthAngle,value));
    const offset=this.camera.position.clone().sub(this.controls.target),radius=Math.hypot(offset.x,offset.z);
    this.camera.position.x=this.controls.target.x+radius*Math.sin(angle);this.camera.position.z=this.controls.target.z+radius*Math.cos(angle);
    const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;
    return angle;
  }
  advanceRotation(now){
    if(this.rotationHold){
      const hold=this.rotationHold,angle=this.applyRotation(hold.startAngle+hold.direction*HOLD_ROTATION_RATE*Math.max(0,now-hold.start)/1000);
      if(angle<=this.controls.minAzimuthAngle+1e-6||angle>=this.controls.maxAzimuthAngle-1e-6)this.endRotationHold(false);
    }else if(this.rotationTween){
      const tween=this.rotationTween,t=Math.max(0,Math.min(1,(now-tween.start)/180));this.applyRotation(tween.from+(tween.to-tween.from)*cameraEase(t));if(t===1)this.rotationTween=null;
    }
    return Boolean(this.rotationHold||this.rotationTween);
  }
  endRotationHold(tap){
    const hold=this.rotationHold;if(!hold)return;this.rotationHold=null;
    if(hold.button.hasPointerCapture(hold.id))hold.button.releasePointerCapture(hold.id);
    const elapsed=performance.now()-hold.start;
    if(tap&&elapsed<180){
      const to=Math.max(this.controls.minAzimuthAngle,Math.min(this.controls.maxAzimuthAngle,hold.startAngle+hold.direction*ROTATION_STEP));
      if(this.reduce.matches)this.applyRotation(to);else this.rotationTween={from:this.controls.getAzimuthalAngle(),to,start:performance.now()};
    }else if(tap)this.applyRotation(hold.startAngle+hold.direction*HOLD_ROTATION_RATE*elapsed/1000);
    this.requestFrame();
  }
  stopCameraInput(){this.endZoomHold(false);this.endRotationHold(false);this.zoomTween=null;this.rotationTween=null;}
  moveCamera(action){
    if(!this.ready)return;
    this.stopCameraInput();
    if(action==='reset'){this.controls.reset();this.shadowRoot.querySelector('.sr').textContent='Default isometric view restored.';}
    else if(action==='in'||action==='out'){this.applyZoom(this.camera.zoom*(action==='in'?ZOOM_STEP:1/ZOOM_STEP));}
    else this.applyRotation(this.controls.getAzimuthalAngle()+(action==='left'?-1:1)*ROTATION_STEP);
    this.requestFrame();
  }
  async init3D(){
    this.loading=true;
    try{
      const [T,{OrbitControls}]=await Promise.all([import('./vendor/three.module.min.js'),import('./vendor/OrbitControls.js')]);if(!this.isConnected)return;
      const canvas=this.shadowRoot.querySelector('canvas');this.viewport=this.shadowRoot.querySelector('.viewport');
      const renderer=this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
      const scene=this.scene=new T.Scene();this.up=new T.Vector3(0,1,0);
      const camera=this.camera=new T.OrthographicCamera(-5,5,4,-4,.1,70);camera.position.set(8,7.6,9);camera.lookAt(0,1,0);
      const controls=this.controls=new OrbitControls(camera,canvas);controls.target.set(0,1,0);controls.enablePan=false;controls.enableZoom=false;controls.enableDamping=!this.reduce.matches;controls.dampingFactor=.13;controls.rotateSpeed=.65;controls.minPolarAngle=Math.PI/7;controls.maxPolarAngle=Math.PI/2.6;controls.minAzimuthAngle=-Math.PI*.38;controls.maxAzimuthAngle=Math.PI*.42;controls.touches.ONE=T.TOUCH.ROTATE;controls.touches.TWO=T.TOUCH.DOLLY_ROTATE;controls.update();controls.saveState();
      // Keep native vertical scrolling on touch; use explicit camera controls on phones.
      const fine=matchMedia('(pointer:fine)');const setTouch=()=>{controls.enableRotate=fine.matches;canvas.style.touchAction=fine.matches?'none':'pan-y';this.shadowRoot.querySelector('#camera-help').textContent=fine.matches?'Drag to orbit · scroll to zoom · hold camera buttons':'Hold arrows to orbit · hold + / − to zoom';};setTouch();fine.addEventListener('change',setTouch,{signal:this.abort.signal});
      controls.addEventListener('change',()=>this.requestFrame());
      const hemi=new T.HemisphereLight(0xf8fff3,0x6e8063,2.5);scene.add(hemi);
      const sun=new T.DirectionalLight(0xfff5df,3);sun.position.set(-3,9,6);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.5,far:25});sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;sun.shadow.radius=4;scene.add(sun);
      scene.add(new T.AmbientLight(0xffffff,.35));
      const mats={};const mat=(name,color,roughness=.85)=>mats[name]||(mats[name]=new T.MeshStandardMaterial({color,roughness}));
      const floor=mat('floor',0xd9ceb7),edge=mat('edge',0xb9b8a1),wall=mat('wall',0xcad4be),white=mat('white',0xf2f2e5),wood=mat('wood',0xdfccaa),metal=mat('metal',0x829478),sage=mat('sage',0x79936a),dark=mat('dark',0x24483f),glass=mat('glass',0xb9d6d0),soil=mat('soil',0x7a7959);
      const box=(w,h,d,x,y,z,m,parent=scene)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
      const cylinder=(rt,rb,h,x,y,z,m,parent=scene)=>{const o=new T.Mesh(new T.CylinderGeometry(rt,rb,h,24),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
      const line=(pts,color,opacity=1,dashed=false)=>{const geometry=new T.BufferGeometry().setFromPoints(pts.map(p=>new T.Vector3(...p)));const material=dashed?new T.LineDashedMaterial({color,dashSize:.07,gapSize:.05,transparent:true,opacity}):new T.LineBasicMaterial({color,transparent:true,opacity});const o=new T.Line(geometry,material);if(dashed)o.computeLineDistances();scene.add(o);return o;};
      // Low walls expose the occupied volume; the retained frame establishes ceiling height.
      box(6.9,.19,5.15,0,-.12,0,edge);box(6.8,.05,5.05,0,0,0,floor);
      for(let z=-2.4;z<2.5;z+=.29)line([[-3.37,.03,z],[3.37,.03,z]],0xbdb699,.48);
      for(let z=-2.4;z<2.4;z+=.58)for(let x=-2.8;x<3;x+=1.2)line([[x,.031,z],[x,.031,z+.29]],0xbdb699,.4);
      box(6.8,1.15,.12,0,.6,-2.5,wall);box(.12,.8,5.0,-3.4,.42,0,wall);
      box(6.45,.08,.08,0,1.21,-2.42,white);box(5.3,1.05,.04,.15,1.82,-2.48,glass);
      for(let x=-2.5;x<3;x+=1.32)box(.045,1.12,.07,x,1.82,-2.42,white);
      box(5.35,.05,.08,.15,2.36,-2.42,white);box(5.35,.05,.08,.15,1.28,-2.42,white);
      for(const x of [-3.35,3.35]){box(.1,2.86,.1,x,1.43,-2.46,white);box(.1,2.86,.1,x,1.43,.25,white);box(.11,.12,5.02,x,2.89,0,white);}
      box(6.8,.12,.11,0,2.89,-2.46,white);box(6.8,.12,.23,0,2.89,.25,white);
      line([[-3.35,2.95,2.5],[3.35,2.95,2.5]],0x8c9c83,.38,true);
      // One continuous cooling boundary; left/right overlays are sensing coverage only.
      line([[-3.29,.055,-2.36],[3.29,.055,-2.36],[3.29,.055,2.36],[-3.29,.055,2.36],[-3.29,.055,-2.36]],0x456846,.8);
      this.footprints=[];this.boundaries=[];this.nodeHalos=[];this.nodePositions=[];
      [-1.65,1.65].forEach((x,i)=>{
        const color=i===0?0x769e59:0x4b9581;
        const overlay=new T.Mesh(new T.PlaneGeometry(2.95,3.4),new T.MeshBasicMaterial({color,transparent:true,opacity:.17,depthWrite:false,side:T.DoubleSide}));overlay.rotation.x=-Math.PI/2;overlay.position.set(x,.05,.05);scene.add(overlay);this.footprints.push(overlay);
        this.boundaries.push(line([[x-1.475,.06,-1.65],[x+1.475,.06,-1.65],[x+1.475,.06,1.75],[x-1.475,.06,1.75],[x-1.475,.06,-1.65]],color,.6,true));
        // Base touches the underside of the structural ceiling rail, followed by a short stem and device.
        cylinder(.22,.22,.04,x,2.81,.25,white);cylinder(.055,.055,.12,x,2.73,.25,metal);cylinder(.20,.19,.08,x,2.63,.25,white);cylinder(.19,.18,.02,x,2.58,.25,metal);
        cylinder(.04,.04,.006,x,2.567,.25,dark);
        const halo=new T.Mesh(new T.RingGeometry(.22,.245,48),new T.MeshBasicMaterial({color,side:T.DoubleSide,transparent:true,opacity:.6}));halo.rotation.x=-Math.PI/2;halo.position.set(x,2.555,.25);scene.add(halo);this.nodeHalos.push(halo);
        this.nodePositions.push(new T.Vector3(x,2.64,.25));
        line([[x,2.53,.25],[x,.08,.25]],color,.45,true);
      });
      const desk=(x,z,screen)=>{
        box(2.18,.075,.73,x,.77,z,wood);box(2.2,.018,.75,x,.813,z,white);
        for(const dx of [-.92,.92])for(const dz of [-.25,.25])box(.045,.73,.045,x+dx,.37,z+dz,metal);
        if(screen){box(.69,.43,.045,x,.99,z-.12,dark);box(.62,.35,.012,x,1.0,z-.09,glass);box(.045,.18,.04,x,.87,z-.13,metal);box(.34,.018,.17,x,.83,z-.12,metal);box(.47,.014,.15,x,.83,z+.17,white);}
        else {box(.34,.025,.25,x+.38,.84,z,wood);box(.29,.018,.23,x+.38,.856,z,white);box(.26,.012,.19,x-.25,.83,z+.05,white);}
      };
      const chair=(x,z,flip)=>{const g=new T.Group();g.position.set(x,0,z);g.rotation.y=flip?Math.PI:0;scene.add(g);box(.5,.1,.49,0,.48,0,sage,g);box(.5,.48,.075,0,.73,.24,sage,g);cylinder(.035,.035,.4,0,.25,0,metal,g);for(const a of [0,Math.PI/2]){const foot=box(.66,.035,.035,0,.08,0,metal,g);foot.rotation.y=a;}for(const dx of [-.3,.3]){box(.05,.04,.32,dx,.66,0,metal,g);box(.025,.17,.025,dx,.56,.08,metal,g);}};
      for(const x of [-1.65,1.65]){desk(x,-1.62,true);desk(x,1.75,false);chair(x,-.86,false);chair(x,.96,true);}
      box(.42,.95,1.32,-3.07,.49,-1.4,white);box(.44,.035,1.34,-3.07,.985,-1.4,wood);
      const plant=(x,z)=>{cylinder(.22,.17,.38,x,.23,z,white);cylinder(.19,.19,.015,x,.425,z,soil);for(let i=0;i<7;i++){const angle=i*2.4,leaf=new T.Mesh(new T.SphereGeometry(1,10,8),sage);leaf.scale.set(.09,.33,.11);leaf.position.set(x+Math.sin(angle)*.14,.6+(i%3)*.12,z+Math.cos(angle)*.14);leaf.rotation.z=Math.sin(angle)*.5;leaf.rotation.x=Math.cos(angle)*.5;leaf.castShadow=true;scene.add(leaf);}};plant(3,-2.03);plant(-3,2.12);
      const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.ShadowMaterial({color:0x405536,opacity:.12}));ground.rotation.x=-Math.PI/2;ground.position.y=-.23;ground.receiveShadow=true;scene.add(ground);
      const raycaster=new T.Raycaster(),pointer=new T.Vector2();let down=null;
      const hit=event=>{const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-((event.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(this.nodeHits||[],false)[0]?.object.userData.id;};
      this.nodeHits=this.nodePositions.map((p,i)=>{const o=new T.Mesh(new T.SphereGeometry(.28,10,8),new T.MeshBasicMaterial({visible:false}));o.position.copy(p);o.userData.id=`node-0${i+1}`;scene.add(o);return o;});
      canvas.addEventListener('pointerdown',e=>{this.stopCameraInput();down={x:e.clientX,y:e.clientY};},{signal:this.abort.signal});
      canvas.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<5){const id=hit(e);if(id)this.select(id);}down=null;},{signal:this.abort.signal});
      canvas.addEventListener('pointercancel',()=>{down=null;},{signal:this.abort.signal});
      canvas.addEventListener('pointermove',e=>{if(!down&&e.pointerType==='mouse'){const id=hit(e);this.setHover(id||null);canvas.style.cursor=id?'pointer':'grab';}},{signal:this.abort.signal});
      canvas.addEventListener('pointerleave',()=>this.setHover(null),{signal:this.abort.signal});
      canvas.addEventListener('keydown',e=>{const actions={ArrowLeft:'left',ArrowRight:'right','+':'in','=':'in','-':'out',Home:'reset'};if(actions[e.key]){e.preventDefault();this.moveCamera(actions[e.key]);}else if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const offset=camera.position.clone().sub(controls.target),s=new T.Spherical().setFromVector3(offset);s.phi=Math.max(controls.minPolarAngle,Math.min(controls.maxPolarAngle,s.phi+(e.key==='ArrowUp'?-.12:.12)));camera.position.copy(controls.target).add(offset.setFromSpherical(s));controls.update();this.requestFrame();}},{signal:this.abort.signal});
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.cancelFrame();this.showFallback('3D view unavailable. Sensor readings and inspection remain available.');},{signal:this.abort.signal});
      this.shadowRoot.querySelector('.experience').hidden=false;this.shadowRoot.querySelector('.fallback').hidden=true;this.ready=true;
      this.resize=()=>{if(!this.visible||!this.ready)return;const w=this.viewport.clientWidth,h=this.viewport.clientHeight;if(w<1||h<1)return;const aspect=w/h,halfH=3.65;camera.left=-halfH*aspect;camera.right=halfH*aspect;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();renderer.setSize(w,h,false);this.requestFrame();};
      this.resizeObserver=new ResizeObserver(this.resize);this.resizeObserver.observe(this.viewport);this.resize();this.syncHighlight();
    }catch(error){this.showFallback('3D view unavailable. Sensor readings and inspection remain available.');console.warn('Office 3D fallback:',error.message);}
  }
  showFallback(message){this.stopCameraInput();this.ready=false;this.cancelFrame();this.shadowRoot.querySelector('.experience').hidden=true;this.shadowRoot.querySelector('.fallback').hidden=false;this.shadowRoot.querySelector('.fallback-note').textContent=message;}
}
if(!customElements.get('omni-office-3d'))customElements.define('omni-office-3d',OmniOffice3D);
