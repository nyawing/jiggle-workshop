import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LuauState} from 'luau-web';
test('opt-in cape reference bends through a moving chain and retains fixed-step cadence',async()=>{
 const state=await LuauState.createAsync();
 try{
  const [api]=await state.loadstring(await readFile(new URL('../src/generated/simulation.lua',import.meta.url),'utf8'),'cape',true)();
  const identity='1,0,0,0,1,0,0,0,1',count=8,positions=Array.from({length:count},(_,i)=>[0,1.5-i*.4,0]).flat().join(','),parents=Array.from({length:count},(_,i)=>i-1).join(',');
  const poses=new Map();
  for(const cape of [false,true])for(const fps of cape?[60,30,240,500]:[60]){
   await api.get('initialize')(positions,parents,Array(count).fill(identity).join(','),.4,.3,2,3,1,0,0,0,0,180,identity,'v1-sync');
   await api.get('configure')(.7,.5,0,1,8,0,.4,.3,180,true,'mixed',cape);
   let pose;
   for(let i=1;i<=fps*4;i++){const t=i/fps;pose=JSON.parse((await api.get('step')(1/fps,16*t,Math.max(0,Math.sin(t*3))*2,0,Math.sin(t)*.3))[0]);assert(pose.every(Number.isFinite));}
   poses.set(`${cape}-${fps}`,pose);
  }
  const ref=poses.get('true-60');
  assert.notDeepEqual(ref,poses.get('false-60'),'cape opt-in must change the solved chain');
  for(const fps of [30,240,500])assert(Math.max(...ref.map((n,i)=>Math.abs(n-poses.get(`true-${fps}`)[i])))<.02);
  console.log('Cape mode: finite moving/jumping chain, distinct bend, 30–500 FPS agreement');
 }finally{state.destroy();}
});
