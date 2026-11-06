import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
const source=await readFile(new URL('../src/weight-projection.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/(['"])three\1/g,JSON.stringify(import.meta.resolve('three')));
const {WeightProjection}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function fixture(){
  // Identical overlapping triangles, front at z=0 and back at z=-1.
  const positions=[-.8,-.8,0,.8,-.8,0,0,.8,0, -.8,-.8,-1,.8,-.8,-1,0,.8,-1];
  const geometry={positions,indices:[0,1,2,3,4,5],normals:[],uv:[],rigged:false};
  const bg=new THREE.BufferGeometry();
  bg.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));bg.setIndex(geometry.indices);
  bg.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(24),4));
  bg.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:24},(_,i)=>i%4===0?1:0),4));
  const mesh=new THREE.SkinnedMesh(bg,new THREE.MeshBasicMaterial());
  const bone=new THREE.Bone();mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=3;
  const graph={nodes:[0,1,2,3,4,5],components:[0,0,0,1,1,1]};
  return {projection:new WeightProjection(geometry),mesh,camera,graph,bone};
}
test('depth, side culling, through, and component isolation',()=>{
  const {projection:p,mesh,camera,graph}=fixture();
  p.update(mesh,camera,100,100,false);
  assert(p.point(0));assert.equal(p.point(3),undefined);
  p.update(mesh,camera,100,100,false,new Set([1]),graph);
  assert.equal(p.point(0),undefined);assert(p.point(3),'isolated backs are exposed');
  mesh.material.side=THREE.BackSide;p.update(mesh,camera,100,100,false);
  assert.equal(p.query(50,50,100,1).size,0);
  p.update(mesh,camera,100,100,true);
  assert.equal(p.query(50,50,100,1).size,6);
  p.update(mesh,camera,100,100,true,new Set([1]),graph);
  assert.deepEqual([...p.query(50,50,100,1).keys()],[3,4,5]);
  mesh.material.side=THREE.DoubleSide;p.update(mesh,camera,100,100,false);
  assert(p.point(0));assert.equal(p.point(3),undefined);
});
test('cache invalidates on pose, camera, dimensions, in-place selection and index changes',()=>{
  const {projection:p,mesh,camera,graph,bone}=fixture();
  let calls=0;const original=mesh.getVertexPosition.bind(mesh);
  mesh.getVertexPosition=(...args)=>{calls++;return original(...args);};
  const selected=new Set([0]);const update=()=>p.update(mesh,camera,100,100,false,selected,graph);
  update();const first=calls;update();assert.equal(calls,first);
  selected.clear();selected.add(1);update();assert(calls>first);assert(p.point(3));
  bone.position.x=.1;update();assert(Math.abs(p.point(3).x-15)<1e-5);
  camera.position.x=.1;update();assert(Math.abs(p.point(3).x-10)<1e-5);
  p.update(mesh,camera,200,100,false,selected,graph);assert(Math.abs(p.point(3).x-20)<1e-5);
  mesh.geometry.setIndex([0,1,2]);update();assert.equal(p.point(3),undefined);
});
test('capsule coverage equals max coverage of subdivided collinear segments',()=>{
  const {projection:p,mesh,camera}=fixture();p.update(mesh,camera,100,100,true);
  const full=p.querySegment(0,80,100,80,20,.5);
  const split=p.querySegment(0,80,50,80,20,.5);
  for(const [i,w] of p.querySegment(50,80,100,80,20,.5))split.set(i,Math.max(split.get(i)??0,w));
  assert.deepEqual(full,split);assert(Math.abs(full.get(0)-1)<1e-5);
  assert.deepEqual(p.query(50,10,10,.5),p.querySegment(50,10,50,10,10,.5));
  assert.equal(p.query(0,0,-1,.5).size,0);
});
test('filtered renderer indices and mirrored winding are respected',()=>{
  const {projection:p,mesh,camera}=fixture();mesh.geometry.setIndex([3,4,5]);
  p.update(mesh,camera,100,100,false);assert(p.point(3));assert.equal(p.point(0),undefined);
  mesh.scale.x=-1;p.update(mesh,camera,100,100,false);assert(p.point(3));
  mesh.geometry.setIndex([5,4,3]);p.update(mesh,camera,100,100,false);assert.equal(p.point(3),undefined);
});

test('perspective front/back/inside visibility matches material sides',()=>{
  const bg=new THREE.BoxGeometry(2,2,2);
  const count=bg.getAttribute('position').count;
  bg.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
  bg.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:count*4},(_,i)=>i%4===0?1:0),4));
  const mesh=new THREE.SkinnedMesh(bg,new THREE.MeshBasicMaterial());
  const bone=new THREE.Bone();mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));
  const data={positions:Array.from(bg.getAttribute('position').array),indices:Array.from(bg.index.array)};
  const p=new WeightProjection(data),camera=new THREE.PerspectiveCamera(90,1,.1,20);
  camera.position.z=4;
  p.update(mesh,camera,200,200,false);
  const front=[...p.query(100,100,200,1).keys()];
  assert(front.length>0);assert(front.every(i=>data.positions[i*3+2]===1));
  camera.position.z=-4;camera.lookAt(0,0,0);p.update(mesh,camera,200,200,false);
  const back=[...p.query(100,100,200,1).keys()];
  assert(back.length>0);assert(back.every(i=>data.positions[i*3+2]===-1));
  camera.position.set(0,0,0);camera.lookAt(0,0,-1);
  p.update(mesh,camera,200,200,false);assert.equal(p.query(100,100,200,1).size,0);
  mesh.material.side=THREE.BackSide;p.update(mesh,camera,200,200,false);
  assert(p.query(100,100,200,1).size>0,'inside back faces are visible');
  mesh.material.side=THREE.FrontSide;p.update(mesh,camera,200,200,true);
  assert(p.query(100,100,200,1).size>0,'through skips interior culling');
});

test('100k vertex benchmark (800 × 600 CSS pixels)',()=>{
  const cols=400,rows=250,count=cols*rows,positions=[],indices=[];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)positions.push((x/(cols-1)-.5)*1.8,(y/(rows-1)-.5)*1.8,0);
  for(let y=0;y<rows-1;y++)for(let x=0;x<cols-1;x++){
    const i=y*cols+x;indices.push(i,i+1,i+cols,i+1,i+cols+1,i+cols);
  }
  const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));bg.setIndex(indices);
  bg.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
  bg.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:count*4},(_,i)=>i%4===0?1:0),4));
  const mesh=new THREE.SkinnedMesh(bg,new THREE.MeshBasicMaterial());
  const bone=new THREE.Bone();mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=3;
  const p=new WeightProjection({positions,indices});
  const start=performance.now();p.update(mesh,camera,800,600,false);const cold=performance.now()-start;
  const hitStart=performance.now();for(let i=0;i<100;i++)p.update(mesh,camera,800,600,false);const hit=(performance.now()-hitStart)/100;
  const queryStart=performance.now();let hits=0;
  for(let i=0;i<100;i++)hits=p.querySegment(350,280,450,320,30,.5).size;
  const query=(performance.now()-queryStart)/100;
  assert(hits>0);assert(p.point(0));
  console.log(`100k vertices, ${indices.length/3} triangles: cold update ${cold.toFixed(2)} ms; cache hit ${hit.toFixed(3)} ms; segment query ${query.toFixed(3)} ms (${hits} vertices)`);
});
test('editing rest-pose cache survives heatmap and skin-weight uploads',()=>{
 const {projection:p,mesh,camera,graph}=fixture();p.update(mesh,camera,100,100,false,undefined,graph,true);
 const signature=p.signature;const before=[...p.query(50,50,80,.65)];
 mesh.geometry.setAttribute('paintWeight',new THREE.Float32BufferAttribute([0,.2,.4,.6,.8,1],1));
 mesh.geometry.getAttribute('skinWeight').needsUpdate=true;
 p.update(mesh,camera,100,100,false,undefined,graph,true);
 assert.equal(p.signature,signature);assert.deepEqual([...p.query(50,50,80,.65)],before);
 camera.position.x+=.2;p.update(mesh,camera,100,100,false,undefined,graph,true);assert.notEqual(p.signature,signature);
});
