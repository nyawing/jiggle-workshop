const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {spawn}=require('node:child_process');
const os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
let win, importedPath=null;
function backend(command,payload){
  return new Promise((resolve,reject)=>{
    const executable=app.isPackaged?path.join(process.resourcesPath,'backend','workshop-backend.exe'):'python';
    const args=app.isPackaged?[command]:[path.join(root,'backend','asset_io.py'),command];
    const proc=spawn(executable,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',error='';const timer=setTimeout(()=>{proc.kill();reject(new Error('Обработка заняла слишком долго.'));},command==='import-reference'?300000:60000);
    proc.stdout.on('data',b=>{output+=b;if(output.length>32e6)proc.kill();});
    proc.stderr.on('data',b=>{if(error.length<4000)error+=b;});
    proc.on('error',e=>{clearTimeout(timer);reject(e);});
    proc.on('close',code=>{clearTimeout(timer);try{const result=JSON.parse(output);if(code||result.error){const failure=new Error(result.error||error);failure.code=result.code;reject(failure);}else resolve(result);}catch(e){reject(new Error(error||'Не удалось прочитать ответ импортера.'));}});
    proc.stdin.end(JSON.stringify(payload));
  });
}
function trusted(event){if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('Unknown sender');}
async function importFile(file){
  if(typeof file!=='string'||!['.rbxm','.rbxmx','.json'].includes(path.extname(file).toLowerCase()))throw new Error('Выберите RBXM, RBXMX или проект .jiggle.json.');
  if(path.extname(file).toLowerCase()==='.json'){
    if((await fs.stat(file)).size>64e6)throw new Error('Проект слишком большой.');
    const project=JSON.parse(await fs.readFile(file,'utf8'));
    if(project.version!==1)throw new Error('Неизвестная версия проекта.');
    await backend('validate-project',{project});
    importedPath=null;
    if(project.sourceBase64){
      if(typeof project.sourceBase64!=='string'||project.sourceBase64.length>34e6)throw new Error('Некорректный исходник проекта.');
      const raw=Buffer.from(project.sourceBase64,'base64');
      if(crypto.createHash('sha256').update(raw).digest('hex')!==project.sourceHash)throw new Error('Исходник проекта повреждён.');
      const directory=await fs.mkdtemp(path.join(os.tmpdir(),'jiggle-project-'));
      importedPath=path.join(directory,'original.rbxm');await fs.writeFile(importedPath,raw);
    }
    return {name:project.name||'Проект',geometry:project.geometry,texture:project.texture,appearance:project.appearance,attachments:project.attachments,catalogType:project.catalogType,sourceHash:project.sourceHash,itemType:project.itemType,warnings:[],savedProject:project};
  }
  const result=await backend('import',{path:file});importedPath=file;return result;
}
app.whenReady().then(()=>{
  win=new BrowserWindow({show:process.env.WORKSHOP_TEST!=='1',width:1250,height:830,minWidth:980,minHeight:650,backgroundColor:'#11151f',title:'Jiggle Workshop',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,offscreen:process.env.WORKSHOP_TEST==='1'}});
  win.setMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  // Covers the title-bar X, Alt+F4, app.quit and reload without losing edits.
  win.webContents.on('will-prevent-unload',event=>{
    const choice=dialog.showMessageBoxSync(win,{
      type:'warning',title:'Несохранённые изменения',
      message:'В проекте есть несохранённые изменения.',
      detail:'Закрыть Workshop и потерять эти изменения?',
      buttons:['Продолжить редактирование','Закрыть без сохранения'],
      defaultId:0,cancelId:0,noLink:true,
    });
    if(choice===1)event.preventDefault();
  });

  ipcMain.handle('open',async event=>{trusted(event);const result=await dialog.showOpenDialog(win,{filters:[{name:'Аксессуары и проекты',extensions:['rbxm','rbxmx','json']}]});return result.canceled?null:importFile(result.filePaths[0]);});
  ipcMain.handle('import',async(event,file)=>{trusted(event);return importFile(file);});
  ipcMain.handle('import-reference',async(event,reference)=>{
    trusted(event);
    const result=await backend('import-reference',{reference});
    const raw=Buffer.from(result.sourceBase64,'base64');
    if(raw.length>24*1024*1024||crypto.createHash('sha256').update(raw).digest('hex')!==result.sourceHash)throw new Error('Скачанный предмет повреждён.');
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'jiggle-accessory-'));
    const file=path.join(directory,'original.rbxm');await fs.writeFile(file,raw);
    importedPath=file;delete result.sourceBase64;return result;
  });
  ipcMain.handle('mesh',async event=>{trusted(event);const result=await dialog.showOpenDialog(win,{filters:[{name:'Геометрия Roblox',extensions:['mesh']}]});return result.canceled?null:backend('mesh',{path:result.filePaths[0]});});
  ipcMain.handle('save-project',async(event,project)=>{trusted(event);await backend('validate-project',{project});const result=await dialog.showSaveDialog(win,{defaultPath:'accessory.jiggle.json'});if(result.canceled)return null;
    if(importedPath&&project.sourceHash){const raw=await fs.readFile(importedPath);if(crypto.createHash('sha256').update(raw).digest('hex')!==project.sourceHash)throw new Error('Исходник изменился.');project={...project,sourceBase64:raw.toString('base64')};}
    const text=JSON.stringify(project,null,2);if(text.length>64e6)throw new Error('Проект слишком большой.');await fs.writeFile(result.filePath,text,{flag:'w'});return result.filePath;});
  ipcMain.handle('save-mesh',async(event,project)=>{trusted(event);const result=await dialog.showSaveDialog(win,{defaultPath:'accessory.mesh',filters:[{name:'Skinned mesh',extensions:['mesh']}]});return result.canceled?null:backend('save-mesh',{path:result.filePath,project});});
  ipcMain.handle('export',async(event,project)=>{trusted(event);if(!importedPath)throw new Error('Сначала загрузите аксессуар.');const result=await dialog.showSaveDialog(win,{defaultPath:'accessory-jiggle.zip',filters:[{name:'Комплект аксессуара',extensions:['zip']}]});if(result.canceled)return null;if(path.resolve(result.filePath)===path.resolve(importedPath))throw new Error('Оригинал нельзя перезаписывать.');return backend('export',{source:importedPath,path:result.filePath,project});});
  win.loadFile(path.join(root,'dist','index.html'));
});
app.on('window-all-closed',()=>app.quit());
