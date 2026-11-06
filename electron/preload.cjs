const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('workshop',Object.freeze({
  testMode:process.env.WORKSHOP_TEST==='1',
  onImportStatus:callback=>{const handler=(_,text)=>{if(typeof text==='string')callback(text);};ipcRenderer.on('import-status',handler);return ()=>ipcRenderer.removeListener('import-status',handler);},
  open:()=>ipcRenderer.invoke('open'),
  importReference:reference=>ipcRenderer.invoke('import-reference',reference),
  importDrop:file=>ipcRenderer.invoke('import',webUtils.getPathForFile(file)),
  mesh:()=>ipcRenderer.invoke('mesh'),
  export:project=>ipcRenderer.invoke('export',project),
  saveProject:project=>ipcRenderer.invoke('save-project',project),
  saveMesh:project=>ipcRenderer.invoke('save-mesh',project),
}));
