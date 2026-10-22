import { useEffect, useRef, useState } from 'react';
import type { ReactNode, FormEvent } from 'react';
import { supabase, hybridAccess, privateSession } from '../lib/supabase';
import { createPrivateLogin } from '../lib/privateAuth';
import type { PrivateLoginState } from '../lib/privateAuth';

export function PrivateHybridAccess({children}: {children:ReactNode}) {
  const [{user,busy,error},setState]=useState<PrivateLoginState>({user:null,busy:false,error:null}),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const login=useRef<ReturnType<typeof createPrivateLogin>|null>(null);
  const originValid=!hybridAccess.privateHybrid || typeof window==='undefined' || window.location.origin===hybridAccess.previewOrigin;
  useEffect(()=>{
    if(!hybridAccess.privateHybrid || !supabase || !originValid)return;
    const controller=createPrivateLogin(supabase.auth,privateSession,setState);login.current=controller;
    const timer=window.setInterval(()=>controller.tick(),1000);
    return()=>{controller.dispose();login.current=null;window.clearInterval(timer);};
  },[originValid]);
  if(!hybridAccess.privateHybrid)return <>{children}</>;
  if(hybridAccess.error || !supabase || !originValid)return <main><h1>Private Hybrid Dashboard unavailable</h1><p>Verify the approved test configuration and preview origin.</p></main>;
  async function signIn(e:FormEvent) {
    e.preventDefault();
    const secret=password;setPassword('');
    await login.current?.signIn(email,secret);
  }
  async function signOut() {
    setEmail('');setPassword('');await login.current?.signOut();
  }
  if(user)return <><div className="sa-notice"><span>Private hybrid test session</span> <button onClick={()=>void signOut()}>Sign out</button></div><div key={user}>{children}</div></>;
  return <main style={{maxWidth:420,margin:'10vh auto',padding:24}}><h1>Private Hybrid Dashboard</h1><p>Sign in with your approved isolated test account.</p><form onSubmit={e=>void signIn(e)}>
    <label>Email <input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
    <label>Password <input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} /></label>
    <button disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
    {error&&<p role="alert">{error}</p>}
  </form></main>;
}
