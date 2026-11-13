import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LuauState} from 'luau-web';
test('gravity off is finite, distinct, and the default remains gravity on',async()=>{
 const state=await LuauState.createAsync();
 try{
  const [api]=await state.loadstring(await readFile(new URL('../src/generated/simulation.lua',import.meta.url),'utf8'),'gravity',true)();
  const identity='1,0,0,0,1,0,0,0,1',poses=[];
  for(const gravity of [undefined,true,false]){
   await api.get('initialize')('0,0,0,0,1.5,0,0,.5,0,0,-.5,0','-1,0,1,2',Array(4).fill(identity).join(','),.4,.3,2,3,1,0,0,0,0,180,identity,'v1-sync');
   await api.get('configure')(.7,.5,0,1,8,0,.4,.3,180,false,'mixed',true,gravity);
   let pose;
   for(let i=1;i<=180;i++){
    const angle=i/180*1.5,c=Math.cos(angle),s=Math.sin(angle);
    pose=JSON.parse((await api.get('step')(1/60,i*.2,Math.sin(i/30),0,0,[c,-s,0,s,c,0,0,0,1].join(',')))[0]);
    assert(pose.every(Number.isFinite));
   }
   poses.push(pose);
  }
  assert.deepEqual(poses[0],poses[1]);assert.notDeepEqual(poses[1],poses[2]);
 }finally{state.destroy();}
});
