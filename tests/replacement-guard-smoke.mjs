// Exercise the real renderer in a separate invisible window, never user's work.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const app=await electron.launch({...(process.env.WORKSHOP_EXE?{executablePath:process.env.WORKSHOP_EXE,args:[]}:{args:[root]}),env:{...process.env,WORKSHOP_TEST:'1'}});
try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  const state=()=>page.evaluate(()=>window.workshopInspect().project);
  await page.locator('#demo').click();
  const geometry=(await state()).geometry;
  await app.evaluate(({ipcMain},geometry)=>{
    globalThis.guardCalls={remote:0,open:0,drop:0};
    const result=()=>({name:'Replacement fixture',geometry,warnings:[]});
    for(const [channel,key] of [['import-reference','remote'],['open','open'],['import','drop']]){
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel,()=>{globalThis.guardCalls[key]++;return result();});
    }
  },geometry);
  const calls=()=>app.evaluate(()=>globalThis.guardCalls);
  await page.locator('#reference').fill('https://nyawing.com/catalog/36777/item');
  await page.locator('#download').click();
  await page.waitForFunction(()=>document.querySelector('#label').textContent.includes('Replacement fixture'));
  assert.equal((await calls()).remote,1,'an untouched model loads without a prompt');

  async function guarded(trigger,accept=false){
    let message;
    const handled=new Promise(resolve=>page.once('dialog',async dialog=>{
      message=dialog.message();assert.equal(dialog.type(),'confirm');
      if(accept)await dialog.accept();else await dialog.dismiss();resolve();
    }));
    await trigger();await handled;
    assert.match(message,/потерять текущую работу/);
  }
  const canvas=page.locator('canvas[data-engine]'),box=await canvas.boundingBox();
  await page.locator('#tabWeights').click();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
  await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.51,{steps:3});await page.mouse.up();
  assert((await state()).mask.some(v=>v>0),'paint-only edit exists');
  const painted=await state();
  await guarded(()=>page.locator('#download').click());
  assert.deepEqual(await state(),painted,'cancel keeps all paint/project data');
  assert.equal((await calls()).remote,1,'cancel happens before import IPC');
  assert.equal(await page.locator('#download').isEnabled(),true);

  await guarded(()=>page.locator('#open').evaluate(node=>node.click()));
  assert.equal((await calls()).open,0,'file picker/import is not invoked on cancel');
  await guarded(()=>page.locator('#stage').evaluate(node=>{
    const dataTransfer=new DataTransfer();dataTransfer.items.add(new File(['fixture'],'test.rbxm'));
    node.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));
  }));
  assert.equal((await calls()).drop,0,'cancelled drop never reaches backend');
  assert.deepEqual(await state(),painted);

  await guarded(()=>page.locator('#download').click(),true);
  await page.waitForFunction(()=>!window.workshopInspect().project.mask.some(v=>v>0));
  assert.equal((await calls()).remote,2,'accept loads exactly once');

  await page.locator('#soft').evaluate(node=>{node.value='37';node.dispatchEvent(new Event('input'));});
  const settingsOnly=await state();
  await guarded(()=>page.locator('#download').click());
  assert.deepEqual(await state(),settingsOnly,'settings-only edits are protected');
  await guarded(()=>page.locator('#download').click(),true);
  await page.waitForFunction(()=>document.querySelector('#download').textContent==='Загрузить');
  await page.locator('#tabBones').click();await page.locator('#chain').click();
  await page.mouse.click(box.x+box.width*.5,box.y+box.height*.35);
  await page.mouse.click(box.x+box.width*.5,box.y+box.height*.65);
  const boned=await state();assert(boned.bones.length>0,'bone-only edit exists');
  await guarded(()=>page.locator('#download').click());
  assert.deepEqual(await state(),boned,'cancel keeps bones and rest positions');
  await page.keyboard.press('Control+z');
  await guarded(()=>page.locator('#download').click());
  console.log('PASS replacement guard: clean import, paint, bones, settings, undo, cancel, accept, file-open and drop');
}finally{await app.close();}
