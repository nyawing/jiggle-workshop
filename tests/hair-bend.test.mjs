import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LuauState} from 'luau-web';

test('hair contact blocks further inward motion from the rest pose and releases beyond the body edge',async()=>{
 const state=await LuauState.createAsync();
 try{
  const adapter=await readFile(new URL('../simulation/roblox_adapter.lua',import.meta.url),'utf8');
  const constraint=await readFile(new URL('../simulation/hair-bend.lua',import.meta.url),'utf8');
  const testCase=`
   local frame=CFrame.new()
   hairContactFrames={{frame=frame,inverse=frame,half=vec(1,1,.5)}}
   local parent={Anchored=true,Position=vec(0,.6,.4),TransformOffset={Position=vec(0,.6,.4)}}
   local point={Position=vec(0,-.6,.25),LastPosition=vec(-.04,-.6,.35),TransformOffset={Position=vec(0,-.6,.4)}}
   local anchored=parent.Position
   constrainHairBend(point,parent)
   assert(parent.Position==anchored)
   assert(point.Position.Z>.25 and point.Position.Z<=.4)
   local v=point.Position-point.LastPosition
   assert(math.abs(v.Z)<1e-8 and math.abs(v.X-.04)<1e-8)
   local released=vec(1.5,-.6,.1)
   parent.Position=vec(1.5,.6,.4)
   point.Position=released
   constrainHairBend(point,parent)
   assert(point.Position==released)
   return true
  `;
  const [ok]=await state.loadstring(adapter+'\n'+constraint+'\n'+testCase,'hair-contact',true)();
  assert.equal(ok,true);
 }finally{state.destroy();}
});
