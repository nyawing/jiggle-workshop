import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
const source=await readFile(new URL('../src/model.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("'three'",JSON.stringify(import.meta.resolve('three')));
const {appendChain,automaticWeights,insertRestPoint,moveRestBone,chainPaths,makeSkinned}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const bones=appendChain(appendChain([],new THREE.Vector3(-1,0,0),new THREE.Vector3(-1,2,0)),new THREE.Vector3(1,0,0),new THREE.Vector3(1,2,0));
const geometry={positions:[-1,0,0,-1,1,0,-1,2,0,1,2,0,8,2,0,-.5,1,0],normals:[],uv:[],indices:[],rigged:false};
test('auto weights select nearest independent chains, anchor roots, fade radius and normalize skin',()=>{
  const before=JSON.stringify({geometry,bones});const result=automaticWeights(geometry,bones);
  assert.equal(result.mask[0],0);assert.equal(result.mask[1],1);assert.equal(result.mask[2],1);
  assert.equal(result.owners[2],bones[1].name);assert.equal(result.owners[3],bones[3].name);
  assert.equal(result.mask[4],0);assert(result.mask[5]>0&&result.mask[5]<1);
  for(let i=0;i<result.mask.length;i++){
    const weights=result.skin.skinWeights.slice(i*4,i*4+4);
    assert(weights.every(n=>Number.isFinite(n)&&n>=0));assert(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-6);
  }
  assert.equal(JSON.stringify({geometry,bones}),before);
  assert(Math.abs(automaticWeights(geometry,bones,.2).mask[2]-.2)<1e-6);
  assert(automaticWeights(geometry,bones,0).mask.every(n=>n===0));
});
test('auto weights refuse absent chains, existing rigs and invalid strength',()=>{
  assert.throws(()=>automaticWeights(geometry,[]));
  assert.throws(()=>automaticWeights({...geometry,rigged:true},bones));
  assert.throws(()=>automaticWeights(geometry,bones,NaN));
});
test('insert bend keeps existing points, mask, other-chain rows and rest geometry; repeat insertion follows topology',()=>{
  const initial=automaticWeights(geometry,bones),before=JSON.stringify({bones,initial});
  const result=insertRestPoint(geometry,bones,2,initial.mask,initial.owners,initial.skin);
  assert.deepEqual(chainPaths(result.bones),[[1,2,3],[4,5]]);
  assert.deepEqual(result.bones[2].position,[-1,1,0]);
  for(let old=0;old<bones.length;old++)assert.deepEqual(result.bones[old>=2?old+1:old].position,bones[old].position);
  assert.deepEqual(result.skin.skinWeights.slice(12,16),initial.skin.skinWeights.slice(12,16));
  assert.deepEqual(result.skin.skinIndices.slice(12,16),initial.skin.skinIndices.slice(12,16).map(i=>i>=2?i+1:i));
  const bent=moveRestBone(result.bones,2,new THREE.Vector3(-.8,1,0));
  const again=insertRestPoint(geometry,bent,3,initial.mask,initial.owners,result.skin);
  assert.deepEqual(again.bones[2].position,[-.8,1,0]);
  assert.deepEqual(chainPaths(again.bones),[[1,2,3,4],[5,6]]);
  const mesh=makeSkinned({...geometry,normals:Array(18).fill(0),uv:Array(12).fill(0)},again.bones,again.skin,new THREE.MeshBasicMaterial());
  for(let i=0;i<6;i++)assert(mesh.getVertexPosition(i,new THREE.Vector3()).distanceTo(new THREE.Vector3().fromArray(geometry.positions,i*3))<1e-5);
  mesh.geometry.dispose();mesh.material.dispose();mesh.skeleton.dispose();
  assert.equal(JSON.stringify({bones,initial}),before);
  assert.throws(()=>insertRestPoint(geometry,bones,1,initial.mask,initial.owners,initial.skin));
});
