/** Dependency-free, stateless JSON Streamable HTTP transport.
 * OpenCode v1: mcp['jiggle-workshop'] = {type:'remote', url, enabled:true,
 * headers:{Authorization:'Bearer <token>'}, oauth:false}.
 * Parameter snapshots and editing decisions belong to the host/renderer.
 */
const http = require('node:http');
const {workflowInstructions,toolGuides,enhanceToolResult}=require('./mcp-guidance.cjs');
const {getExample}=require('./mcp-examples.cjs');
const {timingSafeEqual} = require('node:crypto');
const VERSIONS = ['2025-03-26', '2025-06-18', '2025-11-25'];
const MAX_BODY = 1024 * 1024;
const RESPONSE_TIMEOUT = 360000;
const object = (properties = {}, required = []) => ({type:'object', properties, required, additionalProperties:false});
const str = {type:'string'}, bool = {type:'boolean'};
const integer = {type:'integer', minimum:0};
const vector = {type:'array', items:{type:'number'}, minItems:3, maxItems:3};
const indices = {type:'array', items:integer, maxItems:10000};
const view = {type:'string', enum:['front','back','left','right','top','bottom','perspective']};
const display = {type:'string', enum:['material','weights','bones']};
const definitions = [
 ['get_examples','Read concise authored reference examples; omit id to list without images. Examples are normalized designs, not live accessory coordinates.',object({id:{type:'string',enum:['cherry','curved-ears','curved-tail']}})],
 ['get_state','Inspect current state before editing. Coordinates are mesh-local.',object()],
 ['get_vertices','Read a page of mesh-local vertices.',object({offset:{...integer,default:0},limit:{...integer,minimum:1,maximum:256,default:256},screen:bool})],
 ['import_accessory','Import an accessory reference; host handles replacement decisions.',object({reference:str,discardChanges:bool},['reference'])],
 ['set_view','Set viewport orientation and optional display.',object({view,display},['view'])],
 ['screenshot','Capture viewport PNG. Requires an image-capable model.',object({view,display})],
 ['create_chain','Create a chain using mesh-local start/end positions.',object({start:vector,end:vector,name:{type:'string',minLength:1,maxLength:60},segments:{type:'integer',minimum:1,maximum:24}},['start','end'])],
 ['mirror_chain','Mirror a chain around mesh center; weights remain separately assignable.',object({index:integer,axis:{type:'integer',enum:[0,1,2]}},['index','axis'])],
 ['brush_stroke','Paint using the real screen-space brush. Coordinates are CSS pixels relative to viewport; scale screenshot pixels using viewport/imageSize.',object({points:{type:'array',minItems:1,maxItems:512,items:{type:'array',items:{type:'number'},minItems:2,maxItems:2}},operation:{type:'string',enum:['set','erase','smooth']},weight:{type:'number',minimum:0,maximum:1},radius:{type:'number',minimum:8,maximum:90},strength:{type:'number',minimum:0,maximum:1},hardness:{type:'number',minimum:0,maximum:1},through:bool},['points','operation'])],
 ['mirror_weights','Copy tuned weights between corresponding mirrored chains; preserves geometry and protects unrelated chains. Inspect unmatched count.',object({sourceChain:str,targetChain:str,axis:{type:'integer',enum:[0,1,2]}},['sourceChain','targetChain','axis'])],
 ['move_bone','Move a bone to a mesh-local position.',object({index:integer,position:vector},['index','position'])],
 ['select_chain','Select a named chain.',object({name:str},['name'])],
 ['select_surfaces','Select mesh components.',object({components:indices,mode:{type:'string',enum:['replace','add','remove']},isolated:bool},['components','mode'])],
 ['set_weights','Edit weights; renderer supplies current parameter snapshots.',object({operation:{type:'string',enum:['set','erase','smooth','reassign']},weight:{type:'number',minimum:0,maximum:1},strength:{type:'number',minimum:0,maximum:1},activeChain:str,allChains:bool,vertices:indices},['operation'])],
 ['automatic_weights','Compute automatic weights.',object()],
 ['configure_physics','Set SmartBone stiffness and damping; undoable.',object({stiffness:{type:'number',minimum:0,maximum:1},damping:{type:'number',minimum:0,maximum:1}},['stiffness','damping'])],
 ['simulate','Start or stop simulation.',object({running:bool},['running'])],
 ['undo','Undo the last edit.',object()],
 ['save_project','Save through the host project workflow.',object()],
 ['export_accessory','Export through the host accessory workflow.',object()],
];
const tools = definitions.map(([name,description,inputSchema]) => ({name,description:description+' '+(toolGuides[name]?.note??toolGuides[name]?.next??''),inputSchema}));
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function valid(value,schema) {
 if(schema.enum && !schema.enum.includes(value))return false;
 if(schema.type==='object')return record(value) && Object.keys(value).every(k=>own(schema.properties,k)&&valid(value[k],schema.properties[k])) && schema.required.every(k=>own(value,k));
 if(schema.type==='array')return Array.isArray(value) && value.length >= (schema.minItems??0) && value.length <= (schema.maxItems??Infinity) && value.every(v=>valid(v,schema.items));
 if(schema.type==='number'||schema.type==='integer')return typeof value==='number' && Number.isFinite(value) && (schema.type!=='integer'||Number.isSafeInteger(value)) && value >= (schema.minimum??-Infinity) && value <= (schema.maximum??Infinity);
 if(schema.type==='string')return typeof value==='string'&&value.length>=(schema.minLength??0)&&value.length<=(schema.maxLength??Infinity);
 return typeof value === (schema.type==='boolean'?'boolean':'string');
}
const failure = (id,code,message) => ({jsonrpc:'2.0',id,error:{code,message}});
const toolError = message => ({content:[{type:'text',text:message}],isError:true});

async function createMcpServer({token,port=0,dispatch,onActivity} = {}) {
 if(typeof token!=='string'||!token.length||/[\r\n]/.test(token))throw new TypeError('A nonempty bearer token is required');
 if(typeof dispatch!=='function')throw new TypeError('dispatch must be a function');
 if(!Number.isInteger(port)||port<0||port>65535)throw new TypeError('Invalid port');
 const expected = Buffer.from('Bearer '+token);
 let busy=false, closing=false, actualPort, closePromise;
 const active = new Set();
 const activity = () => {try{onActivity?.();}catch{/* Observers must not break transport or release the lock. */}};
 const server = http.createServer(async (req,res) => {
  const send = (status,body) => {
   if(res.destroyed||res.writableEnded)return;
   if(body===undefined){res.writeHead(status);res.end();return;}
   res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));
  };
  const reject = (status,message) => {req.resume();send(status,failure(null,-32600,message));};
  const auth = Buffer.from(req.headers.authorization??'');
  if(auth.length!==expected.length||!timingSafeEqual(auth,expected)){res.setHeader('WWW-Authenticate','Bearer');return reject(401,'Unauthorized');}
  if(![`127.0.0.1:${actualPort}`,`localhost:${actualPort}`].includes(req.headers.host))return reject(403,'Invalid Host');
  if(req.headers.origin!==undefined && ![`http://127.0.0.1:${actualPort}`,`http://localhost:${actualPort}`].includes(req.headers.origin))return reject(403,'Invalid Origin');
  if(req.url!=='/mcp')return reject(404,'Not found');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return reject(405,'Method not allowed');}
  if(closing)return reject(503,'Server closing');
  if(req.headers['mcp-protocol-version']!==undefined&&!VERSIONS.includes(req.headers['mcp-protocol-version']))return reject(400,'Unsupported protocol version');
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??''))return reject(415,'Expected application/json');
  const accepts=(req.headers.accept??'').split(',').some(part=>{const [type,...parameters]=part.trim().split(';');return type.toLowerCase()==='application/json'&&!parameters.some(p=>/^\s*q\s*=\s*0(?:\.0*)?\s*$/i.test(p));});
  if(!accepts)return reject(406,'Accept must include application/json');
  if(Number(req.headers['content-length'])>MAX_BODY)return reject(413,'Body too large');
  let size=0,chunks=[];
  try{for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY){reject(413,'Body too large');return;}chunks.push(chunk);}}catch{return;}
  let msg;
  try{msg=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(400,failure(null,-32700,'Parse error'));}
  const hasId=record(msg)&&own(msg,'id');
  if(!record(msg)||msg.jsonrpc!=='2.0'||typeof msg.method!=='string'||(hasId&&!(typeof msg.id==='string'||(typeof msg.id==='number'&&Number.isSafeInteger(msg.id))))||(own(msg,'params')&&!record(msg.params)))return send(400,failure(null,-32600,'Invalid request'));
  const {id,method}=msg,params=msg.params??{};
  if(!hasId){if(method==='notifications/initialized'||method.startsWith('notifications/'))return send(202);return send(400,failure(null,-32600,'Request id required'));}
  const result = value => send(200,{jsonrpc:'2.0',id,result:value});
  const error = (code,message) => send(200,failure(id,code,message));
  if(method==='initialize'){
   if(typeof params.protocolVersion!=='string'||!record(params.capabilities)||!record(params.clientInfo)||typeof params.clientInfo.name!=='string'||typeof params.clientInfo.version!=='string')return error(-32602,'Invalid initialize parameters');
   return result({protocolVersion:VERSIONS.includes(params.protocolVersion)?params.protocolVersion:VERSIONS.at(-1),capabilities:{tools:{listChanged:false}},serverInfo:{name:'jiggle-workshop',version:'0.4.1'},instructions:workflowInstructions+' Use an image-capable model for viewport PNG screenshots. Call get_state before editing. All positions and get_state coordinate values are mesh-local. Host/renderer owns parameter snapshots and import/export decisions. OpenCode v1 remote configuration uses headers.Authorization = "Bearer <token>" and oauth: false.'});
  }
  if(method==='ping')return result({});
  if(method==='tools/list')return result({tools});
  if(method!=='tools/call')return error(-32601,'Method not found');
  if(Object.keys(params).some(k=>!['name','arguments','_meta'].includes(k)))return error(-32602,'Invalid tool parameters');
  const tool=tools.find(t=>t.name===params.name),args=own(params,'arguments')?params.arguments:{};
  if(!tool||!valid(args,tool.inputSchema))return error(-32602,'Unknown tool or invalid arguments');
  // Reject rather than queue stale edits. A response deadline never releases this lock.
  if(busy)return error(-32000,'Workshop busy; wait for the current operation to settle');
  busy=true;activity();
  const timer=setTimeout(()=>result(toolError('Operation response timed out; it may still be running. Wait before retrying.')),RESPONSE_TIMEOUT);
  const work=(async()=>{
   try{
    const value=tool.name==='get_examples'?getExample(args.id):await dispatch(tool.name,args);
    result(enhanceToolResult(tool.name,value,args));
   }catch(err){result(enhanceToolResult(tool.name,toolError(err instanceof Error?err.message:String(err)),args));}
   finally{clearTimeout(timer);busy=false;activity();}
  })();
  active.add(work);await work;active.delete(work);
 });
 server.requestTimeout=30000;
 server.headersTimeout=15000;
 server.timeout=0;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
 actualPort=server.address().port;
 return {url:`http://127.0.0.1:${actualPort}/mcp`,port:actualPort,close(){
  if(!closePromise){closing=true;closePromise=(async()=>{const stopped=new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));server.closeIdleConnections();await Promise.all([...active]);server.closeIdleConnections();await stopped;})();}
  return closePromise;
 }};
}
module.exports={createMcpServer};
