import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import {LuauState} from 'luau-web';
const stock=JSON.parse(await readFile(new URL('../src/generated/fitting-r6.json',import.meta.url),'utf8'));
const source=(await readFile(new URL('../src/try-on.ts',import.meta.url),'utf8')).replace("import stockData from './generated/fitting-r6.json';",'const stockData='+JSON.stringify(stock)+';');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("'three'",JSON.stringify(import.meta.resolve('three')));
const {TryOn}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('fitting moves whole R6, jumps and lands; mount preserves attachment frame',()=>{
 const rig=new TryOn(new THREE.Scene());rig.show(true);rig.keys.add('KeyW');
 for(let i=0;i<60;i++)rig.update(1/60,0);
 assert(Math.abs(rig.position.z+16)<1e-7);rig.keys.clear();rig.jump();
 let peak=0;for(let i=0;i<120;i++){rig.update(1/60,0);peak=Math.max(peak,rig.height);}
 assert(peak>5);assert.equal(rig.height,0);
 const attachment=new THREE.Matrix4().makeRotationX(.3).setPosition(.2,.8,-.1);
 const m=attachment.elements,flat=[m[12],m[13],m[14],m[0],m[4],m[8],m[1],m[5],m[9],m[2],m[6],m[10]];
 const frame=stock.attachments.HatAttachment.frame;
 const attach=new THREE.Matrix4().set(frame[3],frame[4],frame[5],frame[0],frame[6],frame[7],frame[8],frame[1],frame[9],frame[10],frame[11],frame[2],0,0,0,1);
 const actual=rig.mount('hat',flat).multiply(attachment),expected=rig.rig.matrixWorld.clone().multiply(rig.rig.getObjectByName('Head').matrix).multiply(attach);
 actual.elements.forEach((n,i)=>assert(Math.abs(n-expected.elements[i])<1e-6));
 rig.show(false);assert.equal(rig.keys.size,0);assert.equal(rig.rig.visible,false);
});

test('live physics settings preserve pose; wind causes motion while root is stationary',async()=>{
 const state=await LuauState.createAsync();
 try{
  const [api]=await state.loadstring(await readFile(new URL('../src/generated/simulation.lua',import.meta.url),'utf8'),'live-test',true)();
  const identity=[1,0,0,0,1,0,0,0,1],rotation=[...identity,...identity,...identity].join(',');
  const init=()=>api.get('initialize')('0,0,0,0,1.5,0,0,-1.5,0','-1,0,1',rotation,.3,.3,2,3,1,0,0,0,0,180);
  await init();await api.get('configure')(.7,.65,0,1,8,0,.65,.3,180);
  const before=JSON.parse((await api.get('step')(1/60,1,0,0,0))[0]);
  await api.get('configure')(.8,.4,0,1,8,0,.65,.4,180);
  const after=JSON.parse((await api.get('step')(1/60,1,0,0,0))[0]);assert(after.every(Number.isFinite));assert.notDeepEqual(after,before);
  await init();await api.get('configure')(0,.4,1,5,8,0,.3,.3,180);
  let wind;for(let i=0;i<90;i++)wind=JSON.parse((await api.get('step')(1/60,0,0,0,0))[0]);
  await init();await api.get('configure')(0,.4,0,5,8,0,.3,.3,180);
  let calm;for(let i=0;i<90;i++)calm=JSON.parse((await api.get('step')(1/60,0,0,0,0))[0]);
  assert(wind.some((n,i)=>Math.abs(n-calm[i])>.0001),'wind changes pose without translating the root');
  await assert.rejects(()=>api.get('configure')(NaN,.5,0,1,8,0,.4,.3,180));
 }finally{state.destroy();}
});

test('held Space repeats jumps, release stops repeats, Shift Lock faces camera when strafing',()=>{
 const rig=new TryOn(new THREE.Scene());rig.show(true);rig.keys.add('Space');
 let jumps=0,last=0;
 for(let i=0;i<180;i++){rig.update(1/60,.7);if(rig.height>0&&last===0)jumps++;last=rig.height;}
 assert(jumps>=5,'Space must jump again after each landing');rig.keys.clear();
 for(let i=0;i<120;i++)rig.update(1/60,.7);
 assert.equal(rig.height,0);assert.equal(rig.velocity,0);
 rig.shiftLock=true;rig.keys.add('KeyD');rig.update(1/60,.7);assert.equal(rig.yaw,.7);
 rig.keys.clear();rig.update(1/60,-.3);assert.equal(rig.yaw,-.3,'camera turns avatar while idle too');
 const head=rig.rig.getObjectByName('Head').children[0];assert.equal(head.scale.x,1);
 rig.show(false);assert.equal(rig.shiftLock,false);
});
