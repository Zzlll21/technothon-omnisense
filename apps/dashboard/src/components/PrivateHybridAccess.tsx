import { useEffect, useRef, useState } from 'react';
import type { ReactNode, FormEvent } from 'react';
import { supabase, hybridAccess, privateSession } from '../lib/supabase';
import { createPrivateLogin } from '../lib/privateAuth';
import type { PrivateLoginState } from '../lib/privateAuth';
import '../private-hybrid-access.css';

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
  if(hybridAccess.error || !supabase || !originValid)return <main className="hybrid-login"><section className="hybrid-login-card" aria-labelledby="login-unavailable-heading"><div className="hybrid-login-brand"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" /><path d="m23 8-15 8 15 8" /></svg><span>omnisense</span></div><p className="hybrid-login-subtitle">Smart cooling management</p><h1 id="login-unavailable-heading">Sign in unavailable</h1><p className="hybrid-login-description" role="alert">Please open OmniSense at its configured website address. If this continues, contact your administrator.</p></section></main>;
  async function signIn(e:FormEvent) {
    e.preventDefault();
    const secret=password;setPassword('');
    await login.current?.signIn(email,secret);
  }
  async function signOut() {
    setEmail('');setPassword('');await login.current?.signOut();
  }
  if(user)return <><div className="sa-notice"><span>Private hybrid test session</span> <button onClick={()=>void signOut()}>Sign out</button></div><div key={user}>{children}</div></>;
  return <main className="hybrid-login"><section className="hybrid-login-card" aria-labelledby="login-heading">
    <div className="hybrid-login-brand"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" /><path d="m23 8-15 8 15 8" /></svg><span>omnisense</span></div>
    <p className="hybrid-login-subtitle">Smart cooling management</p>
    <header className="hybrid-login-heading"><h1 id="login-heading">Welcome back</h1><p id="login-description">Sign in to your OmniSense workspace.</p></header>
    <form className="hybrid-login-form" onSubmit={e=>void signIn(e)} aria-describedby="login-description" aria-busy={busy}>
      <label htmlFor="login-email">Email address<input id="login-email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="you@company.com" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
      <label htmlFor="login-password">Password<input id="login-password" type="password" autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={e=>setPassword(e.target.value)} /></label>
      {error&&<p className="hybrid-login-error" id="login-error" role="alert">{error === 'Your test session expired. Sign in again.' ? 'Your session has expired. Please sign in again.' : 'We couldn’t sign you in. Check your email and password, then try again.'}</p>}
      <button className="hybrid-login-submit" type="submit" disabled={busy}>{busy?'Signing in…':'Sign In'}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
    </form>
    <p className="hybrid-login-note"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="8.5" width="11" height="8" rx="1.5" /><path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" /></svg>Access is limited to authorized accounts.</p>
  </section></main>;
}
