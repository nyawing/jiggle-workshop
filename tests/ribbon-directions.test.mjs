import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LuauState} from 'luau-web';
test('ribbon directions produce distinct finite constrained poses at fixed FPS',async()=>{
 const state=await LuauState.createAsync();
 try{
  const [api]=await state.loadstring(await readFile(new URL('../src/generated/simulation.lua',import.meta.url),'utf8'),'directions',true)();
  const identity='1,0,0,0,1,0,0,0,1',poses=[];
  for(const direction of ['horizontal','vertical','depth','mixed']){
   await api.get('initialize')('0,0,0,0,1.5,0,0,0,0,0,-1.5,0','-1,0,1,2',Array(4).fill(identity).join(','),.4,.3,1,3,1,0,0,0,0,180,identity,'v1-sync');
   await api.get('configure')(.7,.5,0,1,8,0,.4,.3,180,true,direction);
   let pose;
   for(let i=0;i<180;i++)pose=JSON.parse((await api.get('step')(1/60,0,0,0,0))[0]);
   assert(pose.every(Number.isFinite));poses.push(pose);
  }
  for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++)assert.notDeepEqual(poses[i],poses[j]);
 }finally{state.destroy();}
});
