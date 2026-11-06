// Read-only comparison in an isolated app; never touches the user's project.
import {_electron as electron} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const out=path.resolve(root,'../../_work/jiggle-fishing-81552131544900');
await mkdir(out,{recursive:true});
const imported=JSON.parse(await readFile(path.join(out,'import.json'),'utf8'));
delete imported.sourceBase64;
for(const variant of ['original','flipped','lod0']){
  const result=structuredClone(imported);
  if(variant==='flipped')for(let i=1;i<result.geometry.uv.length;i+=2)result.geometry.uv[i]=1-result.geometry.uv[i];
  if(variant==='lod0')result.geometry.indices=result.geometry.indices.slice(0,3800*3);
  const app=await electron.launch({args:[root],env:{...process.env,WORKSHOP_TEST:'1'}});
  try{
    await app.evaluate(({ipcMain},data)=>{ipcMain.removeHandler('import-reference');ipcMain.handle('import-reference',()=>data);},result);
    const page=await app.firstWindow();
    await page.locator('#reference').fill('https://www.roblox.com/catalog/81552131544900/Fishing-Rod');
    await page.locator('#download').click();
    await page.waitForFunction(()=>window.workshopInspect&&document.querySelector('aside').hidden===false&&document.querySelector('#download').textContent==='Загрузить');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.locator('#stage').screenshot({path:path.join(out,'uv-'+variant+'.png')});
  }finally{await app.close();}
}
console.log('Saved isolated UV comparisons');
