import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import {appendFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const local = host => !host || ['localhost','127.0.0.1','::1','[::1]'].includes(String(host));
function denied(host) {
  if (process.env.OMNISENSE_NETWORK_AUDIT) appendFileSync(process.env.OMNISENSE_NETWORK_AUDIT, JSON.stringify({blockedExternalConnection:String(host)})+'\n');
  throw new Error('External network access is disabled during offline Hybrid validation');
}
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
  const first=args[0];
  const options=Array.isArray(first)?first[0]:first;
  if(options&&typeof options==='object'){if(!options.path&&!local(options.hostname??options.host))denied(options.hostname??options.host);}
  else if(typeof args[1]==='string'&&!local(args[1]))denied(args[1]);
  return connect.apply(this,args);
};
const originalFetch=globalThis.fetch;
globalThis.fetch=function(input,...args){
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(['http:','https:'].includes(url.protocol)&&!local(url.hostname))denied(url.hostname);
  return originalFetch.call(this,input,...args);
};
for(const api of [http,https])for(const key of ['request','get']){
  const original=api[key];api[key]=function(input,...args){
    const host=typeof input==='string'||input instanceof URL?new URL(input).hostname:input?.hostname??input?.host;
    if(!local(host))denied(host);return original.call(this,input,...args);
  };
}
syncBuiltinESMExports();
