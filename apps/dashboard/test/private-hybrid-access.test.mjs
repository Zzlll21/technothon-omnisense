import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {compileSource,sourceUrl} from './overview-fixture.mjs';
const {createPrivateSessionGuard,createPrivateLogin}=await compileSource(new URL('../src/lib/privateAuth.ts',import.meta.url));
const {resolvePublicConfig}=await compileSource(new URL('../src/lib/publicConfig.ts',import.meta.url));
const session=(token='aaa.bbb.ccc',expiry=Math.floor(Date.now()/1000)+3600)=>({access_token:token,expires_at:expiry,user:{id:'test-user',is_anonymous:false}});
function setup(){
 let callback,resolveLogin,state;const guard=createPrivateSessionGuard();
 const auth={onAuthStateChange:fn=>{callback=fn;return{data:{subscription:{unsubscribe(){callback=()=>{};}}}};},signInWithPassword:()=>new Promise(resolve=>{resolveLogin=resolve;}),signOut:async()=>{callback('SIGNED_OUT',null);}};
 const login=createPrivateLogin(auth,guard,s=>{state=s;});
 return{guard,login,event:(event,s)=>callback(event,s),finish:r=>resolveLogin(r),state:()=>state};
}
test('private data requests require the exact authenticated, non-anonymous, unexpired session token',()=>{
 const guard=createPrivateSessionGuard(),s=session();assert.equal(guard.permits({}),false);
 assert.equal(guard.set({...s,user:{...s.user,is_anonymous:true}}),false);
 assert.equal(guard.set(s),true);
 assert.equal(guard.permits({Authorization:`Bearer ${s.access_token}`}),true);
 assert.equal(guard.permits({Authorization:'Bearer sb_publishable_fake'}),false);
 assert.equal(guard.permits({Authorization:'Bearer another.jwt.token'}),false);
 assert.equal(guard.permits({Authorization:`Bearer ${s.access_token}`},s.expires_at*1000),false);
 guard.clear();assert.equal(guard.valid(),false);
});
test('login, token refresh, expiry and sign-out revoke local reader authority immediately',async()=>{
 const c=setup(),s=session();c.event('INITIAL_SESSION',s);assert.equal(c.guard.valid(),false);
 const pending=c.login.signIn('tester@example.invalid','FAKE_TEST_PASSWORD');
 c.finish({data:{session:s},error:null});await pending;assert.equal(c.state().user,'test-user');
 const fresh=session('new.jwt.token');c.event('TOKEN_REFRESHED',fresh);
 assert.equal(c.guard.permits({Authorization:`Bearer ${s.access_token}`}),false);assert.equal(c.guard.permits({Authorization:`Bearer ${fresh.access_token}`}),true);
 c.login.tick(fresh.expires_at*1000);assert.equal(c.state().user,null);assert.equal(c.guard.valid(),false);
 c.event('TOKEN_REFRESHED',session());assert.equal(c.guard.valid(),false);
 const second=c.login.signIn('tester@example.invalid','FAKE');c.finish({data:{session:session()},error:null});await second;
 await c.login.signOut();assert.equal(c.guard.valid(),false);assert.equal(c.state().user,null);c.login.dispose();
});
test('late login responses and token events cannot restore readers after logout; auth errors are sanitized',async()=>{
 const c=setup(),pending=c.login.signIn('tester@example.invalid','FAKE');await c.login.signOut();
 c.finish({data:{session:session()},error:null});await pending;c.event('SIGNED_IN',session());assert.equal(c.guard.valid(),false);
 const bad=c.login.signIn('tester@example.invalid','FAKE');c.finish({data:{session:null},error:{message:'sensitive arbitrary upstream error'}});await bad;
 assert.doesNotMatch(c.state().error,/sensitive|upstream/);assert.equal(c.state().user,null);c.login.dispose();
});

test('same-document session stays valid, logout revokes it, and a refreshed document requires explicit login again',async()=>{
 const current=setup(),s=session();
 const first=current.login.signIn('reader-a@example.invalid','TEST_ONLY');
 current.finish({data:{session:s},error:null});await first;
 current.login.tick();assert.equal(current.guard.valid(),true);assert.equal(current.state().user,'test-user');
 // Ordinary route renders do not create a new login controller; no second signIn is needed.
 assert.equal(current.guard.permits({Authorization:`Bearer ${s.access_token}`}),true);
 const refreshed=setup();refreshed.event('INITIAL_SESSION',s);
 assert.equal(refreshed.guard.valid(),false);assert.equal(refreshed.state().user,null);
 await current.login.signOut();assert.equal(current.guard.valid(),false);assert.equal(current.state().user,null);
 current.event('TOKEN_REFRESHED',s);assert.equal(current.guard.valid(),false);
 const config=await readFile(new URL('../src/lib/supabase.ts',import.meta.url),'utf8');
 assert.match(config,/persistSession: false/);assert.match(config,/detectSessionInUrl: false/);
 assert.doesNotMatch(config,/localStorage|sessionStorage|document\.cookie/);
 current.login.dispose();refreshed.login.dispose();
});
test('private frontend target requires independent approval while original synthetic configuration stays unchanged',()=>{
 const env={VITE_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_FAKE'};
 assert.deepEqual(resolvePublicConfig(env),{url:env.VITE_SUPABASE_URL,key:env.VITE_SUPABASE_PUBLISHABLE_KEY,error:null});
 assert.ok(resolvePublicConfig({...env,VITE_HYBRID_PRIVATE:'true'}).error);
 assert.ok(resolvePublicConfig({...env,VITE_HYBRID_PRIVATE:'true'},{url:'https://wrong.supabase.co',run_id:'x',preview_origin:'http://127.0.0.1:5178'}).error);
 assert.equal(resolvePublicConfig({...env,VITE_HYBRID_PRIVATE:'true'},{url:env.VITE_SUPABASE_URL,run_id:'approved-run',preview_origin:'http://127.0.0.1:5178'}).expectedRunId,'approved-run');
});
test('private auth gate renders no dashboard children or tokens before login, synthetic mode renders normally',async()=>{
 const path=new URL('../src/components/PrivateHybridAccess.tsx',import.meta.url),react=import.meta.resolve('react');
 const auth=sourceUrl(new URL('../src/lib/privateAuth.ts',import.meta.url));
 for(const privateHybrid of [true,false]){
  const mock=`data:text/javascript;base64,${Buffer.from(`export const supabase={};export const hybridAccess={privateHybrid:${privateHybrid},previewOrigin:'http://127.0.0.1:5178'};export const privateSession={};`).toString('base64')}`;
  let source=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  source=source.replace("import '../private-hybrid-access.css';",'').replace('import "../private-hybrid-access.css";','');
  for(const name of ['react/jsx-runtime','react'])for(const quote of ['"',"'"])source=source.replaceAll(quote+name+quote,JSON.stringify(name==='react'?react:import.meta.resolve(name)));
  source=source.replaceAll('../lib/supabase',mock).replaceAll('../lib/privateAuth',auth);
  const {PrivateHybridAccess}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const html=renderToStaticMarkup(React.createElement(PrivateHybridAccess,null,React.createElement('p',null,'PRIVATE_DATA_SENTINEL')));
  if(privateHybrid){assert.doesNotMatch(html,/PRIVATE_DATA_SENTINEL|access_token|sb_secret/);assert.match(html,/type="password"/);}
  else assert.match(html,/PRIVATE_DATA_SENTINEL/);
 }
 const main=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8');assert.doesNotMatch(main,/PrivateHybridAccess/);assert.match(main,/<App \/>/);
 const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');assert.match(app,/<PrivateHybridAccess><Suspense/);
});

async function renderLoginState(state, origin='https://omnisense-hybrid-spatial.vercel.app') {
 const path=new URL('../src/components/PrivateHybridAccess.tsx',import.meta.url),react=import.meta.resolve('react');
 const reactMock=`data:text/javascript;base64,${Buffer.from(`import * as real from ${JSON.stringify(react)};export const useRef=real.useRef,useEffect=real.useEffect;export const useState=initial=>initial&&typeof initial==='object'&&'busy' in initial?[${JSON.stringify(state)},()=>{}]:real.useState(initial);`).toString('base64')}`;
 const mock=`data:text/javascript;base64,${Buffer.from(`export const supabase={};export const hybridAccess={privateHybrid:true,previewOrigin:${JSON.stringify(origin)}};export const privateSession={};`).toString('base64')}`;
 let source=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 source=source.replace(/import ['"]\.\.\/private-hybrid-access\.css['"];?/,'');
 for(const quote of ['"',"'"])source=source.replaceAll(quote+'react/jsx-runtime'+quote,JSON.stringify(import.meta.resolve('react/jsx-runtime'))).replaceAll(quote+'react'+quote,JSON.stringify(reactMock));
 source=source.replaceAll('../lib/supabase',mock).replaceAll('../lib/privateAuth',sourceUrl(new URL('../src/lib/privateAuth.ts',import.meta.url)));
 const {PrivateHybridAccess}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
 return renderToStaticMarkup(React.createElement(PrivateHybridAccess,null,React.createElement('p',null,'PRIVATE_DATA_SENTINEL')));
}

test('login has branded, accessible stacked fields and its own eagerly imported, scoped stylesheet',async()=>{
 const html=await renderLoginState({user:null,busy:false,error:null});
 assert.match(html,/Welcome back/);assert.match(html,/Smart cooling management/);assert.match(html,/class="hybrid-login-card"/);
 assert.match(html,/for="login-email"/);assert.match(html,/type="email"[^>]*autoComplete="username"/);
 assert.match(html,/for="login-password"/);assert.match(html,/type="password"[^>]*autoComplete="current-password"/);
 assert.match(html,/type="submit"[^>]*>Sign In/);assert.match(html,/aria-labelledby="login-heading"/);
 assert.doesNotMatch(html,/PRIVATE_DATA_SENTINEL|approved isolated|Private Hybrid Dashboard|style=/);
 const component=await readFile(new URL('../src/components/PrivateHybridAccess.tsx',import.meta.url),'utf8');
 assert.match(component,/import '\.\.\/private-hybrid-access\.css'/);
 const css=await readFile(new URL('../src/private-hybrid-access.css',import.meta.url),'utf8');
 assert.match(css,/\.hybrid-login \.hybrid-login-form \{ display: grid/);
 assert.match(css,/100svh/);assert.match(css,/max-width: 480px/);assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/\.spatial-app|\.sa-|@import|url\(/);
});

test('login loading, failure and expiry states remain private and expose no upstream error contents',async()=>{
 const busy=await renderLoginState({user:null,busy:true,error:null});
 assert.match(busy,/aria-busy="true"/);assert.match(busy,/disabled=""/);assert.match(busy,/Signing in…/);assert.doesNotMatch(busy,/PRIVATE_DATA_SENTINEL/);
 const failure=await renderLoginState({user:null,busy:false,error:'sensitive upstream auth detail'});
 assert.match(failure,/role="alert"/);assert.match(failure,/Check your email and password/);assert.doesNotMatch(failure,/sensitive upstream|PRIVATE_DATA_SENTINEL/);
 const expired=await renderLoginState({user:null,busy:false,error:'Your test session expired. Sign in again.'});
 assert.match(expired,/Your session has expired/);
});

test('signed-in workspace markup is unchanged and a different production origin still fails closed',async()=>{
 const authenticated=await renderLoginState({user:'reader-a',busy:false,error:null});
 assert.equal(authenticated,'<div class="sa-notice"><span>Private hybrid test session</span> <button>Sign out</button></div><div><p>PRIVATE_DATA_SENTINEL</p></div>');
 const previous=globalThis.window;
 try{
  globalThis.window={location:{origin:'https://unapproved.example.com'}};
  const denied=await renderLoginState({user:null,busy:false,error:null});
  assert.match(denied,/Sign in unavailable/);assert.doesNotMatch(denied,/PRIVATE_DATA_SENTINEL|<form/);
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
