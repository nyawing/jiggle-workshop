import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LuauState} from 'luau-web';
test('Workshop V2 synchronized preview agrees across rendering frame rates',async()=>{
 const state=await LuauState.createAsync();
 try{
  const [api]=await state.loadstring(await readFile(new URL('../src/generated/simulation.lua',import.meta.url),'utf8'),'v2-cadence',true)();
  const identity=[1,0,0,0,1,0,0,0,1].join(','),poses=new Map();
  for(const fps of [60,30,240,360,400,500]){
   await api.get('initialize')('0,0,0,0,1.5,0,0,-1.5,0','-1,0,1',[identity,identity,identity].join(','),.65,.3,2,3,1,0,0,0,0,180,identity,'v2-sync');
   await api.get('configure')(.7,.65,0,1,8,0,.65,.3,180);
   let pose;
   for(let i=1;i<=fps*3;i++){const t=i/fps;pose=JSON.parse((await api.get('step')(1/fps,16*t,Math.sin(t*3),0,t*.2))[0]);assert(pose.every(Number.isFinite));}
   poses.set(fps,pose);
  }
  const ref=poses.get(60),errors={};
  for(const [fps,pose]of poses){const error=Math.max(...pose.map((n,i)=>Math.abs(n-ref[i])));errors[fps]=error;assert(error<.02,`pose divergence at ${fps}: ${error}`);}
  console.log('V2 30/60/240/360/400/500 FPS max component discrepancies',errors);
 }finally{state.destroy();}
});
