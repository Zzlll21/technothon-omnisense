// Visualization-only port of the approved office prototype. No SDP reads or React state.
import * as T from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { officePosition, coverageRect, cameraEase, cameraLimits, cameraMotion } from './officeLayout';

export function createOfficeRenderer(canvas, viewport, callbacks) {
  return new OfficeScene(canvas, viewport, callbacks);
}

class OfficeScene {
  constructor(canvas, viewport, callbacks) {
    this.canvas=canvas; this.viewport=viewport; this.callbacks=callbacks;
    this.abort=new AbortController(); this.frame=0; this.visible=true; this.ready=true;
    this.nodes=[]; this.selected=null; this.hovered=null; this.signature='';
    this.reduce=matchMedia('(prefers-reduced-motion:reduce)');
    const signal=this.abort.signal;
    const renderer=this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.75)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap;
    renderer.outputColorSpace=T.SRGBColorSpace; renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
    this.scene=new T.Scene();
    const camera=this.camera=new T.OrthographicCamera(-5,5,4,-4,.1,70); camera.position.set(8,7.6,9); camera.lookAt(0,1,0);
    const controls=this.controls=new OrbitControls(camera,canvas);
    controls.target.set(0,1,0); controls.enablePan=false; controls.enableZoom=false; controls.enableDamping=!this.reduce.matches;
    controls.dampingFactor=.13; controls.rotateSpeed=.65; controls.minPolarAngle=Math.PI/7; controls.maxPolarAngle=Math.PI/2.6;
    controls.minAzimuthAngle=cameraLimits.minAzimuth; controls.maxAzimuthAngle=cameraLimits.maxAzimuth;
    controls.update(); controls.saveState(); controls.addEventListener('change',()=>this.requestFrame());
    const fine=matchMedia('(pointer:fine)');
    const setTouch=()=>{controls.enableRotate=fine.matches;canvas.style.touchAction=fine.matches?'none':'pan-y pinch-zoom';};
    setTouch(); fine.addEventListener('change',setTouch,{signal});
    this.buildArchitecture();
    this.raycaster=new T.Raycaster(); this.pointer=new T.Vector2(); let down=null;
    canvas.addEventListener('pointerdown',e=>{this.stopCameraInput();down={x:e.clientX,y:e.clientY};},{signal});
    canvas.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<5){const id=this.hit(e);if(id)callbacks.onSelect(id);}down=null;},{signal});
    canvas.addEventListener('pointercancel',()=>{down=null;},{signal});
    canvas.addEventListener('pointermove',e=>{if(!down&&e.pointerType==='mouse'){const id=this.hit(e);this.hoverNode(id||null);canvas.style.cursor=id?'pointer':'grab';}},{signal});
    canvas.addEventListener('pointerleave',()=>this.hoverNode(null),{signal});
    viewport.addEventListener('wheel',e=>{
      if(!this.ready||e.ctrlKey||e.metaKey||!e.deltaY||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
      e.preventDefault(); this.endHold(false); this.rotationTween=null;
      const unit=e.deltaMode===1?16:e.deltaMode===2?viewport.clientHeight:1;
      const delta=Math.max(-120,Math.min(120,e.deltaY*unit));
      this.setZoomTarget((this.zoomTween?.to??camera.zoom)*Math.exp(-delta*Math.log(cameraMotion.zoomStep)/100));
    },{signal,passive:false});
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.stopCameraInput();this.ready=false;this.cancelFrame();callbacks.onUnavailable();},{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.stopCameraInput();this.cancelFrame();}else this.requestFrame();},{signal});
    window.addEventListener('blur',()=>this.stopCameraInput(),{signal});
    this.reduce.addEventListener('change',()=>{this.stopCameraInput();controls.enableDamping=!this.reduce.matches;this.requestFrame();},{signal});
    this.resizeObserver=new ResizeObserver(()=>this.resize()); this.resizeObserver.observe(viewport);
    this.intersectionObserver=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;if(this.visible)this.resize();else{this.stopCameraInput();this.cancelFrame();}});
    this.intersectionObserver.observe(viewport); this.resize();
  }
  buildArchitecture() {
    const scene=this.scene;
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
    this.makeSensor=(node,index)=>{
      const p=officePosition(node.x,node.y),r=coverageRect(p.x,p.z),color=index===0?0x769e59:0x4b9581;
      const group=new T.Group(); group.position.set(p.x,0,p.z); scene.add(group);
      const fill=new T.MeshBasicMaterial({color,transparent:true,opacity:.25,depthWrite:false,side:T.DoubleSide});
      const footprint=new T.Mesh(new T.PlaneGeometry(r.right-r.left,r.front-r.back),fill);
      footprint.rotation.x=-Math.PI/2; footprint.position.set((r.left+r.right)/2-p.x,.05,(r.back+r.front)/2-p.z); group.add(footprint);
      const boundaryMat=new T.LineDashedMaterial({color,dashSize:.07,gapSize:.05,transparent:true,opacity:.75});
      const boundary=new T.Line(new T.BufferGeometry().setFromPoints([[r.left,.06,r.back],[r.right,.06,r.back],[r.right,.06,r.front],[r.left,.06,r.front],[r.left,.06,r.back]].map(([x,y,z])=>new T.Vector3(x-p.x,y,z-p.z))),boundaryMat);
      boundary.computeLineDistances(); group.add(boundary);
      // A small ceiling brace connects configured positions to the retained structural rail.
      box(.075,.06,Math.abs(p.z-.25)+.12,0,2.86,(.25-p.z)/2,white,group);
      cylinder(.22,.22,.04,0,2.81,0,white,group); cylinder(.055,.055,.12,0,2.73,0,metal,group);
      cylinder(.20,.19,.08,0,2.63,0,white,group); cylinder(.19,.18,.02,0,2.58,0,metal,group); cylinder(.04,.04,.006,0,2.567,0,dark,group);
      const haloMat=new T.MeshBasicMaterial({color,side:T.DoubleSide,transparent:true,opacity:.22});
      const halo=new T.Mesh(new T.RingGeometry(.22,.245,48),haloMat); halo.rotation.x=-Math.PI/2; halo.position.set(0,2.555,0); group.add(halo);
      const stemMat=new T.LineDashedMaterial({color,dashSize:.07,gapSize:.05,transparent:true,opacity:.45});
      const stem=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0,2.53,0),new T.Vector3(0,.08,0)]),stemMat); stem.computeLineDistances(); group.add(stem);
      const hitMat=new T.MeshBasicMaterial({visible:false}); const hit=new T.Mesh(new T.SphereGeometry(.28,10,8),hitMat);
      hit.position.set(0,2.64,0); hit.userData.id=node.id; group.add(hit);
      return {id:node.id,group,fill,boundaryMat,haloMat,hit,position:new T.Vector3(p.x,p.y,p.z),owned:[fill,boundaryMat,haloMat,stemMat,hitMat]};
    };
  }
  setNodes(nodes) {
    const signature=JSON.stringify(nodes.map(n=>[n.id,n.x,n.y]));
    if(signature===this.signature)return;
    this.signature=signature;
    for(const node of this.nodes){this.scene.remove(node.group);node.group.traverse(o=>o.geometry?.dispose());node.owned.forEach(m=>m.dispose());}
    this.nodes=nodes.map((node,index)=>this.makeSensor(node,index)); this.highlight();
  }
  selectNode(id) {if(this.selected!==id){this.selected=id;this.highlight();}}
  hoverNode(id) {if(this.hovered!==id){this.hovered=id;this.highlight();}}
  highlight() {
    for(const node of this.nodes){const active=node.id===(this.hovered||this.selected);node.fill.opacity=active?.42:.25;node.boundaryMat.opacity=active?1:.75;node.haloMat.opacity=active?.85:.22;}
    this.requestFrame();
  }
  hit(event) {
    const r=this.canvas.getBoundingClientRect(); this.pointer.set((event.clientX-r.left)/r.width*2-1,-((event.clientY-r.top)/r.height)*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);
    return this.raycaster.intersectObjects(this.nodes.map(n=>n.hit),false)[0]?.object.userData.id;
  }
  resize() {
    if(!this.ready||!this.visible)return;
    const w=this.viewport.clientWidth,h=this.viewport.clientHeight;if(w<1||h<1)return;
    const aspect=w/h,halfH=3.65;
    Object.assign(this.camera,{left:-halfH*aspect,right:halfH*aspect,top:halfH,bottom:-halfH});
    this.camera.updateProjectionMatrix(); this.renderer.setSize(w,h,false); this.requestFrame();
  }
  requestFrame() {
    if(!this.ready||!this.visible||document.hidden||this.frame)return;
    this.frame=requestAnimationFrame(now=>{this.frame=0;const moving=this.advanceCamera(now),changed=this.controls.update();this.render();if(moving||(changed&&this.controls.enableDamping))this.requestFrame();});
  }
  cancelFrame() {if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;}
  render() {
    this.renderer.render(this.scene,this.camera);
    const w=this.viewport.clientWidth,h=this.viewport.clientHeight;
    this.callbacks.onProject(this.nodes.map(node=>{const p=node.position.clone().project(this.camera);return{id:node.id,x:(p.x*.5+.5)*w+15,y:(-p.y*.5+.5)*h-26,visible:p.z<=1};}));
    const a=this.controls.getAzimuthalAngle();
    this.callbacks.onLimits({left:a>cameraLimits.minAzimuth+1e-6,right:a<cameraLimits.maxAzimuth-1e-6,in:this.camera.zoom<cameraLimits.maxZoom-1e-6,out:this.camera.zoom>cameraLimits.minZoom+1e-6});
  }
  applyZoom(value) {this.camera.zoom=Math.max(cameraLimits.minZoom,Math.min(cameraLimits.maxZoom,value));this.camera.updateProjectionMatrix();}
  applyRotation(value) {
    const angle=Math.max(cameraLimits.minAzimuth,Math.min(cameraLimits.maxAzimuth,value));
    const offset=this.camera.position.clone().sub(this.controls.target),radius=Math.hypot(offset.x,offset.z);
    this.camera.position.x=this.controls.target.x+radius*Math.sin(angle);this.camera.position.z=this.controls.target.z+radius*Math.cos(angle);
    this.flushDamping();return angle;
  }
  flushDamping() {const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;}
  setZoomTarget(to) {
    to=Math.max(cameraLimits.minZoom,Math.min(cameraLimits.maxZoom,to));
    if(this.reduce.matches){this.zoomTween=null;this.applyZoom(to);}else this.zoomTween={from:this.camera.zoom,to,start:performance.now()};
    this.requestFrame();
  }
  startHold(action) {
    if(!this.ready)return;this.stopCameraInput();this.flushDamping();
    this.hold={action,start:performance.now(),zoom:this.camera.zoom,angle:this.controls.getAzimuthalAngle()};this.requestFrame();
  }
  endHold(tap) {
    const hold=this.hold;if(!hold)return;this.hold=null;
    const elapsed=performance.now()-hold.start,zoom=hold.action==='in'||hold.action==='out',direction=hold.action==='in'||hold.action==='right'?1:-1;
    if(tap&&elapsed<180){
      if(zoom)this.setZoomTarget(hold.zoom*(direction===1?cameraMotion.zoomStep:1/cameraMotion.zoomStep));
      else{const to=Math.max(cameraLimits.minAzimuth,Math.min(cameraLimits.maxAzimuth,hold.angle+direction*cameraMotion.rotationStep));if(this.reduce.matches)this.applyRotation(to);else this.rotationTween={from:this.controls.getAzimuthalAngle(),to,start:performance.now()};}
    }else if(tap){if(zoom)this.applyZoom(hold.zoom*Math.exp(direction*cameraMotion.zoomRate*elapsed/1000));else this.applyRotation(hold.angle+direction*cameraMotion.rotationRate*elapsed/1000);}
    this.requestFrame();
  }
  advanceCamera(now) {
    if(this.hold){
      const hold=this.hold,t=Math.max(0,now-hold.start)/1000,d=hold.action==='in'||hold.action==='right'?1:-1;
      if(hold.action==='in'||hold.action==='out'){this.applyZoom(hold.zoom*Math.exp(d*cameraMotion.zoomRate*t));if(this.camera.zoom===cameraLimits.minZoom||this.camera.zoom===cameraLimits.maxZoom)this.endHold(false);}
      else{const a=this.applyRotation(hold.angle+d*cameraMotion.rotationRate*t);if(a<=cameraLimits.minAzimuth+1e-6||a>=cameraLimits.maxAzimuth-1e-6)this.endHold(false);}
    }else for(const key of ['zoomTween','rotationTween']){
      const tween=this[key];if(!tween)continue;const t=Math.max(0,Math.min(1,(now-tween.start)/cameraMotion.duration));
      const value=tween.from+(tween.to-tween.from)*cameraEase(t);if(key==='zoomTween')this.applyZoom(value);else this.applyRotation(value);if(t===1)this[key]=null;
    }
    return Boolean(this.hold||this.zoomTween||this.rotationTween);
  }
  stopCameraInput() {this.hold=null;this.zoomTween=null;this.rotationTween=null;}
  moveCamera(action) {
    if(!this.ready)return;this.stopCameraInput();
    if(action==='reset')this.controls.reset();
    else if(action==='in'||action==='out')this.applyZoom(this.camera.zoom*(action==='in'?cameraMotion.zoomStep:1/cameraMotion.zoomStep));
    else if(action==='left'||action==='right')this.applyRotation(this.controls.getAzimuthalAngle()+(action==='left'?-1:1)*cameraMotion.rotationStep);
    else{const offset=this.camera.position.clone().sub(this.controls.target),s=new T.Spherical().setFromVector3(offset);s.phi=Math.max(this.controls.minPolarAngle,Math.min(this.controls.maxPolarAngle,s.phi+(action==='up'?-.12:.12)));this.camera.position.copy(this.controls.target).add(offset.setFromSpherical(s));this.flushDamping();}
    this.requestFrame();
  }
  dispose() {
    this.ready=false;this.stopCameraInput();this.abort.abort();this.resizeObserver.disconnect();this.intersectionObserver.disconnect();this.cancelFrame();this.controls.dispose();
    const geometries=new Set(),materials=new Set();this.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.renderer.dispose();this.renderer.forceContextLoss();
  }
}
