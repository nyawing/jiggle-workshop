// Zoom regression runs in a separate invisible app, never the user's window.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as THREE from 'three';
const root=path.resolve(import.meta.dirname,'..');
const app=await electron.launch({...(process.env.WORKSHOP_EXE?{executablePath:process.env.WORKSHOP_EXE,args:[]}:{args:[root]}),env:{...process.env,WORKSHOP_TEST:'1'}});
try{
  const page=await app.firstWindow();
  await page.locator('#demo').click();
  const state=()=>page.evaluate(()=>window.workshopInspect());
  const rendered=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const position=s=>new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(s.cameraWorld));
  const distance=s=>position(s).distanceTo(new THREE.Vector3().fromArray(s.cameraTarget));
  const box=await page.locator('canvas[data-engine]').boundingBox();
  await page.mouse.move(box.x+box.width*.72,box.y+box.height*.32);
  await rendered();
  const baseline=await state();
  await page.mouse.wheel(0,80);await rendered();
  const rotated=await state();assert.notEqual(rotated.yaw,baseline.yaw);
  assert(position(rotated).distanceTo(position(baseline))<1e-6,'plain wheel does not zoom');
  const camera=new THREE.PerspectiveCamera();
  camera.matrixWorld.fromArray(rotated.cameraWorld);camera.projectionMatrix.fromArray(rotated.cameraProjection);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(.44,.36),camera);
  await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await rendered();
  const zoomed=await state();
  assert(distance(zoomed)<distance(rotated),'Ctrl + wheel zooms in');
  assert.equal(zoomed.yaw,rotated.yaw,'Ctrl + wheel does not rotate the accessory');
  const movement=position(zoomed).sub(position(rotated)).normalize();
  assert(movement.dot(ray.ray.direction)>.999,'camera moves along the off-centre cursor ray');
  assert.deepEqual(zoomed.project,baseline.project,'zoom does not edit project data');
  await page.mouse.wheel(0,120);await rendered();
  assert(distance(await state())>distance(zoomed),'Ctrl + wheel zooms out');
  await page.keyboard.up('Control');
  const released=await state();await page.mouse.wheel(0,80);await rendered();
  const normal=await state();assert.notEqual(normal.yaw,released.yaw);
  assert(position(normal).distanceTo(position(released))<1e-6,'releasing Ctrl restores plain-wheel rotation');
  // Large events must remain finite and respect model-relative distance limits.
  await page.locator('canvas[data-engine]').evaluate(node=>{
    for(let i=0;i<160;i++)node.dispatchEvent(new WheelEvent('wheel',{deltaY:-10000,ctrlKey:true,clientX:node.getBoundingClientRect().left+node.clientWidth/2,clientY:node.getBoundingClientRect().top+node.clientHeight/2,bubbles:true,cancelable:true}));
  });await rendered();
  const close=await state();assert(close.cameraWorld.every(Number.isFinite));
  assert(distance(close)>=close.cameraLimits[0]-1e-6);
  assert.deepEqual(close.project,baseline.project);
  // Camera-only interaction must not trigger the edited-project warning.
  await page.locator('#demo').evaluate(node=>node.click());await rendered();
  assert.equal((await state()).yaw,0);
  console.log('PASS Ctrl cursor zoom, plain-wheel rotation, release, distance limits and unchanged project');
}finally{await app.close();}
