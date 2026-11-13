import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import * as THREE from 'three';
const root=process.cwd(),dir=await mkdtemp(path.join(os.tmpdir(),'workshop-gradient-'));
// Two overlapping shells and a disconnected neighbor: scope and depth must be explicit.
const positions=[],indices=[];for(const [x,z] of [[0,0],[0,-.02],[4,0]]){const i=positions.length/3;positions.push(x-.3,-1,z,x+.3,-1,z,x+.3,1,z,x-.3,1,z);indices.push(i,i+1,i+2,i,i+2,i+3);}
const fixture={version:1,name:'Gradient fixture',geometry:{positions,normals:Array.from({length:36},(_,i)=>i%3===2?1:0),uv:Array(24).fill(0),indices,rigged:false},bones:[],skinIndices:[],skinWeights:[],mask:Array(12).fill(0),owners:Array(12).fill(''),partNames:{},anchor:[0,1,0],tip:[0,-1,0],settings:{stiffness:.4,damping:.18},appearance:{doubleSided:false}};
const file=path.join(dir,'fixture.jiggle.json');await writeFile(file,JSON.stringify(fixture));
const app=await electron.launch({...(process.env.WORKSHOP_EXE?{executablePath:process.env.WORKSHOP_EXE,args:[]}:{args:[root]}),env:{...process.env,WORKSHOP_TEST:'1'}});
try{
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.waitForSelector('#demo');
 assert.equal(await page.locator('#mcpSettings').count(),0);assert.equal(await page.evaluate(()=>typeof window.workshop.mcpControl),'undefined');
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),file);await page.locator('#open').evaluate(n=>n.click());await page.waitForFunction(()=>{try{return !!window.workshopInspect().meshWorld}catch{return false}});
 const inspect=()=>page.evaluate(()=>window.workshopInspect());const state=await inspect();const camera=new THREE.PerspectiveCamera();camera.matrixWorld.fromArray(state.cameraWorld);camera.matrixWorldInverse.copy(camera.matrixWorld).invert();camera.projectionMatrix.fromArray(state.cameraProjection);const bounds=await page.locator('canvas[data-engine]').boundingBox();
 function screen(x,y,z=0){const p=new THREE.Vector3(x,y,z).applyMatrix4(new THREE.Matrix4().fromArray(state.meshWorld)).project(camera);return {x:bounds.x+(p.x+1)*bounds.width/2,y:bounds.y+(1-p.y)*bounds.height/2};}
 const top=screen(0,1),bottom=screen(0,-1),middle=screen(0,0);
 await page.locator('#surfaceSelect').click();await page.mouse.click(middle.x,middle.y);assert.equal((await inspect()).project.editor.surfaceSelection.length,1);
 await page.keyboard.press('w');assert(!await page.locator('#gradient').evaluate(n=>n.classList.contains('selected')));await page.keyboard.press('Control+w');assert(await page.locator('#gradient').evaluate(n=>n.classList.contains('selected')));await page.locator('#throughBrush').check();await page.locator('#weight').fill('70');
 async function drag(cancel=false){await page.mouse.move(top.x,top.y);await page.mouse.down();await page.mouse.move(bottom.x,bottom.y,{steps:10});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
 await drag();let mask=(await inspect()).project.mask;assert(mask[0]>.67&&mask[1]>.67);assert(mask[2]<.02&&mask[3]<.02);assert(mask.slice(4).every(w=>w===0),'top, hidden unselected shell and neighbor stay rigid');
 assert.deepEqual((await inspect()).project.geometry,fixture.geometry);await page.keyboard.press('Control+z');assert((await inspect()).project.mask.every(w=>w===0));
 await drag(true);assert((await inspect()).project.mask.every(w=>w===0),'Esc cancels without editing');
 await page.locator('#clearSelection').click();assert.equal((await inspect()).project.editor.surfaceSelection.length,0);
 await drag();assert((await inspect()).project.mask[0]>.67,'unselected drag scopes to the starting surface');
 await mkdir(path.resolve(root,'../../reports'),{recursive:true});await page.screenshot({path:path.resolve(root,'../../reports/workshop-gradient.png')});assert.deepEqual(errors,[]);
 console.log('PASS gradient scope, whole-width ramp, one undo, Esc cancellation, no remote control UI, unchanged geometry');
}finally{await app.close();}
