import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const app=await electron.launch({args:[root],env:{...process.env,WORKSHOP_TEST:'1'}});
try{
 const page=await app.firstWindow();await page.locator('#demo').click();await page.locator('#tabBones').click();
 const box=await page.locator('canvas[data-engine]').boundingBox();const state=()=>page.evaluate(()=>window.workshopInspect());
 await page.locator('#chain').click();await page.mouse.click(box.x+box.width*.5,box.y+box.height*.35);await page.mouse.click(box.x+box.width*.5,box.y+box.height*.65);
 const before=(await state()).project;assert.equal(before.bones.length,3);
 await page.locator('#surfacePlace').click();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
 assert.deepEqual((await state()).project,before,'hover does not mutate rest pose');
 await page.keyboard.press('Escape');assert.deepEqual((await state()).project,before,'cancel preserves project');
 await page.keyboard.press('g');await page.mouse.click(box.x+box.width*.5,box.y+box.height*.5);
 assert.notDeepEqual((await state()).project.bones,before.bones,'click commits point');
 await page.keyboard.press('Control+z');assert.deepEqual((await state()).project.bones,before.bones);
 await page.locator('#mirrorChain').click();const after=(await state()).project;
 assert.equal(after.bones.length,5);assert.deepEqual(after.skinWeights,before.skinWeights);
 await page.keyboard.press('Control+z');assert.deepEqual((await state()).project.bones,before.bones);
 await page.screenshot({path:path.resolve(root,'../../reports/jiggle-workshop-0.1.26.png')});
 console.log('PASS surface preview/cancel/commit/undo and mirrored chain/weights/undo');
}finally{await app.close();}
