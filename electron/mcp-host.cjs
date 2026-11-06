/** Local-only MCP lifecycle and a bounded IPC bridge; never evaluates model code. */
const {ipcMain,clipboard}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function setupMcp(app,win){
 const directory=process.env.WORKSHOP_TEST==='1'&&process.env.WORKSHOP_TEST_DATA?process.env.WORKSHOP_TEST_DATA:app.getPath('userData');
 const filename=path.join(directory,'mcp-settings.json');
 let settings={enabled:false,port:32187,token:crypto.randomBytes(32).toString('hex')},server=null,ready=false,lastAction=null,closing=false;
 const pending=new Map();let lifecycle=Promise.resolve();
 const trusted=event=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('Unknown sender');};
 const save=async()=>{await fs.mkdir(directory,{recursive:true});const temp=filename+'.tmp';await fs.writeFile(temp,JSON.stringify(settings),{mode:0o600});await fs.rename(temp,filename);};
 const state=()=>({enabled:!!server,url:server?.url??null,ready,lastAction});
 const notify=()=>{if(!win.isDestroyed())win.webContents.send('mcp-status',state());};
 ipcMain.on('mcp-renderer-ready',event=>{trusted(event);ready=true;notify();});
 ipcMain.on('mcp-result',(event,message)=>{
  trusted(event);if(!message||typeof message.id!=='string')return;const request=pending.get(message.id);if(!request)return;
  pending.delete(message.id);if(message.error)request.reject(new Error(String(message.error).slice(0,2000)));else request.resolve(message.result);
 });
 const failPending=()=>{ready=false;for(const p of pending.values())p.reject(new Error('Workshop window closed or reloaded'));pending.clear();};
 win.webContents.on('render-process-gone',failPending);win.webContents.on('did-start-loading',failPending);
 const dispatch=async(action,args)=>{
  if(!ready||win.isDestroyed())throw new Error('Workshop is not ready');
  if(pending.size)throw new Error('Workshop is executing another MCP command');
  lastAction={name:action,at:new Date().toISOString()};notify();
  const result=await new Promise((resolve,reject)=>{const id=crypto.randomUUID();pending.set(id,{resolve,reject});win.webContents.send('mcp-command',{id,action,args});});
  if(action!=='screenshot')return result;
  const rect=result?.captureRect,bounds=win.getContentBounds();
  if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite))throw new Error('Invalid viewport rectangle');
  const x=Math.max(0,Math.floor(rect.x)),y=Math.max(0,Math.floor(rect.y));
  const width=Math.min(Math.floor(rect.width),bounds.width-x),height=Math.min(Math.floor(rect.height),bounds.height-y);
  if(width<1||height<1)throw new Error('Viewport is not visible');
  const captured=await win.webContents.capturePage({x,y,width,height});const size=captured.getSize();
  const image=size.width>1280?captured.resize({width:1280}):captured;const dimensions=image.getSize();
  const {captureRect,...metadata}=result;
  return {content:[{type:'text',text:JSON.stringify({...metadata,imageSize:dimensions,scope:'Workshop 3D viewport only'})},{type:'image',data:image.toPNG().toString('base64'),mimeType:'image/png'}]};
 };
 async function start(){
  if(server)return;
  const {createMcpServer}=require('./mcp-server.cjs');
  const options={token:settings.token,port:settings.port,dispatch,onActivity:notify};
  try{server=await createMcpServer(options);}catch(error){if(error.code!=='EADDRINUSE')throw error;server=await createMcpServer({...options,port:0});}
  settings.port=server.port;settings.enabled=true;await save();notify();
 }
 async function stop(){const current=server;server=null;settings.enabled=false;notify();if(current)await current.close();await save();}
 function config(version){
  if(!server)throw new Error('Enable MCP first');
  const entry={type:'remote',url:server.url,timeout:360000,headers:{Authorization:'Bearer '+settings.token},oauth:false};
  return JSON.stringify({$schema:'https://opencode.ai/config.json',mcp:version===2?{servers:{'jiggle-workshop':entry}}:{'jiggle-workshop':{...entry,enabled:true}}},null,2);
 }
 ipcMain.handle('mcp-control',(event,request)=>{
  trusted(event);if(!request||!['status','enable','disable','copy-config','config'].includes(request.action))throw new Error('Invalid MCP control action');
  const operation=async()=>{if(closing)throw new Error('Workshop is closing');
   if(request.action==='enable')await start();if(request.action==='disable')await stop();
   if(request.action==='copy-config'){clipboard.writeText(config(request.version===2?2:1));return {...state(),copied:true};}
   if(request.action==='config')return {...state(),config:config(request.version===2?2:1)};
   return state();};
  const result=lifecycle.then(operation);lifecycle=result.catch(()=>{});return result;
 });
 const initialization=(async()=>{
  try{const saved=JSON.parse(await fs.readFile(filename,'utf8'));if(saved&&typeof saved.token==='string'&&/^[a-f0-9]{64}$/.test(saved.token)&&Number.isInteger(saved.port)&&saved.port>0&&saved.port<65536)settings={enabled:saved.enabled===true,token:saved.token,port:saved.port};}catch{}
  if(settings.enabled)try{await start();}catch{settings.enabled=false;notify();}
 })();lifecycle=initialization;
 win.on('closed',()=>{closing=true;failPending();if(server){const current=server;server=null;void current.close();}});
 return {state};
}
module.exports={setupMcp};
