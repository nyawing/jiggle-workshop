import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LuauState} from 'luau-web';
test('selected wave leaves an independent unselected chain unchanged',async()=>{
 const state=await LuauState.createAsync();
 try{
  const [api]=await state.loadstring(await readFile(new URL('../src/generated/simulation.lua',import.meta.url),'utf8'),'selected-wave',true)();
  const identity='1,0,0,0,1,0,0,0,1',poses=[];
  for(const selection of ['', '3:horizontal']){
   await api.get('initialize')('0,0,0,-1,1,0,-1,-1,0,1,1,0,1,-1,0','-1,0,1,0,3',Array(5).fill(identity).join(','),.4,.3,3,3,1,0,0,0,0,180,identity,'v1-sync');
   await api.get('configure')(0,.5,0,1,8,0,.4,.3,180,false,'mixed',false,true,selection,true);
   let pose;for(let i=0;i<180;i++)pose=JSON.parse((await api.get('step')(1/60,0,0,0,0))[0]);
   assert(pose.every(Number.isFinite));poses.push(pose);
  }
  assert.notDeepEqual(poses[0],poses[1]);
  assert.deepEqual(poses[0].slice(36),poses[1].slice(36));
 }finally{state.destroy();}
});
