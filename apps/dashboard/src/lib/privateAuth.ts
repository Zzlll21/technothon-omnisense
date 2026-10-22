export interface PrivateSession { access_token: string; expires_at?: number; user: {id:string;is_anonymous?:boolean} }
/** Memory only. No JWT, password or auth error is rendered, persisted or logged. */
export function createPrivateSessionGuard() {
  let session: PrivateSession | null = null;
  return {
    set(value: PrivateSession | null) {
      session = value && value.user && !value.user.is_anonymous && typeof value.user.id === 'string' &&
        typeof value.access_token === 'string' && value.access_token.split('.').length === 3 &&
        Number.isFinite(value.expires_at) && value.expires_at! * 1000 > Date.now() ? value : null;
      return session !== null;
    },
    clear() { session = null; },
    valid(now=Date.now()) { return session !== null && session.expires_at! * 1000 > now; },
    permits(headers: HeadersInit | undefined, now=Date.now()) {
      return session !== null && session.expires_at! * 1000 > now && new Headers(headers).get('Authorization') === `Bearer ${session.access_token}`;
    }
  };
}

export interface PrivateLoginState {user:string|null;busy:boolean;error:string|null}
interface PrivateAuthApi {
  onAuthStateChange(callback:(event:string,session:PrivateSession|null)=>void):{data:{subscription:{unsubscribe():void}}};
  signInWithPassword(input:{email:string;password:string}):Promise<{data:{session:PrivateSession|null};error:unknown}>;
  signOut(input:{scope:'local'}):Promise<unknown>;
}
export function createPrivateLogin(auth:PrivateAuthApi,guard:ReturnType<typeof createPrivateSessionGuard>,changed:(state:PrivateLoginState)=>void) {
  let accepting=false,disposed=false,generation=0,state:PrivateLoginState={user:null,busy:false,error:null};
  const update=(next:Partial<PrivateLoginState>)=>{state={...state,...next};if(!disposed)changed(state);};
  const subscription=auth.onAuthStateChange((_event,s)=>{
    if(_event==='SIGNED_OUT'){accepting=false;++generation;}
    if(!disposed && accepting && s && guard.set(s))update({user:s.user.id});
    else{guard.clear();update({user:null});}
  }).data.subscription;
  return {
    async signIn(email:string,password:string){
      const request=++generation;accepting=true;update({busy:true,error:null});
      try{
        const result=await auth.signInWithPassword({email,password});
        if(disposed || request!==generation)return;
        if(result.error || !result.data.session || !guard.set(result.data.session))throw new Error();
        update({user:result.data.session.user.id});
      }catch{if(!disposed && request===generation){accepting=false;guard.clear();update({user:null,error:'Sign-in failed. Use your approved test account.'});}}
      finally{if(!disposed && request===generation)update({busy:false});}
    },
    async signOut(){++generation;accepting=false;guard.clear();update({user:null,busy:false,error:null});await auth.signOut({scope:'local'}).catch(()=>{});},
    tick(now=Date.now()){if(state.user && !guard.valid(now)){accepting=false;guard.clear();update({user:null,error:'Your test session expired. Sign in again.'});}},
    dispose(){disposed=true;++generation;accepting=false;guard.clear();subscription.unsubscribe();}
  };
}
