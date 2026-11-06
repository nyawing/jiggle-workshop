import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import {LuauState} from 'luau-web';

const source=await readFile(new URL('../src/model.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("'three'",JSON.stringify(import.meta.resolve('three')));
const {mirrorChain,createChain,deleteRestBone,moveRestBone,makeSkinned,rebindRest,skinForBones}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const geometry={positions:[0,1,0,.2,0,0,.1,-1,0],normals:[0,0,1,0,0,1,0,0,1],uv:[0,0,1,0,0,1],indices:[0,1,2],rigged:false};
const original=createChain(new THREE.Vector3(0,1.5,0),new THREE.Vector3(0,-1.5,0),3);
function assertRest(mesh){mesh.updateWorldMatrix(true,false);mesh.updateMatrixWorld(true);mesh.skeleton.update();for(let i=0;i<3;i++)assert(mesh.getVertexPosition(i,new THREE.Vector3()).distanceTo(new THREE.Vector3().fromArray(geometry.positions,i*3))<1e-6);}

test('rest edits inside mesh preserve geometry, skin rows and bind pose, even after body rotation',()=>{
  const mask=new Float32Array([0,.6,1]),skin=skinForBones(geometry,mask,original);
  assert.deepEqual(skin.skinWeights.slice(0,4),[1,0,0,0]);
  const unchanged=structuredClone(skin),before=structuredClone(original);
  const mesh=makeSkinned(geometry,original,skin,new THREE.MeshBasicMaterial());
  const body=new THREE.Group();body.add(mesh);body.position.set(4,-2,3);body.rotation.y=.7;mesh.position.set(-.1,-.2,0);
  assertRest(mesh);
  const moved=moveRestBone(original,2,new THREE.Vector3(.03,.1,.04));
  rebindRest(mesh,moved);assertRest(mesh);mesh.pose();assertRest(mesh);
  assert.deepEqual(original,before);assert.deepEqual(skin,unchanged);assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),geometry.positions.map(Math.fround));
  assert.throws(()=>moveRestBone(original,0,new THREE.Vector3()),/Выберите/);
  assert.throws(()=>moveRestBone(original,2,new THREE.Vector3().fromArray(original[3].position)),/Соседние/);
  mesh.geometry.dispose();mesh.skeleton.dispose();mesh.material.dispose();
});

test('brush updates only touched vertices after moving a chain; zero flexible weight stays rigid',()=>{
  const mask=new Float32Array([0,.6,1]),skin=skinForBones(geometry,mask,original);
  const moved=moveRestBone(original,2,new THREE.Vector3(.5,.2,.2));mask[2]=.4;
  const next=skinForBones(geometry,mask,moved,skin,new Set([2]));
  assert.deepEqual(next.skinIndices.slice(0,8),skin.skinIndices.slice(0,8));assert.deepEqual(next.skinWeights.slice(0,8),skin.skinWeights.slice(0,8));
  mask[2]=0;const erased=skinForBones(geometry,mask,moved,next,new Set([2]));assert.deepEqual(erased.skinWeights.slice(8),[1,0,0,0]);assert.deepEqual(erased.skinIndices.slice(8),[0,0,0,0]);
});

test('real SmartBone accepts bent edited rest pose: zero-weight vertices stay mesh-local fixed through motion and yaw',async()=>{
  const state=await LuauState.createAsync();
  const moved=moveRestBone(original,2,new THREE.Vector3(.2,.4,.1));
  const skin=skinForBones(geometry,new Float32Array([0,.6,1]),original);
  const mesh=makeSkinned(geometry,original,skin,new THREE.MeshBasicMaterial());rebindRest(mesh,moved);
  try{
    const [api]=await state.loadstring(await readFile(new URL('../src/generated/simulation.lua',import.meta.url),'utf8'),'rest-test',true)();
    await api.get('initialize')(moved.flatMap(b=>b.position).join(','),moved.map(b=>b.parent).join(','),moved.flatMap(b=>b.rotation).join(','),.4,.18,1,3,1);
    let flexibleMoved=false;
    for(let frame=0;frame<90;frame++){
      const poses=JSON.parse((await api.get('step')(1/60,Math.sin(frame*.1)*.4,0,0,Math.sin(frame*.06)*.5))[0]);assert(poses.every(Number.isFinite));
      mesh.skeleton.bones.forEach((bone,i)=>{const a=poses.slice(i*12,i*12+12);new THREE.Matrix4().set(a[3],a[4],a[5],a[0],a[6],a[7],a[8],a[1],a[9],a[10],a[11],a[2],0,0,0,1).decompose(bone.position,bone.quaternion,bone.scale);});
      mesh.updateMatrixWorld(true);mesh.skeleton.update();
      assert(mesh.getVertexPosition(0,new THREE.Vector3()).distanceTo(new THREE.Vector3(0,1,0))<1e-6,'unpainted vertex must follow rigid accessory, never jiggle');
      flexibleMoved ||= mesh.getVertexPosition(2,new THREE.Vector3()).distanceTo(new THREE.Vector3(.1,-1,0))>.001;
    }
    assert(flexibleMoved,'painted vertices should still jiggle');mesh.pose();assertRest(mesh);
  }finally{state.destroy();mesh.geometry.dispose();mesh.skeleton.dispose();mesh.material.dispose();}
});




test('deleting a middle, end or root node preserves survivor rest frames and painted weights',()=>{
  const skin=skinForBones(geometry,new Float32Array([0,.6,1]),original);
  for(const index of [1,2,4]){
    const next=deleteRestBone(original,index,skin);
    assert.equal(next.bones.length,original.length-1);assert.equal(next.bones[1].name,'JiggleRoot');
    const survivors=original.filter((_,i)=>i!==index);
    next.bones.forEach((b,i)=>{assert.deepEqual(b.position,survivors[i].position);assert.deepEqual(b.rotation,survivors[i].rotation);assert.equal(b.parent,i-1);});
    assert.deepEqual(next.skin.skinWeights,skin.skinWeights);assert.deepEqual(next.skin.skinIndices.slice(0,4),[0,0,0,0]);assert(next.skin.skinIndices.every(i=>i>=0&&i<next.bones.length));
    const mesh=makeSkinned(geometry,next.bones,next.skin,new THREE.MeshBasicMaterial());const body=new THREE.Group();body.add(mesh);body.position.set(-7,2,4);body.rotation.y=2.1;mesh.position.set(2,-3,1);
    assertRest(mesh);rebindRest(mesh,next.bones);assertRest(mesh);
    mesh.geometry.dispose();mesh.skeleton.dispose();mesh.material.dispose();
  }
  const one=createChain(new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0));
  assert.deepEqual(deleteRestBone(one,2,skinForBones(geometry,new Float32Array([0,.6,1]),one)),{bones:[],skin:null});
  assert.throws(()=>deleteRestBone(original,0,skin),/Выберите/);
});

test('mirror preserves bent chains, parent order and proper rotations without mutating the original',()=>{
  let input=createChain(new THREE.Vector3(1,2,.3),new THREE.Vector3(1,-2,.4),2);
  input=moveRestBone(input,2,new THREE.Vector3(1.4,.2,.8));
  const before=structuredClone(input);
  for(const axis of [0,1,2]){
    const result=mirrorChain(input,2,axis,.25),path=[result.root,result.root+1,result.root+2];
    path.forEach((i,k)=>{
      const old=input[k+1],b=result.bones[i];
      assert.equal(b.position[axis],.5-old.position[axis]);
      for(let j=0;j<3;j++)if(j!==axis)assert.equal(b.position[j],old.position[j]);
      assert.equal(b.parent,k?path[k-1]:0);
      const r=b.rotation,m=new THREE.Matrix4().set(r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1);
      assert(Math.abs(m.determinant()-1)<1e-6);
    });
    assert.deepEqual(input,before);
    const skin=skinForBones(geometry,new Float32Array([0,.5,1]),result.bones);
    assertRest(makeSkinned(geometry,result.bones,skin,new THREE.MeshBasicMaterial()));
  }
  assert.throws(()=>mirrorChain(input,0,0,0),/Выберите/);
  assert.throws(()=>mirrorChain(createChain(new THREE.Vector3(1,3,0),new THREE.Vector3(1,-3,0),14),1,0,0),/предел/);
});
