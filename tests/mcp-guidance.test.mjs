import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import guidance from '../electron/mcp-guidance.cjs';

const {workflowInstructions,toolGuides,enhanceToolResult} = guidance;
const json = result => JSON.parse(result.content[0].text);

test('guides cover exactly the actual transport tools without executing server code', () => {
 const source = readFileSync(new URL('../electron/mcp-server.cjs',import.meta.url),'utf8');
 const definitions = source.slice(source.indexOf('const definitions = ['),source.indexOf('const tools ='));
 const names = [...definitions.matchAll(/^\s*\['([a-z_]+)'\s*,/gm)].map(m=>m[1]);
 assert.deepEqual(Object.keys(toolGuides).sort(),names.sort());
 for (const guide of Object.values(toolGuides)) {
  assert.equal(typeof guide.next,'string');
  assert.ok(guide.next.length < 300);
  assert.ok(Object.keys(guide).every(k=>['next','note'].includes(k)));
 }
});

test('workflow embeds minimal shape-based rigging, one weight pass and user motion handoff', () => {
 for (const pattern of [/1–2 screenshots/,/2 total control points/,/4–6/,/point_count - 1/,/bones only/,/automatic_weights once/,/whole.*(?:ear|flexible)/,/rigid mounting/,/Do not run simulation by default/,/Space/,/wait for feedback/]) assert.match(workflowInstructions,pattern);
 assert.match(toolGuides.mirror_chain.next,/assign weights after mirroring/);
 assert.match(toolGuides.automatic_weights.note,/cannot prove holes/);
 for (const name of ['simulate','configure_physics','automatic_weights']) {
  const guide = json(enhanceToolResult(name,{},{}))._guide;
  assert.match(JSON.stringify(guide),/Space/);
  assert.match(JSON.stringify(guide),/loop|iterate/);
 }
});

test('ordinary JSON properties and nested arrays remain complete and input stays untouched', () => {
 const value = {vertices:Array.from({length:12000},(_,i)=>[i,i+1,i+2]),ok:true,meta:{label:'unchanged'}};
 const original = structuredClone(value);
 const result = json(enhanceToolResult('get_vertices',value));
 const {_guide,...rest} = result;
 assert.deepEqual(rest,value);
 assert.deepEqual(value,original);
 assert.equal(typeof _guide.next,'string');
});

test('screenshot first JSON metadata gets guide; image blocks and envelope fields remain unchanged', () => {
 const image = Object.freeze({type:'image',mimeType:'image/png',data:'exact-base64',annotations:{audience:['user']}});
 const metadata = {viewport:{width:500,height:300},imageSize:{width:1000,height:600},scope:'viewport'};
 const first = {type:'text',text:JSON.stringify(metadata),annotations:{priority:1}};
 const value = {content:[first,image,{type:'text',text:'leave intact'}],isError:false,_meta:{keep:true}};
 const result = enhanceToolResult('screenshot',value);
 assert.strictEqual(result.content[1],image);
 assert.strictEqual(result.content[2],value.content[2]);
 assert.deepEqual(result._meta,value._meta);
 assert.equal(result.isError,false);
 const {_guide,...rest} = json(result);
 assert.deepEqual(rest,metadata);
 assert.match(_guide.note,/CSS pixels/);
 assert.equal(first.text,JSON.stringify(metadata));
 assert.match(toolGuides.brush_stroke.note,/viewport.width\/imageSize.width/);
});

test('arrays, primitives and non-JSON blocks retain schema with separate guide', () => {
 for (const value of [[1,{nested:[2,3]}],null,42,'literal']) {
  const result = enhanceToolResult('get_vertices',value);
  assert.deepEqual(json(result),value);
  assert.equal(typeof JSON.parse(result.content[1].text)._guide.next,'string');
 }
 const original = {content:[{type:'text',text:'not JSON'},{type:'text',text:'{"ok":true}'},{type:'text',text:'{"later":true}'}]};
 const result = enhanceToolResult('get_state',original);
 assert.strictEqual(result.content[0],original.content[0]);
 assert.equal(JSON.parse(result.content[1].text).ok,true);
 assert.strictEqual(result.content[2],original.content[2]);
});

test('diagnostics prefer weightsSummary and never echo unknown or secret data', () => {
 const secret = 'secret-private-label-or-token';
 const value = {weightsSummary:{weightedCount:21,zeroCount:4,token:secret},owners:{[secret]:9999},reference:secret};
 const guide = json(enhanceToolResult('automatic_weights',value,{token:secret}))._guide;
 assert.match(guide.note,/weightedCount=21/);
 assert.match(guide.note,/zeroCount=4/);
 assert.doesNotMatch(JSON.stringify(guide),new RegExp(`${secret}|9999`));
 const fallback = json(enhanceToolResult('automatic_weights',{owners:{[secret]:8,other:2}}))._guide;
 assert.match(fallback.note,/2 groups, 10 vertices/);
 assert.doesNotMatch(JSON.stringify(fallback),new RegExp(secret));
 assert.match(fallback.note,/spatial inspection/);
 assert.match(fallback.next,/non-target/);
});

test('contextual error recovery preserves errors without echoing text in guidance', () => {
 for (const [message,pattern] of [['Workshop busy secret',/settle/],['Empty selection secret',/nonempty/],['Unknown chain secret',/actual chain/],['Simulation running secret',/Space/]]) {
  const value = {content:[{type:'text',text:message}],isError:true};
  const result = enhanceToolResult('set_weights',value);
  assert.equal(result.isError,true);
  assert.equal(result.content[0].text,message);
  const guide = JSON.parse(result.content[1].text)._guide;
  assert.match(guide.next,pattern);
  assert.doesNotMatch(JSON.stringify(guide),/secret/);
 }
 const result = json(enhanceToolResult('set_weights',{ok:false,error:'Select nonempty surfaces'}));
 assert.match(result._guide.next,/nonempty/);
 assert.match(json(enhanceToolResult('get_state',{simulation:true}))._guide.next,/Ask the user to stop/);
});

test('unknown names are inert and each invocation has independent guide data', () => {
 assert.equal(typeof json(enhanceToolResult('__proto__',{}))._guide.next,'string');
 const first = json(enhanceToolResult('get_state',{}));
 first._guide.next='changed';
 assert.notEqual(json(enhanceToolResult('get_state',{}))._guide.next,'changed');
});

test('non-target cleanup requires an edit and a zero check across all owners',()=>{
 assert.match(workflowInstructions,/animate ONLY/);assert.match(workflowInstructions,/Selection alone changes no weights/);assert.match(workflowInstructions,/preserve pre-existing|Preserve pre-existing/);
 const select=json(enhanceToolResult('select_surfaces',{selectedSurfaces:[3]}))._guide;assert.match(select.next,/Selection alone/);assert.match(select.next,/allChains=true/);
 const zero=json(enhanceToolResult('set_weights',{cleanupSummary:{remainingNonzero:0}},{allChains:true}))._guide;assert.match(zero.next,/zero across all chains/);
 const dirty=json(enhanceToolResult('set_weights',{cleanupSummary:{remainingNonzero:2}},{allChains:true}))._guide;assert.match(dirty.next,/do not claim/);
});
