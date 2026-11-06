import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/weight-stroke.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const {WeightStroke, Stroke, falloff, StrokePathResampler, segmentCoverage} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const point = (x,y=0,z=0) => ({x,y,z});
function graph(vertices = [[0],[1],[2],[3]], links = [[0,1],[1,2]], components = [0,0,0,1]) {
  const nodes = [], edges = vertices.map(() => new Map());
  vertices.forEach((vs,n) => vs.forEach(v => nodes[v] = n));
  for (const [a,b] of links) { edges[a].set(b,1); edges[b].set(a,1); }
  return {vertices,nodes,edges,components,points:vertices.map((_,i)=>point(i))};
}
const close = (a,b) => assert.ok(Math.abs(a-b) <= 1e-5, `${a} != ${b}`);

test('set/erase use maximum coverage and immutable pointer-down snapshots', () => {
  assert.equal(Stroke, WeightStroke);
  for (const operation of ['set','erase']) {
    const weights = new Float32Array([.2,.5,.8,.4]), owners = ['a','','b','a'];
    const stroke = new WeightStroke(weights,owners,'a',graph(),operation,1,.5);
    weights[0]=1; owners[2]='a';
    const first = stroke.apply(new Map([[0,.6],[1,1],[2,1]]));
    close(first.get(0), operation==='set' ? .44 : .14);
    assert.ok(!first.has(2));
    assert.equal(stroke.apply(new Map([[0,.6],[1,.1]])).size,0);
    const last = stroke.apply(new Map([[0,1]]));
    close(last.get(0), operation==='set' ? .6 : .1);
  }
});

test('smooth uses snapshot eligible graph neighbors, excludes foreign chains and disconnected geometry', () => {
  const weights = new Float32Array([0,1,0,.9]);
  const stroke = new WeightStroke(weights,['a','a','b',''],'a',graph(),'smooth',0,1);
  const result = stroke.apply(new Map([[0,1],[1,1],[2,1],[3,1]]));
  close(result.get(0),1); close(result.get(1),0);
  assert.ok(!result.has(2)); assert.ok(!result.has(3));
  assert.deepEqual([...weights], [0,1,0,Math.fround(.9)]);
});

test('seams share coverage and neighbors count once; protected seam copies stay intact', () => {
  const g = graph([[0,1],[2,3],[4],[5]], [[0,1],[0,2]], [0,0,0,1]);
  const stroke = new WeightStroke(new Float32Array([0,0,1,1,0,1]), ['a','a','','','a','a'],'a',g,'smooth',0,1);
  const result = stroke.apply(new Map([[0,.8],[1,.2]]));
  close(result.get(0),.4); close(result.get(1),.4);
  const protectedStroke = new WeightStroke(new Float32Array(6),['a','b','','','',''],'a',g,'set',1,1);
  assert.deepEqual([...protectedStroke.apply(new Map([[0,1]]))],[[0,1]]);
});

test('frequency independence across all operations to 1e-5', () => {
  for (const operation of ['set','erase','smooth']) {
    const run = count => {
      const mask = new Float32Array([.2,.8,.4,.6]);
      const stroke = new WeightStroke(mask,['a','','a','a'],'a',graph(),operation,.9,.7);
      for (let n=1;n<=count;n++) for (const [i,v] of stroke.apply(new Map([[0,.9*n/count],[1,.7*n/count]]))) mask[i]=v;
      return mask;
    };
    run(1000).forEach((value,i)=>close(value,run(1)[i]));
  }
});

test('falloff has smoothstep center, hard core and finite boundaries', () => {
  assert.equal(falloff(0,1,0),1); close(falloff(.5,1,0),.5);
  assert.equal(falloff(.5,1,.5),1); close(falloff(.75,1,.5),.5);
  assert.equal(falloff(1,1,1),0); assert.equal(falloff(.99,1,1),1);
  assert.equal(falloff(0,0),0); assert.equal(falloff(NaN,1),0);
  assert.ok(1-falloff(.0001,1) < 1e-7);
});

test('uniform path stamps and exact endpoint are independent of collinear input events', () => {
  const run = count => {
    const path = new StrokePathResampler(1), stamps=[];
    for(let i=0;i<=count;i++) stamps.push(...path.add(point(1.237*i/count)));
    stamps.push(...path.finalize());
    assert.deepEqual(path.finalize(),[]);
    assert.throws(()=>path.add(point(2)),/finalized/);
    return stamps;
  };
  const sparse=run(1), dense=run(1000);
  assert.equal(sparse.length,dense.length);
  sparse.forEach((p,i)=>close(p.x,dense[i].x));
  close(sparse.at(-1).x,1.237);
  for(let i=1;i<sparse.length;i++) assert.ok(sparse[i].x-sparse[i-1].x<=.1+1e-10);
});

test('path carries spacing through corners, duplicate events and final input', () => {
  const path = new StrokePathResampler(1,100);
  assert.deepEqual(path.add(point(0)),[point(0)]);
  assert.deepEqual(path.add(point(0)),[]);
  assert.deepEqual(path.add(point(.05)),[]);
  const stamps=path.finalize(point(.05,.12));
  close(stamps[0].x,.05); close(stamps[0].y,.05);
  assert.deepEqual(stamps.at(-1),point(.05,.12));
  assert.deepEqual(new StrokePathResampler(1).finalize(),[]);
  assert.throws(()=>new StrokePathResampler(0),RangeError);
});

test('analytic segment coverage is subdivision invariant and handles zero-length segments', () => {
  const p=point(.437,.2), a=point(0), b=point(1);
  const whole=segmentCoverage(p,a,b,1,.2);
  let maximum=0;
  for(let i=0;i<1000;i++) maximum=Math.max(maximum,segmentCoverage(p,point(i/1000),point((i+1)/1000),1,.2));
  close(whole,maximum);
  close(segmentCoverage(point(.5),a,a,1),falloff(.5,1));
});

test('zero strength and invalid coverage cannot write weights', () => {
  const make = strength => new WeightStroke(new Float32Array(4),['','','',''],'a',graph(),'set',1,strength);
  assert.equal(make(0).apply(new Map([[0,1]])).size,0);
  assert.equal(make(1).apply(new Map([[-1,1],[.5,1],[4,1],[0,NaN],[1,-1]] )).size,0);
  assert.equal(make(2).apply(new Map([[0,2]])).get(0),1);
});
