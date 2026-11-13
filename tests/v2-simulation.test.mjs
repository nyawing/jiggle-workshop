import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LuauState} from 'luau-web';
test('native V2 plus shared sampled-root wrapper runs in Workshop and accepts live settings',async()=>{
 const state=await LuauState.createAsync();
 try{
  const [api]=await state.loadstring(await readFile(new URL('../src/generated/simulation.lua',import.meta.url),'utf8'),'workshop-v2',true)();
  const identity=[1,0,0,0,1,0,0,0,1].join(',');
  await api.get('initialize')('0,0,0,0,1.5,0,0,-1.5,0','-1,0,1',[identity,identity,identity].join(','),.65,.3,2,3,1,0,0,0,0,180,identity,'v2-sync');
  await api.get('configure')(.7,.65,0,1,8,0,.65,.3,180);
  let pose;
  for(let i=1;i<=120;i++)pose=JSON.parse((await api.get('step')(1/60,i*16/60,Math.sin(i/60*3),0,0,identity))[0]);
  assert.equal(pose.length,36);assert(pose.every(Number.isFinite));
  assert(pose.slice(24+3).some((n,i)=>Math.abs(n-[1,0,0,0,1,0,0,0,1][i])>.001),'weighted terminal endpoint must rotate');
  const expected=JSON.parse(await readFile(new URL('./fixtures/v2-studio-2021-pose.json',import.meta.url),'utf8')).pose;
  const discrepancy=Math.max(...pose.map((n,i)=>Math.abs(n-expected[i])));
  assert(discrepancy<.001,`Workshop must match the actual Studio calculation: ${discrepancy}`);
  await api.get('configure')(.85,4,.5,2,3,0,.5,.4,90);
  for(let i=0;i<10;i++)pose=JSON.parse((await api.get('step')(1/60,32,0,0,.3))[0]);
  assert(pose.every(Number.isFinite));
 }finally{state.destroy();}
});

