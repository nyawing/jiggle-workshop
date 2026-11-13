import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
async function launch(){const app=await electron.launch({...(process.env.WORKSHOP_EXE?{executablePath:process.env.WORKSHOP_EXE,args:[]}:{args:[root]}),env:{...process.env,WORKSHOP_TEST:'1'}});const page=await app.firstWindow();await page.waitForSelector('#demo');await app.evaluate(({dialog})=>{globalThis.closePrompts=0;globalThis.closeChoice=0;dialog.showMessageBoxSync=()=>{globalThis.closePrompts++;return globalThis.closeChoice;};});return {app,page};}
const {app,page}=await launch();
try{
 await page.locator('#demo').click();
 await page.locator('#soft').evaluate(n=>{n.value='37';n.dispatchEvent(new Event('input'));});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
 await page.waitForTimeout(150);
 assert.equal(await app.evaluate(()=>globalThis.closePrompts),1);assert.equal(page.isClosed(),false,'Cancel keeps edited window');
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('save-project');ipcMain.handle('save-project',()=>null);});
 await page.locator('#save').evaluate(n=>n.click());await page.waitForTimeout(150);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await page.waitForTimeout(150);
 assert.equal(await app.evaluate(()=>globalThis.closePrompts),2,'Cancelled saving retains close guard');
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('save-project');ipcMain.handle('save-project',()=>'/test/saved.jiggle.json');});
 await page.locator('#save').evaluate(n=>n.click());await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект сохранён:'));
 // Saving removes the renderer guard; dispatch must not be prevented.
 assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),true);
 await page.locator('#soft').evaluate(n=>{n.value='42';n.dispatchEvent(new Event('input'));});
 await app.evaluate(()=>globalThis.closeChoice=1);
 const closed=page.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close()).catch(()=>{});await closed;
 console.log('PASS native close guard: cancel close, cancel save, successful save, explicit discard');
}finally{await app.close().catch(()=>{});}
const clean=await launch();try{assert.equal(await clean.page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),true);console.log('PASS clean window has no close guard');}finally{await clean.app.close();}
