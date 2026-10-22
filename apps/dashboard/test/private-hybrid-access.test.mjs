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
  for(const name of ['react/jsx-runtime','react'])for(const quote of ['"',"'"])source=source.replaceAll(quote+name+quote,JSON.stringify(name==='react'?react:import.meta.resolve(name)));
  source=source.replaceAll('../lib/supabase',mock).replaceAll('../lib/privateAuth',auth);
  const {PrivateHybridAccess}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const html=renderToStaticMarkup(React.createElement(PrivateHybridAccess,null,React.createElement('p',null,'PRIVATE_DATA_SENTINEL')));
  if(privateHybrid){assert.doesNotMatch(html,/PRIVATE_DATA_SENTINEL|access_token|sb_secret/);assert.match(html,/type="password"/);}
  else assert.match(html,/PRIVATE_DATA_SENTINEL/);
 }
 const main=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8');assert.match(main,/<PrivateHybridAccess><App \/><\/PrivateHybridAccess>/);
});
