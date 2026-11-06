import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createMcpServer} from '../electron/mcp-server.cjs';

const rpc=(method,params={},id=1)=>({jsonrpc:'2.0',id,method,params});
async function fixture(t,dispatch=async()=>({ok:true}),onActivity){
 const server=await createMcpServer({token:'test-secret',dispatch,onActivity});
 t.after(()=>server.close());
 const request=(body,options={})=>new Promise((resolve,reject)=>{
  const data=typeof body==='string'?body:JSON.stringify(body);
  const headers={Authorization:'Bearer test-secret','Content-Type':'application/json',Accept:'application/json, text/event-stream',...options.headers};
  if(!headers['Transfer-Encoding'])headers['Content-Length']=Buffer.byteLength(data);
  const req=http.request(server.url,{method:options.method??'POST',headers},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{const raw=Buffer.concat(chunks).toString();resolve({status:res.statusCode,headers:res.headers,body:raw?JSON.parse(raw):undefined});});
  });req.on('error',reject);req.end(data);
 });
 return {...server,request};
}
test('initialization versions, stateless notifications, ping and explicit tool metadata',async t=>{
 const s=await fixture(t);
 assert.match(s.url,/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
 for(const version of ['2025-03-26','2025-06-18','2025-11-25','unknown']){
  const r=await s.request(rpc('initialize',{protocolVersion:version,capabilities:{},clientInfo:{name:'test',version:'1'}}));
  assert.equal(r.body.result.protocolVersion,version==='unknown'?'2025-11-25':version);
  assert.deepEqual(r.body.result.capabilities,{tools:{listChanged:false}});
  assert.match(r.body.result.instructions,/image-capable.*get_state.*mesh-local/);
  assert.match(r.body.result.instructions,/Authorization.*oauth: false/);
 }
 assert.equal((await s.request({jsonrpc:'2.0',method:'notifications/initialized'})).status,202);
 assert.deepEqual((await s.request(rpc('ping',{},0))).body,{jsonrpc:'2.0',id:0,result:{}});
 const list=(await s.request(rpc('tools/list'))).body.result.tools;
 assert.deepEqual(list.map(x=>x.name),['get_examples','get_state','get_vertices','import_accessory','set_view','screenshot','create_chain','mirror_chain','brush_stroke','mirror_weights','move_bone','select_chain','select_surfaces','set_weights','automatic_weights','configure_physics','simulate','undo','save_project','export_accessory']);
 for(const tool of list)assert.equal(tool.inputSchema.additionalProperties,false);
});
test('dispatch arguments, plain JSON, image content and tool failures',async t=>{
 const calls=[];
 const image={content:[{type:'image',mimeType:'image/png',data:'aW1hZ2U='}]};
 const s=await fixture(t,async(name,args)=>{calls.push([name,args]);if(name==='undo')throw Error('Renderer failed');return name==='screenshot'?image:{meshLocal:true};},()=>{throw Error('observer');});
 const args={start:[0,1,-2],end:[3,4,5],name:'chain'};
 const r=await s.request(rpc('tools/call',{name:'create_chain',arguments:args},'abc'));
 assert.equal(r.body.id,'abc');assert.deepEqual(calls,[['create_chain',args]]);
 assert.equal(JSON.parse(r.body.result.content[0].text).meshLocal,true);assert(JSON.parse(r.body.result.content[0].text)._guide.next);
 const shot=(await s.request(rpc('tools/call',{name:'screenshot'}))).body.result;assert.deepEqual(shot.content[0],image.content[0]);assert(shot.content.some(b=>b.type==='text'&&JSON.parse(b.text)._guide));
 const failed=(await s.request(rpc('tools/call',{name:'undo'}))).body.result;assert.equal(failed.isError,true);assert.equal(failed.content[0].text,'Renderer failed');assert(failed.content.length>1);
});
test('strict tool whitelist and schemas reject unexpected values before dispatch',async t=>{
 let calls=0;const s=await fixture(t,async()=>{calls++;return {};});
 const invalid=[['eval',{}],['get_state',{code:'x'}],['get_vertices',{offset:-1}],['get_vertices',{limit:257}],['get_vertices',{limit:0}],['import_accessory',{reference:3}],['import_accessory',{reference:'x',discardChanges:1}],['set_view',{view:'rear'}],['screenshot',{display:'wireframe'}],['create_chain',{start:[1,2],end:[0,0,0]}],['move_bone',{index:0.5,position:[0,0,0]}],['select_chain',{}],['select_surfaces',{components:[-1],mode:'add'}],['set_weights',{operation:'set',weight:1.1}],['set_weights',{operation:'set',vertices:Array(10001).fill(0)}],['simulate',{running:'yes'}],['save_project',{path:'x'}],['get_state',[]],['get_state',{__proto__:null,constructor:'x'}]];
 for(const [name,args] of invalid)assert.equal((await s.request(rpc('tools/call',{name,arguments:args}))).body.error.code,-32602,name);
 assert.equal(calls,0);
 assert.equal((await s.request(rpc('tools/call',{name:'get_state',arguments:null}))).body.error.code,-32602);
 for(const [name,args] of [['get_vertices',{offset:0,limit:256}],['set_view',{view:'front',display:'bones'}],['select_surfaces',{components:[0,1],mode:'replace'}],['set_weights',{operation:'erase',weight:0,vertices:[0]}],['simulate',{running:false}],['automatic_weights',{}],['export_accessory',{}]])assert.ok((await s.request(rpc('tools/call',{name,arguments:args}))).body.result);
});
test('authentication, exact host and own HTTP origins apply to every method',async t=>{
 const s=await fixture(t);
 for(const method of ['POST','GET','DELETE','OPTIONS']){
  assert.equal((await s.request(rpc('ping'),{method,headers:{Authorization:''}})).status,401);
  assert.equal((await s.request(rpc('ping'),{method,headers:{Authorization:'Bearer wrong'}})).status,401);
  assert.equal((await s.request(rpc('ping'),{method,headers:{Host:'evil.example'}})).status,403);
  assert.equal((await s.request(rpc('ping'),{method,headers:{Origin:'null'}})).status,403);
 }
 for(const host of [`localhost:${s.port}`,`127.0.0.1:${s.port}`])assert.equal((await s.request(rpc('ping'),{headers:{Host:host,Origin:`http://${host}`}})).status,200);
 for(const host of ['localhost',`127.0.0.1:${s.port+1}`,`localhost.evil:${s.port}`,`127.0.0.1:${s.port}@evil`])assert.equal((await s.request(rpc('ping'),{headers:{Host:host}})).status,403);
 for(const origin of ['https://localhost:'+s.port,'http://localhost:1','https://evil.example',`http://localhost:${s.port}/`])assert.equal((await s.request(rpc('ping'),{headers:{Origin:origin}})).status,403);
 for(const method of ['GET','DELETE'])assert.equal((await s.request('',{method})).status,405);
});
test('HTTP headers, JSON framing, IDs and body limits',async t=>{
 const s=await fixture(t);
 assert.equal((await s.request(rpc('ping'),{headers:{'Content-Type':'text/plain'}})).status,415);
 for(const accept of ['text/event-stream','*/*','application/json;q=0'])assert.equal((await s.request(rpc('ping'),{headers:{Accept:accept}})).status,406);
 assert.equal((await s.request(rpc('ping'),{headers:{Accept:'application/json'}})).status,200);
 assert.equal((await s.request(rpc('ping'),{headers:{'MCP-Protocol-Version':'bad'}})).status,400);
 assert.equal((await s.request('{')).body.error.code,-32700);
 for(const id of [null,true,{},[],1.5])assert.equal((await s.request(rpc('ping',{},id))).body.error.code,-32600);
 for(const message of [[],{},rpc('ping',[]),{jsonrpc:'1.0',id:1,method:'ping'}])assert.equal((await s.request(message)).status,400);
 assert.equal((await s.request(rpc('missing'))).body.error.code,-32601);
 assert.equal((await s.request(rpc('initialize',{}))).body.error.code,-32602);
 const exact=JSON.stringify({...rpc('ping'),padding:''});
 assert.equal((await s.request(exact.replace('"padding":""','"padding":"'+'x'.repeat(1024*1024-Buffer.byteLength(exact))+'"'))).status,200);
 assert.equal((await s.request('x'.repeat(1024*1024+1))).status,413);
 assert.equal((await s.request('x'.repeat(1024*1024+1),{headers:{'Transfer-Encoding':'chunked'}})).status,413);
});
test('busy calls are rejected, ping stays responsive, close awaits dispatch and is idempotent',async t=>{
 let release,started;const entered=new Promise(r=>{started=r;});let calls=0;
 const s=await fixture(t,()=>{calls++;started();return new Promise(r=>{release=r;});});
 const first=s.request(rpc('tools/call',{name:'undo'}));await entered;
 const attempts=await Promise.all(Array.from({length:20},()=>s.request(rpc('tools/call',{name:'undo'}))));
 for(const r of attempts)assert.equal(r.body.error.code,-32000);
 assert.equal(calls,1);assert.equal((await s.request(rpc('ping'))).status,200);
 let closed=false;const closing=s.close();assert.equal(s.close(),closing);closing.then(()=>{closed=true;});
 await new Promise(r=>setImmediate(r));assert.equal(closed,false);
 release({done:true});assert.ok((await first).body.result);await closing;assert.equal(closed,true);
});
test('response timeout retains dispatch lock until actual settlement',async t=>{
 let release,started;const entered=new Promise(r=>{started=r;});let calls=0;
 const s=await fixture(t,()=>{calls++;if(calls>1)return {done:true};started();return new Promise(r=>{release=r;});});
 t.mock.timers.enable({apis:['setTimeout']});
 const first=s.request(rpc('tools/call',{name:'undo'}));await entered;
 t.mock.timers.tick(360000);
 assert.equal((await first).body.result.isError,true);
 assert.equal((await s.request(rpc('tools/call',{name:'undo'}))).body.error.code,-32000);
 assert.equal(calls,1);release({done:true});await new Promise(r=>setImmediate(r));
 t.mock.timers.reset();
 assert.ok((await s.request(rpc('tools/call',{name:'undo'}))).body.result);
 assert.equal(calls,2);
});
