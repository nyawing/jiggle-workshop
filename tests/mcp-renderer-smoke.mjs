// Isolated browser harness: preload stub receives the real renderer handler.
import {createServer} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const server=await createServer({root:new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),server:{port:0}});
await server.listen();
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.addInitScript(()=>{window.workshop={testMode:true,onMcpCommand:handler=>{window.mcpTest=handler;return ()=>{};}};});
 await page.goto(server.resolvedUrls.local[0]);
 await page.waitForFunction(()=>!!window.mcpTest);
 const call=(action,args={})=>page.evaluate(([action,args])=>window.mcpTest(action,args),[action,args]);
 const rejects=async(action,args)=>assert.rejects(()=>call(action,args));
 assert.equal((await call('get_state')).vertexCount,0);
 await page.locator('#demo').click();
 await page.waitForFunction(()=>window.mcpTest('get_state').then(s=>s.vertexCount>0));
 await rejects('set_weights',{operation:'set'});
 await rejects('get_vertices',{limit:257});
 await rejects('get_vertices',{offset:-1});
 await rejects('create_chain',{start:[0,1,0],end:[0,-1,0],segments:0});
 await call('create_chain',{start:[0,1,0],end:[0,-1,0],name:'Test chain'});
 const state=await call('get_state');assert.equal(state.chains.length,1);
 await rejects('set_weights',{operation:'set'});
 await call('set_weights',{operation:'set',vertices:[0],weight:.7});
 assert(Math.abs((await call('get_vertices',{limit:1,screen:true})).vertices[0].weight-.7)<1e-6);
 await call('undo');assert.equal((await call('get_vertices',{limit:1})).vertices[0].weight,0);
 await rejects('import_accessory',{reference:'123'});
 await rejects('set_weights',{operation:'reassign',vertices:[0]});
 const capture=await call('screenshot',{view:'top',display:'bones'});assert(capture.captureRect.width>0);assert(capture.captureRect.height>0);
 assert(!('texture' in capture));assert(!('sourceHash' in capture));
 await call('move_bone',{index:2,position:[.2,-1,0]});
 assert.deepEqual((await call('get_state')).bones[2].position,[.2,-1,0]);
 await call('simulate',{running:true});
 await rejects('set_weights',{operation:'set',vertices:[0]});await call('stop');
 console.log('MCP renderer smoke passed');
} finally {await browser.close();await server.close();}
