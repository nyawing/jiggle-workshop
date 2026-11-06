// Regression for interrupted two-click creation, undo and stale gizmo axes.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as THREE from 'three';
const root=path.resolve(import.meta.dirname,'..');
const app=await electron.launch({...(process.env.WORKSHOP_EXE?{executablePath:process.env.WORKSHOP_EXE,args:[]}:{args:[root]}),env:{...process.env,WORKSHOP_TEST:'1'}});
try{
  const page=await app.firstWindow();
  await page.locator('#demo').click();
  assert.equal(await page.locator('#boneAdvanced').isVisible(),false);
  const canvas=page.locator('canvas[data-engine]'),box=await canvas.boundingBox();
  const state=()=>page.evaluate(()=>window.workshopInspect());
  async function chain(x){
    await page.locator('#chain').click();
    await page.mouse.click(box.x+box.width*x,box.y+box.height*.35);
    await page.mouse.click(box.x+box.width*x,box.y+box.height*.65);
  }
  await page.locator('#tabBones').click();await chain(.5);
  const baseline=await state();assert.equal(baseline.project.bones.length,3);
  await chain(.55);
  assert.equal((await state()).project.bones.length,5);
  await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');
  assert.deepEqual((await state()).project.bones,baseline.project.bones,'two undos after a completed chain restore editable existing bones');
  await page.locator('#chain').click();
  await page.mouse.click(box.x+box.width*.55,box.y+box.height*.35);
  await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');
  assert.deepEqual((await state()).project.bones,baseline.project.bones);
  // Selecting the existing end must work after cancelling the draft twice.
  const current=await state();
  const matrix=new THREE.Matrix4().fromArray(current.cameraProjection).multiply(new THREE.Matrix4().fromArray(current.cameraWorld).invert());
  const point=new THREE.Vector3().fromArray(current.worldBones[2]).applyMatrix4(matrix);
  await page.mouse.click(box.x+(point.x+1)*box.width/2,box.y+(1-point.y)*box.height/2);
  assert.equal(await page.locator('#boneSelect').inputValue(),'2');
  // Hover the gizmo before switching to painting: its old axis cannot block input.
  await page.mouse.move(box.x+(point.x+1)*box.width/2+15,box.y+(1-point.y)*box.height/2);
  await page.locator('#tabWeights').click();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
  await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.51,{steps:3});await page.mouse.up();
  assert((await state()).project.mask.some(v=>v>0),'painting works after switching from bone creation/gizmo');
  console.log('PASS interrupted creation, Ctrl+Z twice, existing point selection and brush input');
}finally{await app.close();}
