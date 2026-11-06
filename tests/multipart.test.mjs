import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import {LuauState} from 'luau-web';
const source=await readFile(new URL('../src/model.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("'three'",JSON.stringify(import.meta.resolve('three')));
const {appendChain,chainPaths,deleteRestBone,moveRestBone,skinForBones,makeSkinned,rebindRest}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const v=(x,y,z=0)=>new THREE.Vector3(x,y,z);
const bones=appendChain(appendChain(appendChain([],v(-1,1),v(-1,-1)),v(1,1),v(1,-.5)),v(0,1.4),v(0,1));
const geometry={positions:[-1,-.8,0,1,-.4,0,0,1.05,0,0,1.3,0],normals:Array(4).fill([0,0,1]).flat(),uv:Array(8).fill(0),indices:[0,1,2,1,2,3],rigged:false};
const owners=['JiggleRoot','JiggleRoot2','JiggleRoot3',''];
const mask=new Float32Array([1,1,.2,0]);
const skin=skinForBones(geometry,mask,bones,undefined,undefined,owners);

test('independent rest edit, selected brush and chain deletion preserve other parts exactly',()=>{
  assert.deepEqual(chainPaths(bones),[[1,2],[3,4],[5,6]]);
  const moved=moveRestBone(bones,2,v(-.8,-.7,.1));assert.deepEqual(moved.slice(3),bones.slice(3));
  const mesh=makeSkinned(geometry,bones,skin,new THREE.MeshBasicMaterial());rebindRest(mesh,moved);
  for(let i=0;i<4;i++)assert(mesh.getVertexPosition(i,v(0,0)).distanceTo(new THREE.Vector3().fromArray(geometry.positions,i*3))<1e-6);
  const changed=mask.slice();changed[0]=.3;
  const painted=skinForBones(geometry,changed,moved,skin,new Set([0]),owners);
  assert.deepEqual(painted.skinIndices.slice(4),skin.skinIndices.slice(4));assert.deepEqual(painted.skinWeights.slice(4),skin.skinWeights.slice(4));
  const deleted=deleteRestBone(bones,3,skin);assert.equal(deleted.bones.length,5);
  assert.deepEqual(deleted.bones.map(b=>b.position),bones.filter((_,i)=>![3,4].includes(i)).map(b=>b.position));
  assert.deepEqual(deleted.skin.skinWeights.slice(0,4),skin.skinWeights.slice(0,4));assert.deepEqual(deleted.skin.skinWeights.slice(8),skin.skinWeights.slice(8));
  assert.deepEqual(deleted.skin.skinWeights.slice(4,8),[1,0,0,0]);
  assert.deepEqual(deleted.skin.skinIndices.slice(8,12),skin.skinIndices.slice(8,12).map(i=>i>4?i-2:i));
  mesh.geometry.dispose();mesh.skeleton.dispose();mesh.material.dispose();
});

test('one real SmartBone controller drives three independent trees; weak ears and zero vertices retain their amplitudes',async()=>{
  const state=await LuauState.createAsync();const mesh=makeSkinned(geometry,bones,skin,new THREE.MeshBasicMaterial());
  try{
    const [api]=await state.loadstring(await readFile(new URL('../src/generated/simulation.lua',import.meta.url),'utf8'),'multipart',true)();
    await api.get('initialize')(bones.flatMap(b=>b.position).join(','),bones.map(b=>b.parent).join(','),bones.flatMap(b=>b.rotation).join(','),.4,.18,3,3,1);
    const maximum=[0,0,0];let independent=false;
    for(let frame=0;frame<100;frame++){
      const transforms=JSON.parse((await api.get('step')(1/60,Math.sin(frame*.13)*.5,0,0,Math.sin(frame*.09)*.3))[0]);assert(transforms.every(Number.isFinite));
      mesh.skeleton.bones.forEach((b,i)=>{const a=transforms.slice(i*12,i*12+12);new THREE.Matrix4().set(a[3],a[4],a[5],a[0],a[6],a[7],a[8],a[1],a[9],a[10],a[11],a[2],0,0,0,1).decompose(b.position,b.quaternion,b.scale);});mesh.updateMatrixWorld(true);mesh.skeleton.update();
      for(let i=0;i<3;i++)maximum[i]=Math.max(maximum[i],mesh.getVertexPosition(i,v(0,0)).distanceTo(new THREE.Vector3().fromArray(geometry.positions,i*3)));
      assert(mesh.getVertexPosition(3,v(0,0)).distanceTo(v(0,1.3))<1e-6);
      // Different lengths/root frames must not receive a copied first-tree pose.
      independent ||= !mesh.skeleton.bones[2].quaternion.equals(mesh.skeleton.bones[4].quaternion);
      for(const root of [1,3,5])assert(mesh.skeleton.bones[root].getWorldPosition(v(0,0)).distanceTo(new THREE.Vector3().fromArray(bones[root].position))<1e-6);
    }
    assert(maximum[0]>.01&&maximum[1]>.01,'both bells need their own simulated tree');assert(independent);assert(maximum[2]>1e-5&&maximum[2]<Math.min(maximum[0],maximum[1]),'low-weight short ear moves weakly');
  }finally{state.destroy();mesh.geometry.dispose();mesh.skeleton.dispose();mesh.material.dispose();}
});
