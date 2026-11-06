import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
const source=await readFile(new URL('../src/brush.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("'three'",JSON.stringify(import.meta.resolve('three')));
const {surfaceGraph,surfaceBrush,faceComponent}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('a stroke on a ponytail cannot touch a nearby disconnected hair cap or jump onto it',()=>{
  const geometry={positions:[0,0,0,.1,0,0,0,.1,0, 0,0,.01,.1,0,.01,0,.1,.01],indices:[0,1,2,3,4,5]};
  const graph=surfaceGraph(geometry),part=faceComponent(graph,geometry,0);
  const touched=surfaceBrush(graph,geometry,0,new THREE.Vector3(),1,part);
  assert.deepEqual([...touched.keys()].sort(),[0,1,2]);
  assert.equal(surfaceBrush(graph,geometry,1,new THREE.Vector3(0,0,.01),1,part).size,0);
  assert.deepEqual([...surfaceBrush(graph,geometry,1,new THREE.Vector3(0,0,.01),1,null).keys()].sort(),[3,4,5]);
});
test('brush follows the surface around a fold instead of crossing a short spatial gap, including UV seams',()=>{
  const geometry={positions:[0,0,0,1,0,0,0,.1,0, 1,0,0,1,0,.01,0,0,.01, 0,.1,0,1,0,0,1,0,.01],indices:[0,1,2,3,4,5,6,7,8]};
  const graph=surfaceGraph(geometry);assert.equal(graph.nodes[1],graph.nodes[3]);assert.equal(graph.nodes[2],graph.nodes[6]);
  const touched=surfaceBrush(graph,geometry,0,new THREE.Vector3(),.2,null);
  assert(touched.has(0));assert(touched.has(2));assert(touched.has(6));assert(!touched.has(5),'close in space but far along triangles');
});
