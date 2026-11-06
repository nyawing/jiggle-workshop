import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const app=await electron.launch({args:[root],env:{...process.env,WORKSHOP_TEST:'1'}});
try{
 const page=await app.firstWindow();await page.locator('#demo').click();await page.locator('#tabBones').click();
 const box=await page.locator('canvas[data-engine]').boundingBox();const state=()=>page.evaluate(()=>window.workshopInspect());
 await page.locator('#chain').click();await page.mouse.click(box.x+box.width*.5,box.y+box.height*.35);await page.mouse.click(box.x+box.width*.5,box.y+box.height*.65);
 await page.locator('#tabWeights').click();await page.locator('#autoWeights').click();
 const before=(await state()).project;assert(before.mask.some(x=>x>0));
 const heat=await page.locator('canvas[data-engine]').screenshot();
 await page.screenshot({path:path.resolve(root,'../../reports/jiggle-workshop-0.1.27-weights.png')});
 await page.locator('#weightHeatmap').uncheck();
 const textured=await page.locator('canvas[data-engine]').screenshot();assert(!heat.equals(textured),'display changes');
 assert.deepEqual((await state()).project,before,'view toggle never edits project or skin');
 await page.locator('#weightHeatmap').check();assert.deepEqual((await state()).project,before);
 console.log('PASS contrast view toggles visibly without changing mesh, weights or export data');
}finally{await app.close();}
