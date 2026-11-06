import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import {LuauState} from 'luau-web';

const source=await readFile(new URL('../src/model.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("'three'",JSON.stringify(import.meta.resolve('three')));
const {createChain,moveRestBone,makeSkinned,rebindRest,skinForBones}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const geometry={positions:[0,1,0,.2,0,0,.1,-1,0],normals:[0,0,1,0,0,1,0,0,1],uv:[0,0,1,0,0,1],indices:[0,1,2],rigged:false};
test('default two endpoints produce one segment; real SmartBone moves it without affecting zero weights',async()=>{
  const chain=createChain(new THREE.Vector3(0,1.5,0),new THREE.Vector3(0,-1.5,0));
  assert.equal(chain.length,3);assert.equal(chain[2].parent,1);
  assert.deepEqual(chain[1].position,[0,1.5,0]);assert.deepEqual(chain[2].position,[0,-1.5,0]);
  assert.throws(()=>createChain(new THREE.Vector3(),new THREE.Vector3(0,.02,0),3),/близко/);
  const mesh=makeSkinned(geometry,chain,skinForBones(geometry,new Float32Array([0,0,1]),chain),new THREE.MeshBasicMaterial());
  const state=await LuauState.createAsync();
  try{
    const [api]=await state.loadstring(await readFile(new URL('../src/generated/simulation.lua',import.meta.url),'utf8'),'one-segment',true)();
    await api.get('initialize')(chain.flatMap(b=>b.position).join(','),chain.map(b=>b.parent).join(','),chain.flatMap(b=>b.rotation).join(','),.4,.18,1,3,1);
    let moved=false;
    for(let i=0;i<90;i++){
      const pose=JSON.parse((await api.get('step')(1/60,Math.sin(i*.1)*.4,0,0,.2))[0]);assert(pose.every(Number.isFinite));
      mesh.skeleton.bones.forEach((bone,j)=>{const a=pose.slice(j*12,j*12+12);new THREE.Matrix4().set(a[3],a[4],a[5],a[0],a[6],a[7],a[8],a[1],a[9],a[10],a[11],a[2],0,0,0,1).decompose(bone.position,bone.quaternion,bone.scale);});
      mesh.updateMatrixWorld(true);mesh.skeleton.update();
      for(const v of [0,1])assert(mesh.getVertexPosition(v,new THREE.Vector3()).distanceTo(new THREE.Vector3().fromArray(geometry.positions,v*3))<1e-6);
      moved ||= mesh.getVertexPosition(2,new THREE.Vector3()).distanceTo(new THREE.Vector3(.1,-1,0))>.001;
    }
    assert(moved);
  }finally{state.destroy();mesh.geometry.dispose();mesh.skeleton.dispose();mesh.material.dispose();}
});
