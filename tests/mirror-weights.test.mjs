import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const compile = text => ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const url = text => 'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
const model = url(compile(await readFile(new URL('../src/model.ts',import.meta.url),'utf8')).replace("'three'",JSON.stringify(import.meta.resolve('three'))));
const {mirrorWeights} = await import(url(compile(await readFile(new URL('../src/mirror-weights.ts',import.meta.url),'utf8')).replace("'./model'",JSON.stringify(model))));
const rotation=[1,0,0,0,1,0,0,0,1];
const bone=(name,parent,x,y=0)=>({name,parent,position:[x,y,0],rotation:[...rotation]});
function fixture(points=[[-1,0,0],[-1,1,0],[1,0,0],[1,1,0]]) {
  return {geometry:{positions:points.flat(),normals:[],uv:[],indices:[],rigged:false},
    mask:new Float32Array([0,.7,.8,.1]),owners:['left','left','right','right'],
    bones:[bone('RigidRoot',-1,0),bone('left',0,-1),bone('leftTip',1,-1,1),
      bone('right',0,1),bone('rightTip',3,1,1),bone('other',0,2),bone('otherTip',5,2,1)]};
}
const run=(f,axis=0,plane=0,tolerance)=>mirrorWeights(f.geometry,f.mask,f.owners,f.bones,'left','right',axis,plane,tolerance);

test('exact symmetric UV duplicates deterministically copy paint and zero roots; inputs immutable',()=>{
  const f=fixture([[-1,0,0],[-1,1,0],[1,0,0],[1,1,0],[-1,1,0],[1,1,0]]);
  f.mask=new Float32Array([0,.7,.8,.1,.2,.4]); f.owners=['left','left','right','right','left',''];
  const before=structuredClone(f), result=run(f);
  assert.deepEqual(f,before);
  assert.notEqual(result.mask,f.mask); assert.notEqual(result.owners,f.owners);
  assert.deepEqual([...result.mask],[0,Math.fround(.7),0,Math.fround(.7),Math.fround(.2),Math.fround(.7)]);
  assert.equal(result.owners[3],'right'); assert.equal(result.owners[2],'');
  assert.equal(result.matched,3); assert.equal(result.unmatched,0);
  assert.deepEqual(result.skin.skinWeights.slice(8,12),[1,0,0,0]);
  for(let i=0;i<result.mask.length;i++) {
    const row=result.skin.skinWeights.slice(i*4,i*4+4);
    assert.ok(Math.abs(row.reduce((a,b)=>a+b,0)-1)<1e-10);
    assert.ok(row.every(w=>w>=0 && w<=1));
    assert.equal(row[0],1-result.mask[i]);
  }
  assert.ok(result.skin.skinIndices.slice(12,16).includes(3));
});

test('foreign target owners protected; unassigned source is rigid even with stale mask',()=>{
  const f=fixture(); f.owners=['','left','right','other']; f.mask[0]=.9;
  const r=run(f);
  assert.equal(r.mask[2],0); assert.equal(r.owners[2],'');
  assert.equal(r.mask[3],f.mask[3]); assert.equal(r.owners[3],'other');
  assert.equal(r.protectedVertices,1); assert.equal(r.matched,1);
});

test('asymmetric targets remain unchanged and are explicitly unmatched',()=>{
  const f=fixture(); f.geometry.positions[10]=3;
  const r=run(f);
  assert.equal(r.unmatched,1); assert.equal(r.matched,1);
  assert.equal(r.mask[3],f.mask[3]); assert.equal(r.owners[3],'right');
  assert.equal(run(f,0,0,2).matched,2);
});

test('nearest match, tolerance boundary and lowest index tie',()=>{
  const f=fixture([[-1,0,0],[-1,2,0],[1,1,0],[1,2,0]]);
  f.mask[0]=.3;
  assert.equal(run(f,0,0,1).mask[2],f.mask[0]);
  assert.equal(run(f,0,0,.99).unmatched,1);
  assert.equal(run(f,0,0,0).matched,1);
});

test('source half uses root then mean, supports all axes and offset planes',()=>{
  for (const axis of [0,1,2]) {
    const f=fixture();
    f.geometry.positions=f.geometry.positions.map((_,i)=>{
      const old=f.geometry.positions.slice(Math.floor(i/3)*3,Math.floor(i/3)*3+3);
      [old[0],old[axis]]=[old[axis],old[0]]; return old[i%3]+(i%3===axis?4:0);
    });
    f.bones.forEach(b=>{[b.position[0],b.position[axis]]=[b.position[axis],b.position[0]]; b.position[axis]+=4;});
    f.bones[1].position[axis]=4;
    assert.equal(run(f,axis,4).matched,2);
    f.bones[2].position[axis]=4;
    assert.throws(()=>run(f,axis,4),/plane/);
  }
});

test('validates arrays, indices, finite parameters, chain names and bone topology',()=>{
  for (const mutate of [f=>f.geometry.indices.push(4),f=>f.geometry.positions[0]=NaN,
    f=>f.mask[0]=Infinity,f=>f.mask[0]=-.1,f=>f.owners.pop(),f=>f.owners[0]='missing',
    f=>f.bones[2].parent=2,f=>f.bones[2].name='left',f=>f.bones[2].position[0]=Infinity]) {
    const f=fixture(); mutate(f); assert.throws(()=>run(f));
  }
  const f=fixture();
  for(const [axis,plane,tolerance] of [[3,0,1],[0,NaN,1],[0,0,-1],[0,0,Infinity]])
    assert.throws(()=>run(f,axis,plane,tolerance));
  for(const names of [['left','left'],['missing','right'],['leftTip','right']])
    assert.throws(()=>mirrorWeights(f.geometry,f.mask,f.owners,f.bones,...names,0,0));
});

test('100k seam vertices are bounded and do not produce quadratic duplicate scans',()=>{
  const f=fixture(), n=100000;
  f.geometry.positions=Array.from({length:n},(_,i)=>[i<n/2?-1:1,1,0]).flat();
  f.mask=new Float32Array(n).fill(.6); f.owners=Array(n).fill(''); f.owners.fill('left',0,n/2);
  assert.equal(run(f).matched,n/2);
  f.geometry.positions.push(0,0,0); assert.throws(()=>run(f));
});

test('rejects a wrong mirror axis when chains are on the same side',()=>{const f=fixture();f.bones[3].position[0]=-.5;f.bones[4].position[0]=-.5;assert.throws(()=>run(f),/opposite side/);});
