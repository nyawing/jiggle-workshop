import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LuauState} from 'luau-web';

test('real SmartBone runs in Luau: movement, rotation, reset, finite matrices',async()=>{
  const state=await LuauState.createAsync();
  try{
    const source=await readFile(new URL('../src/generated/simulation.lua',import.meta.url),'utf8');
    const [api]=await state.loadstring(source,'trusted-test',true)();
    const init=api.get('initialize'),step=api.get('step');
    const positions='0,0,0,0,1.5,0,0,0.5,0,0,-0.5,0,0,-1.5,0';
    const rotations=[1,0,0,0,1,0,0,0,1,...Array.from({length:4},()=>[1,0,0,0,-1,0,0,0,-1]).flat()].join(',');
    assert.equal((await init(positions,'-1,0,1,2,3',rotations,.4,.18,1,3,1))[0],5);
    let poses;
    for(let i=0;i<120;i++){
      const [json]=await step(1/60,Math.sin(i*.08)*.7,0,0,Math.sin(i*.04)*.7);
      poses=JSON.parse(json);assert.equal(poses.length,60);assert(poses.every(Number.isFinite));
      for(let j=0;j<5;j++){
        const a=poses.slice(j*12+3,j*12+12);
        const rowNorm=a[0]**2+a[1]**2+a[2]**2;
        assert(Math.abs(rowNorm-1)<1e-5,'rotations remain orthonormal');
      }
    }
    assert(poses.some((n,i)=>i%12>=3&&Math.abs(n)>1e-4&&Math.abs(n-1)>1e-4),'nontrivial jiggle');
    await init(positions,'-1,0,1,2,3',rotations,.4,.18,1,3,1);
    const reset=JSON.parse((await step(1/60,0,0,0,0))[0]);assert(reset.every(Number.isFinite));
  }finally{state.destroy();}
});
