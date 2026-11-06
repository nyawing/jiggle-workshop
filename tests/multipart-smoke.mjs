// Invisible app only. Live catalog import is read-only; export remains local.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.env.WORKSHOP_SMOKE_OUTPUT||path.join(root,'../../_work/jiggle-workshop-checks-0.1.6/cow-source'));await mkdir(output,{recursive:true});
const js=ts.transpileModule(await readFile(path.join(root,'src/model.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("'three'",JSON.stringify(import.meta.resolve('three')));
const {skinForBones,chainPaths}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const brushJs=ts.transpileModule(await readFile(path.join(root,'src/brush.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("'three'",JSON.stringify(import.meta.resolve('three')));
const {surfaceGraph}=await import('data:text/javascript;base64,'+Buffer.from(brushJs).toString('base64'));
const app=await electron.launch({...(process.env.WORKSHOP_EXE?{executablePath:process.env.WORKSHOP_EXE,args:[]}:{args:[root]}),env:{...process.env,WORKSHOP_TEST:'1'}});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
 const inspect=()=>page.evaluate(()=>window.workshopInspect());
 const frames=n=>page.evaluate(n=>new Promise(resolve=>{let i=0;const next=()=>{if(++i===n)resolve();else requestAnimationFrame(next);};requestAnimationFrame(next);}),n);
 const tab=async name=>{if(await page.locator('#panel'+name).evaluate(n=>n.hidden))await page.locator('#tab'+name).click();};
 async function advanced(){await tab('Bones');if(!await page.locator('#boneAdvanced').evaluate(n=>n.open))await page.locator('#boneAdvanced > summary').click();}
 async function setPoint(index,position){await advanced();await page.locator('#boneSelect').selectOption(String(index));for(const [i,axis] of ['X','Y','Z'].entries())await page.locator('#bone'+axis).fill(String(position[i]));await page.locator('#applyPosition').click();}
 async function save(file){await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект сохранён:'));}
 async function open(file){await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект восстановлен.'));}
 await page.locator('#reference').fill('https://nyawing.lol/catalog/175558/item');await page.locator('#download').click();
 await page.waitForFunction(()=>document.querySelector('#download').textContent==='Загрузить'&&!document.querySelector('#status').textContent.startsWith('Скачиваю'));
 assert.equal(await page.locator('#status').evaluate(n=>n.classList.contains('error')),false,await page.locator('#status').textContent());
 let state=await inspect();assert.equal(state.project.geometry.positions.length/3,6624);assert.equal(state.project.itemType,'accessory');assert.match(await page.locator('#label').textContent(),/cow ears/);
 const parts=[['Левый колокольчик',[-.88,-.04,-.06],[-.88,-.34,-.06]],['Правый колокольчик',[.88,-.04,-.06],[.88,-.34,-.06]],['Левое ухо',[-.6,.25,0],[-1.13,.15,0]],['Правое ухо',[.6,.25,0],[1.13,.15,0]]];
 for(const [k,[name,start,end]] of parts.entries()){
   await tab('Bones');if(await page.locator('#boneAdvanced').evaluate(n=>n.open))await page.locator('#boneAdvanced > summary').click();
   const before=(await inspect()).project;await page.locator('#chain').click();const box=await page.locator('canvas[data-engine]').boundingBox();
   await page.mouse.click(box.x+box.width*.12,box.y+box.height*.35);await page.mouse.click(box.x+box.width*.15,box.y+box.height*.65);
   state=await inspect();assert.equal(state.project.bones.length,1+(k+1)*2,'every two clicks append exactly one segment');
   if(k){assert.deepEqual(state.project.bones.slice(0,before.bones.length),before.bones);assert.deepEqual(state.project.skinWeights,before.skinWeights);assert.deepEqual(state.project.skinIndices,before.skinIndices);}
   await setPoint(k*2+1,start);await setPoint(k*2+2,end);await page.locator('#chainName').fill(name);await page.locator('#chainName').press('Tab');
 }
 const emptyFile=path.join(output,'cow-four-bones.jiggle.json');await save(emptyFile);let project=JSON.parse(await readFile(emptyFile,'utf8'));
 assert.equal(Object.keys(project.partNames).length,4);assert(project.mask.every(w=>w===0));
 const paths=chainPaths(project.bones),roots=paths.map(p=>project.bones[p[0]].name);project.owners=[];project.mask=[];
 const graph=surfaceGraph(project.geometry),componentSizes=new Map();for(const node of graph.nodes){const component=graph.components[node];componentSizes.set(component,(componentSizes.get(component)??0)+1);}assert.equal(componentSizes.size,8);
 for(let i=0;i<6624;i++){const x=project.geometry.positions[i*3],ear=componentSizes.get(graph.components[graph.nodes[i]])>1200;const index=ear?(x<0?2:3):(x<0?0:1);const rigid=Math.abs(x)<.65;project.owners.push(rigid?'':roots[index]);project.mask.push(rigid?0:index<2?1:.2);}
 project.mask=Array.from(new Float32Array(project.mask));
 Object.assign(project,skinForBones(project.geometry,new Float32Array(project.mask),project.bones,undefined,undefined,project.owners));
 const weightedFile=path.join(output,'cow-weighted.jiggle.json');await writeFile(weightedFile,JSON.stringify(project));await open(weightedFile);await frames(3);
 assert.deepEqual((await inspect()).project.owners,project.owners);assert.deepEqual((await inspect()).project.partNames,project.partNames);
 // Rest edits, count changes and deletion must preserve every other part.
 await page.locator('#chainSelect').selectOption(roots[0]);const before=(await inspect()).project;await setPoint(2,[-.9,-.33,-.04]);
 let edited=(await inspect()).project;assert.deepEqual(edited.bones.slice(3),before.bones.slice(3));assert.deepEqual(edited.skinWeights,before.skinWeights);assert.deepEqual(edited.skinIndices,before.skinIndices);
 await page.locator('#undo').click();assert.deepEqual((await inspect()).project.bones,before.bones);
 await advanced();await page.locator('#segments').fill('3');await page.locator('#applySegments').click();edited=(await inspect()).project;
 function namedRow(p,i){return p.skinIndices.slice(i*4,i*4+4).map((id,k)=>[p.bones[id].name,p.skinWeights[i*4+k]]);}
 for(let i=0;i<6624;i++)if(project.owners[i]!==roots[0])assert.deepEqual(namedRow(edited,i),namedRow(project,i),'extra segments change only this part');
 await page.locator('#undo').click();await page.locator('#chainSelect').selectOption(roots[1]);await tab('Bones');await page.locator('#selectBone').click();await page.locator('#deleteBone').click();edited=(await inspect()).project;
 assert.equal(edited.bones.length,7);for(let i=0;i<6624;i++)if(project.owners[i]!==roots[1])assert.deepEqual(namedRow(edited,i),namedRow(project,i));
 assert(edited.owners.every(owner=>owner!==roots[1]));assert.deepEqual(edited.mask,project.mask);
 await page.locator('#undo').click();assert.deepEqual((await inspect()).project.bones,project.bones);assert.deepEqual((await inspect()).project.skinWeights,project.skinWeights);
 // Real brush on an ear: set a lower target and keep bell rows unchanged.
 await page.locator('#chainSelect').selectOption(roots[2]);await tab('Weights');await page.locator('#weight').fill('10');await page.locator('#radius').fill('45');await frames(3);state=await inspect();const box=await page.locator('canvas[data-engine]').boundingBox();
 const camera=new THREE.PerspectiveCamera();camera.matrixWorld.fromArray(state.cameraWorld);camera.matrixWorldInverse.copy(camera.matrixWorld).invert();camera.projectionMatrix.fromArray(state.cameraProjection);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(project.geometry.positions,3));geo.setIndex(project.geometry.indices);const surface=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));surface.matrixAutoUpdate=false;surface.matrix.fromArray(state.meshWorld);surface.updateMatrixWorld(true);const ray=new THREE.Raycaster();let clicked=false;
 async function clickPart(owner){for(let face=0;face<project.geometry.indices.length/3;face++){
   const ids=project.geometry.indices.slice(face*3,face*3+3);if(!ids.every(i=>project.owners[i]===owner))continue;
   const point=ids.reduce((sum,i)=>sum.add(new THREE.Vector3().fromArray(project.geometry.positions,i*3)),new THREE.Vector3()).divideScalar(3).applyMatrix4(surface.matrixWorld),screen=point.clone().project(camera);
   if(Math.abs(screen.x)>.9||Math.abs(screen.y)>.9)continue;ray.setFromCamera(new THREE.Vector2(screen.x,screen.y),camera);if(ray.intersectObject(surface)[0]?.faceIndex!==face)continue;
   await page.mouse.click(box.x+(screen.x+1)*box.width/2,box.y+(1-screen.y)*box.height/2);return true;
 }return false;}
 clicked=await clickPart(roots[2]);
 assert(clicked,'find an exposed ear triangle');edited=(await inspect()).project;assert(edited.mask.some((m,i)=>project.owners[i]===roots[2]&&m<project.mask[i]-.001),'brush must reduce to weak target');
 for(let i=0;i<6624;i++)if(project.owners[i]!==roots[2]){assert.equal(edited.mask[i],project.mask[i]);assert.deepEqual(namedRow(edited,i),namedRow(project,i));}
 await page.keyboard.press('Control+z');assert.deepEqual((await inspect()).project.skinWeights,project.skinWeights);
 await page.locator('#erase').click();assert(await clickPart(roots[0]));assert.deepEqual((await inspect()).project.skinWeights,project.skinWeights,'erasing with ear selected must skip the bell');assert.deepEqual((await inspect()).project.owners,project.owners);
 geo.dispose();surface.material.dispose();
 // Both bells and both ears use the same trusted controller, with rigid zeros.
 await tab('Check');await page.locator('#simulate').click();await page.waitForFunction(()=>document.querySelector('#simulate').textContent==='Остановить симуляцию');
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.64,box.y+box.height*.55,{steps:25});await page.mouse.up();await page.mouse.wheel(0,90);await frames(4);state=await inspect();assert(state.running);
 const world=new THREE.Matrix4().fromArray(state.meshWorld),maximum=[0,0,0,0];let rigidCount=0;
 state.worldVertices.forEach((p,i)=>{const distance=new THREE.Vector3().fromArray(p).distanceTo(new THREE.Vector3().fromArray(project.geometry.positions,i*3).applyMatrix4(world));if(!project.mask[i]){assert(distance<1e-5);rigidCount++;}else{const group=roots.indexOf(project.owners[i]);maximum[group]=Math.max(maximum[group],distance);}});
 assert(rigidCount>0);assert(maximum.every(m=>m>.00001),'all four independently bound parts move');
 await page.screenshot({path:path.join(output,'cow-simulation.png')});await page.locator('#reset').click();await frames(3);state=await inspect();assert.deepEqual(state.project.skinWeights,project.skinWeights);assert.deepEqual(state.project.bones,project.bones);
 await tab('Bones');if(await page.locator('#boneAdvanced').evaluate(n=>n.open))await page.locator('#boneAdvanced > summary').click();await page.screenshot({path:path.join(output,'cow-editor.png')});
 await tab('Weights');await page.screenshot({path:path.join(output,'cow-weights.png')});assert.equal(await page.locator('#panelCheck').isVisible(),false);assert.equal(await page.locator('#panelBones').isVisible(),false);
 const saved=path.join(output,'cow-final.jiggle.json');await save(saved);await open(saved);assert.deepEqual((await inspect()).project.owners,project.owners);
 await page.locator('#exportMenu').click();await page.locator('#advanced > summary').click();await page.locator('#assetId').fill('123456');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},path.join(output,'cow-export.zip'));await page.locator('#export').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Комплект сохранён:'));
 assert.equal((await readFile(path.join(output,'cow-export.zip'))).subarray(0,2).toString(),'PK');assert.equal(errors.length,0,errors.join('\n'));
 await writeFile(path.join(output,'results.json'),JSON.stringify({pass:true,visible:false,item:175558,vertices:6624,parts:project.partNames,rigidCount,maximum,checks:['four two-click segments','rest isolation','segment-count isolation','delete/undo isolation','lower target brush','rigid zero weights','all SmartBone trees move','project restore','local RBXM export']},null,2));
 console.log('PASS real 175558: four independent chains, weak ears, brush reduction, isolation, delete/undo, zero vertices, persistence, SmartBone and local export.');
}finally{await app.close();}
