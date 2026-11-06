import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/weight-gradient.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {linearGradient}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const points=[[0,{x:-30,y:0}],[1,{x:30,y:0}],[2,{x:-30,y:50}],[3,{x:30,y:50}],[4,{x:0,y:100}],[5,{x:0,y:150}]];
test('linear ramp spans the width uniformly and clamps beyond endpoints',()=>{
 const weights=new Float32Array(6),owners=Array(6).fill('');
 const result=linearGradient({x:0,y:0},{x:0,y:100},points,weights,owners,'ear',0,.7);
 assert.deepEqual([...result.values()],[0,0,.35,.35,.7,.7]);
 assert.deepEqual([...weights],Array(6).fill(0));assert.deepEqual(owners,Array(6).fill(''));
 const reverse=linearGradient({x:0,y:100},{x:0,y:0},points,weights,owners,'ear');
 assert.deepEqual([...reverse.values()],[1,1,.5,.5,0,0]);
});
test('strength blends old scalar values, foreign chains and omitted geometry stay untouched',()=>{
 const weights=new Float32Array([.5,.5,.5,.5,.5,.5]);
 const result=linearGradient({x:0,y:0},{x:0,y:100},points.slice(0,4),weights,['ear','cap','','ear','',''],'ear',0,1,.5);
 assert.deepEqual([...result],[[0,.25],[2,.5],[3,.5]]);
 assert.deepEqual([...weights],Array(6).fill(.5));
});
test('short drags do nothing and invalid coordinates or values are rejected',()=>{
 assert.equal(linearGradient({x:0,y:0},{x:1,y:1},points,new Float32Array(6),Array(6).fill(''),'ear').size,0);
 for(const to of [NaN,Infinity,-1,1.1])assert.throws(()=>linearGradient({x:0,y:0},{x:0,y:100},points,new Float32Array(6),Array(6).fill(''),'ear',0,to));
});
