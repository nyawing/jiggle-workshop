import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import {LuauState} from 'luau-web';

const source=await readFile(new URL('../src/model.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("'three'",JSON.stringify(import.meta.resolve('three')));
const {createChain,deleteRestBone,moveRestBone,makeSkinned,rebindRest,skinForBones}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const geometry={positions:[0,1,0,.2,0,0,.1,-1,0],normals:[0,0,1,0,0,1,0,0,1],uv:[0,0,1,0,0,1],indices:[0,1,2],rigged:false};

// Start and restart at a moved/yawed off-centre mesh, then delete a node.
test('SmartBone rest frames stay mesh-local when initialized at an arbitrary mesh transform and restarted after reset/deletion',async()=>{
  const offsetGeometry={...geometry,positions:geometry.positions.map((n,i)=>n+[2.4,-1.7,.8][i%3])};
  const chain=createChain(new THREE.Vector3(2.6,.1,.9),new THREE.Vector3(2.4,-3.3,.6),3);
  const skin=skinForBones(offsetGeometry,new Float32Array([0,.6,1]),chain);
  const state=await LuauState.createAsync();
  try{
    const [api]=await state.loadstring(await readFile(new URL('../src/generated/simulation.lua',import.meta.url),'utf8'),'offset-test',true)();
    const deleted=deleteRestBone(chain,2,skin);
    for(const [rest,binding,start,yaw] of [[chain,skin,[3,-2,4],1.8],[chain,skin,[0,0,0],0],[deleted.bones,deleted.skin,[-2,3,-1],-.8]]){
      const mesh=makeSkinned(offsetGeometry,rest,binding,new THREE.MeshBasicMaterial());mesh.position.fromArray(start);mesh.rotation.y=yaw;
      await api.get('initialize')(rest.flatMap(b=>b.position).join(','),rest.map(b=>b.parent).join(','),rest.flatMap(b=>b.rotation).join(','),.4,.18,1,3,1,...start,yaw);
      for(let frame=0;frame<60;frame++){
        const p=new THREE.Vector3().fromArray(start).add(new THREE.Vector3(Math.sin(frame*.08)*.4,0,0)),angle=yaw+Math.sin(frame*.04)*.2;
        const poses=JSON.parse((await api.get('step')(1/60,p.x,p.y,p.z,angle))[0]);assert(poses.every(Number.isFinite));
        mesh.position.copy(p);mesh.rotation.y=angle;
        mesh.skeleton.bones.forEach((bone,i)=>{const a=poses.slice(i*12,i*12+12);new THREE.Matrix4().set(a[3],a[4],a[5],a[0],a[6],a[7],a[8],a[1],a[9],a[10],a[11],a[2],0,0,0,1).decompose(bone.position,bone.quaternion,bone.scale);});
        mesh.updateMatrixWorld(true);mesh.skeleton.update();
        assert(mesh.getVertexPosition(0,new THREE.Vector3()).distanceTo(new THREE.Vector3().fromArray(offsetGeometry.positions))<1e-6);
        assert(mesh.skeleton.bones[1].getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3().fromArray(rest[1].position).applyMatrix4(mesh.matrixWorld))<1e-6,'anchor must follow the mesh, never stay at a world position');
      }
      mesh.position.set(0,0,0);mesh.rotation.set(0,0,0);rebindRest(mesh,rest);
      for(let i=0;i<3;i++)assert(mesh.getVertexPosition(i,new THREE.Vector3()).distanceTo(new THREE.Vector3().fromArray(offsetGeometry.positions,i*3))<1e-6);
      mesh.geometry.dispose();mesh.skeleton.dispose();mesh.material.dispose();
    }
  }finally{state.destroy();}
});
