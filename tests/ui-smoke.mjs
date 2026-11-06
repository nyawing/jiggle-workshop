// Automated checks of our own app in an invisible test window, not the desktop.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,copyFile,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.env.WORKSHOP_SMOKE_OUTPUT||path.resolve(root,'../../_work/jiggle-workshop-ui-0.1.2'));await mkdir(output,{recursive:true});
const errors=[];
const app=await electron.launch({...(process.env.WORKSHOP_EXE?{executablePath:process.env.WORKSHOP_EXE,args:[]}:{args:[root]}),env:{...process.env,WORKSHOP_TEST:'1'}});
try{
  const page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  async function control(id){
    if(id==='open')return {click:()=>page.locator('#open').evaluate(node=>node.click())};
    if(id==='save')return {click:()=>page.locator('#save').evaluate(node=>node.click())};
    if(id==='undo')return {click:async()=>{await page.locator(':focus').evaluateAll(nodes=>nodes.forEach(node=>node.blur()));await page.keyboard.press('Control+z');}};
    const target=page.locator('#'+id);
    const info=await target.evaluate(node=>({panel:node.closest('section[id^="panel"]')?.id,dialog:!!node.closest('dialog'),details:[...function*(n){for(let p=n.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')yield p.id;}(node)]}));
    if(info.dialog){if(!await page.locator('#exportDialog').evaluate(n=>n.open))await page.locator('#exportMenu').evaluate(node=>node.click());}
    else if(await page.locator('#exportDialog').evaluate(n=>n.open))await page.locator('#closeExport').click();
    if(info.panel&&await page.locator('#'+info.panel).evaluate(n=>n.hidden))await page.locator('#tab'+info.panel.slice(5)).click();
    for(const detail of info.details.reverse()){
      if(detail==='boneAdvanced')await page.locator('#'+detail).evaluate(n=>n.hidden=false); // Exercise retained legacy project controls, not public UI.
      if(!await page.locator('#'+detail).evaluate(n=>n.open))await page.locator('#'+detail+' > summary').click();
    }
    return target;
  }
  const rendered=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false,'test must never open a visible desktop window');
  if(process.env.WORKSHOP_EXE)assert.equal(await app.evaluate(({app})=>app.isPackaged),true,'portable test must use the frozen backend');
  console.log('Window ready');
  await page.waitForSelector('#demo');assert.equal(await page.locator('aside').isVisible(),false,'empty workspace hides editing tools');
  assert.equal(await page.locator('#open').isVisible(),false);
  assert.equal(await page.locator('#exportMenu').isVisible(),false);
  assert.equal(await page.locator('footer > span').count(),1,'footer only shows status');
  assert((await page.locator('#empty p').textContent()).includes('полную ссылку'));
  console.log('UI ready');
  await (await control('demo')).click();
  assert.equal(await page.locator('aside').isVisible(),true,'loaded geometry reveals editing tools');
  assert.equal(await page.locator('#exportMenu').isVisible(),true,'saving appears only with geometry');
  assert.equal(await page.locator('#undo').count(),0,'undo is keyboard-only');
  await page.locator('#tabCheck').click();
  assert.equal(await page.locator('#chainPicker').isVisible(),false,'simulation has no part picker');
  await page.locator('#tabWeights').click();
  assert.equal(await page.locator('#chainPicker').isVisible(),true);
  assert.equal(await page.locator('#part').isVisible(),false,'surface restriction is automatic');
  await page.locator('#tabBones').click();
  assert.equal(await page.locator('#advanced').getAttribute('open'),null);
  assert.equal(await page.locator('#boneAdvanced').getAttribute('open'),null);
  await (await control('boneAdvanced > summary')).click();
  await (await control('boneSelect')).selectOption('anchor');await (await control('centerBone')).click();assert.equal(await page.locator('#boneY').inputValue(),'0');
  await (await control('boneSelect')).focus();await page.keyboard.press('Control+z');assert.equal(await page.locator('#boneY').inputValue(),'1.5');
  async function createBasic(){
    const box=await page.locator('canvas[data-engine]').boundingBox();await (await control('anchor')).click();
    await page.mouse.click(box.x+box.width*.48,box.y+box.height*.32);
    assert.equal(await page.locator('#tip').evaluate(node=>node.classList.contains('selected')),true);
    await page.mouse.click(box.x+box.width*.51,box.y+box.height*.67);
    assert.equal(await page.locator('#panelBones').isVisible(),true,'creating a chain must keep the Bones tab');
    assert.equal(await page.locator('#tabBones').evaluate(node=>node.classList.contains('selected')),true);
    assert.equal(await page.locator('#simulate').isEnabled(),true,await page.locator('#status').textContent());
    assert.equal(await page.locator('#boneSelect option').count(),2,'one segment has just start and end controls');
    assert.equal(await page.locator('#segments').inputValue(),'1');
  }
  await createBasic();
  await (await control('boneAdvanced > summary')).click();await page.screenshot({path:path.join(output,'one-bone.png')});await (await control('boneAdvanced > summary')).click();
  await (await control('undo')).click();assert.equal(await page.locator('#simulate').isEnabled(),false);
  await (await control('tip')).click();const demoBox=await page.locator('canvas[data-engine]').boundingBox();await page.mouse.click(demoBox.x+demoBox.width*.51,demoBox.y+demoBox.height*.67);assert.equal(await page.locator('#simulate').isEnabled(),true);
  await (await control('all')).click();
  assert.equal(await page.locator('#simulate').isEnabled(),true);
  await (await control('simulate')).click();await page.waitForFunction(()=>document.querySelector('#simulate').textContent==='Остановить симуляцию');
  console.log('Simulation ready');
  const box=await page.locator('canvas[data-engine]').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,80);
  await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.45,{steps:20});await page.mouse.up();
  // Await simulation updates by observing frames rather than sleeping blindly.
  await page.evaluate(()=>new Promise(resolve=>{let frames=0;function next(){if(++frames===90)resolve(true);else requestAnimationFrame(next);}requestAnimationFrame(next);}));
  assert.equal(await page.locator('#simulate').textContent(),'Остановить симуляцию',await page.locator('#status').textContent());
  await page.screenshot({path:path.join(output,'simulation.png')});
  await (await control('reset')).click();assert.equal(await page.locator('#simulate').textContent(),'Включить симуляцию');await (await control('erase')).click();
  // Exercise the actual binary importer, dialogs, persistence and exporter.
  const temp=await mkdtemp(path.join(os.tmpdir(),'workshop-test-'));
  const fixture=path.join(temp,'fixture.rbxm');await copyFile(path.join(root,'tests/fixture.rbxm'),fixture);
  const raw=Buffer.alloc(25+3*40+12);raw.write('version 2.00\n');raw.writeUInt16LE(12,13);raw[15]=40;raw[16]=12;raw.writeUInt32LE(3,17);raw.writeUInt32LE(1,21);
  [[0,1,0],[-.5,-1,0],[.5,-1,0]].forEach((position,i)=>{[...position,0,0,1,0,0].forEach((n,j)=>raw.writeFloatLE(n,25+i*40+j*4));});
  [0,1,2].forEach((n,i)=>raw.writeUInt32LE(n,145+i*4));await writeFile(path.join(temp,'987.mesh'),raw);
  async function openFile(file){await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await (await control('open')).click();}
  async function saveTo(file){await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);}
  await openFile(fixture);await page.waitForFunction(()=>document.querySelector('#label').textContent.startsWith('Fixture'));
  await createBasic();
  await (await control('boneSelect')).selectOption('1');for(const [axis,value] of [['X','0'],['Y','1'],['Z','0']])await (await control('bone'+axis)).fill(value);await (await control('applyPosition')).click();
  await (await control('boneSelect')).selectOption('2');for(const [axis,value] of [['X','0'],['Y','-1'],['Z','0']])await (await control('bone'+axis)).fill(value);await (await control('applyPosition')).click();
  await (await control('segments')).fill('3');await (await control('applySegments')).click();assert.equal(await page.locator('#boneSelect option').count(),4);
  await (await control('all')).click();
  assert.equal(await page.locator('#assetId').isVisible(),false,'users never enter asset IDs');
  const saved=path.join(temp,'test.jiggle.json');await saveTo(saved);await (await control('save')).click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект сохранён:'));
  const baseline=JSON.parse(await readFile(saved,'utf8'));assert.ok(baseline.sourceBase64);
  // Open a partially painted project: edited bones must never repaint its zero rows.
  baseline.mask=[0,1,0];baseline.skinWeights=[1,0,0,0,...baseline.skinWeights.slice(4,8),1,0,0,0];
  await writeFile(saved,JSON.stringify(baseline));
  await openFile(saved);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект восстановлен.'));
  assert.equal(await page.locator('#assetId').inputValue(),'');assert.equal(await page.locator('#simulate').isEnabled(),true);
  await (await control('boneSelect')).selectOption('2');
  for(const [axis,value] of [['X','0.12'],['Y','0.25'],['Z','0.08']])await (await control('bone'+axis)).fill(value);
  await (await control('applyPosition')).click();assert.equal(await page.locator('#boneX').inputValue(),'0.12');
  await (await control('undo')).click();assert.equal(await page.locator('#boneX').inputValue(),'0');
  for(const [axis,value] of [['X','0.12'],['Y','0.25'],['Z','0.08']])await (await control('bone'+axis)).fill(value);
  await (await control('applyPosition')).click();
  const view=await page.locator('canvas[data-engine]').boundingBox();
  const camera=new THREE.PerspectiveCamera(38,view.width/view.height,.002,200);camera.position.set(2.8,1,4.8);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const screen=p=>{const v=p.clone().project(camera);return {x:view.x+(v.x+1)*view.width/2,y:view.y+(1-v.y)*view.height/2};};
  // Select an unoccluded bone by clicking its visible-through-mesh marker.
  const tipPoint=screen(new THREE.Vector3(0,-1,0));await rendered();await page.mouse.click(tipPoint.x,tipPoint.y);assert.equal(await page.locator('#boneSelect').inputValue(),'4');
  await (await control('boneSelect')).selectOption('2');await rendered();
  // Drag actual TransformControls arrows on all axes, not synthetic handlers.
  const p=new THREE.Vector3(.12,.25,.08),factor=p.distanceTo(camera.position)*1.9*Math.tan(38*Math.PI/360)*.8/4;
  for(const [axisIndex,axis] of ['X','Y','Z'].entries()){
    const direction=new THREE.Vector3().setComponent(axisIndex,1);
    const arrow=screen(p.clone().addScaledVector(direction,factor*.45)),end=screen(p.clone().addScaledVector(direction,factor*.45+.2));
    await rendered();await page.mouse.move(arrow.x,arrow.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up();
    for(const [i,name] of ['X','Y','Z'].entries())assert(Math.abs(Number(await page.locator('#bone'+name).inputValue())-(p.getComponent(i)+(i===axisIndex?.2:0)))<(i===axisIndex?.015:1e-5),axis+' arrow should move only '+axis);
    await (await control('undo')).click();assert.equal(await page.locator('#boneX').inputValue(),'0.12');
  }
  // Place away from the model silhouette; a surface raycast would miss here.
  await (await control('place')).click();await page.mouse.click(view.x+view.width*.18,view.y+view.height*.3);
  assert(Math.abs(Number(await page.locator('#boneX').inputValue()))>1,'plane placement must work outside mesh');
  await (await control('undo')).click();assert.equal(await page.locator('#boneX').inputValue(),'0.12');
  await (await control('centerBone')).click();assert.equal(await page.locator('#boneY').inputValue(),'0');
  const edited=path.join(temp,'edited.jiggle.json');await saveTo(edited);await (await control('save')).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект сохранён:'));
  const persisted=JSON.parse(await readFile(edited,'utf8'));assert.deepEqual(persisted.bones[2].position,[0,0,0]);assert.deepEqual(persisted.mask,baseline.mask);assert.deepEqual(persisted.skinIndices,baseline.skinIndices);assert.deepEqual(persisted.skinWeights,baseline.skinWeights);assert.deepEqual(persisted.geometry,baseline.geometry);
  await (await control('anchor')).click();await page.mouse.click(...Object.values(screen(new THREE.Vector3(.1,.7,0))));
  await saveTo(edited);await (await control('save')).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект сохранён:'));
  const endpointEdited=JSON.parse(await readFile(edited,'utf8'));assert.notDeepEqual(endpointEdited.bones,persisted.bones);assert.deepEqual(endpointEdited.skinWeights,persisted.skinWeights);assert.deepEqual(endpointEdited.skinIndices,persisted.skinIndices);assert.deepEqual(endpointEdited.mask,persisted.mask);
  await (await control('undo')).click();await saveTo(edited);await (await control('save')).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект сохранён:'));
  assert.deepEqual(JSON.parse(await readFile(edited,'utf8')).bones,persisted.bones);
  await openFile(edited);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект восстановлен.'));
  await (await control('boneSelect')).selectOption('2');assert.equal(await page.locator('#boneY').inputValue(),'0');
  await (await control('simulate')).click();await page.waitForFunction(()=>document.querySelector('#simulate').textContent==='Остановить симуляцию');await rendered();await (await control('simulate')).click();
  const inspect=()=>page.evaluate(()=>window.workshopInspect());
  const screenPosition=(state,position)=>{const v=new THREE.Vector3().fromArray(position).applyMatrix4(new THREE.Matrix4().fromArray(state.cameraWorld).invert()).applyMatrix4(new THREE.Matrix4().fromArray(state.cameraProjection));return {x:view.x+(v.x+1)*view.width/2,y:view.y+(1-v.y)*view.height/2};};
  const assertRestState=(state,expected=persisted)=>{
    assert.equal(state.running,false);assert.deepEqual(state.motion,[0,0,0]);assert.equal(state.yaw,0);
    assert.deepEqual(JSON.parse(JSON.stringify(state.project.bones)),JSON.parse(JSON.stringify(expected.bones)));assert.deepEqual(state.project.skinIndices,expected.skinIndices);assert.deepEqual(state.project.skinWeights,expected.skinWeights);assert.deepEqual(state.project.mask,expected.mask);
    const world=new THREE.Matrix4().fromArray(state.meshWorld);
    state.worldBones.forEach((p,i)=>assert(new THREE.Vector3().fromArray(p).distanceTo(new THREE.Vector3().fromArray(expected.bones[i].position).applyMatrix4(world))<1e-5,'reset must restore every mesh-local bone'));
    state.worldVertices.forEach((p,i)=>assert(new THREE.Vector3().fromArray(p).distanceTo(new THREE.Vector3().fromArray(expected.geometry.positions,i*3).applyMatrix4(world))<1e-5,'reset must restore every rest vertex'));
    state.markerPositions.forEach((p,i)=>assert(new THREE.Vector3().fromArray(p).distanceTo(new THREE.Vector3().fromArray(state.worldBones[i+1]))<1e-5,'visible marker must follow actual bone'));
  };
  for(const behind of [false,true]){
    if(behind){
      await page.mouse.move(view.x+view.width*.25,view.y+view.height*.5);await page.mouse.down({button:'right'});await page.mouse.move(view.x+view.width*.25+view.height*.5,view.y+view.height*.5,{steps:20});await page.mouse.up({button:'right'});
      await page.evaluate(()=>new Promise(resolve=>{let frames=0;function next(){if(++frames===150)resolve();else requestAnimationFrame(next);}requestAnimationFrame(next);}));
    }
    for(const [dx,dy] of [[-90,35],[90,-35]]){
      await (await control('simulate')).click();await page.waitForFunction(()=>document.querySelector('#simulate').textContent==='Остановить симуляцию');await rendered();
      const before=await inspect(),start=screenPosition(before,before.worldVertices[0]);
      await page.mouse.move(view.x+view.width*.5,view.y+view.height*.5);await page.mouse.down();await page.mouse.move(view.x+view.width*.5+dx,view.y+view.height*.5+dy,{steps:12});await page.mouse.up();await rendered();
      const after=await inspect(),end=screenPosition(after,after.worldVertices[0]);
      assert((end.x-start.x)*dx>1000,'mesh must follow horizontal mouse direction with '+(behind?'rear':'front')+' camera');
      assert((end.y-start.y)*dy>200,'mesh must follow vertical mouse direction');
      await page.mouse.wheel(0,90);await rendered();
      await (await control('reset')).click();await rendered();assertRestState(await inspect());
      // Extra frames catch a pending async solver result overwriting reset.
      await page.evaluate(()=>new Promise(resolve=>{let frames=0;function next(){if(++frames===12)resolve();else requestAnimationFrame(next);}requestAnimationFrame(next);}));
      assertRestState(await inspect());
    }
  }
  console.log('PASS mesh follows screen drag from both camera sides; repeated reset stops physics and preserves all actual rest vertices/bones/markers/weights.');
  // Delete a selected middle node, retain survivor rest frames and undo exactly.
  await (await control('boneSelect')).selectOption('2');await (await control('boneSelect')).focus();await page.keyboard.press('Delete');await rendered();
  const deleted=await inspect();assert.equal(deleted.project.bones.length,4);assert.deepEqual(deleted.project.bones.map(b=>b.position),persisted.bones.filter((_,i)=>i!==2).map(b=>b.position));assert.deepEqual(deleted.project.skinWeights,persisted.skinWeights);assert.deepEqual(deleted.project.mask,persisted.mask);
  await page.keyboard.press('Control+z');await rendered();assertRestState(await inspect());
  // The visible segment itself can be clicked, not only its endpoint sphere.
  const lineState=await inspect(),linePoint=new THREE.Vector3().fromArray(persisted.bones[1].position).lerp(new THREE.Vector3().fromArray(persisted.bones[2].position),.2).applyMatrix4(new THREE.Matrix4().fromArray(lineState.meshWorld));
  await (await control('boneSelect')).selectOption('4');await rendered();const lineScreen=screenPosition(await inspect(),linePoint.toArray());await page.mouse.click(lineScreen.x,lineScreen.y);assert.equal(await page.locator('#boneSelect').inputValue(),'2');
  // Deleting the sole segment keeps paint, is undoable and persists as a draft.
  await (await control('segments')).fill('1');await (await control('applySegments')).click();await (await control('boneSelect')).selectOption('2');
  const oneBefore=await inspect();await (await control('deleteBone')).click();await rendered();const empty=await inspect();assert.equal(empty.project.bones.length,0);assert.deepEqual(empty.project.mask,persisted.mask);assert.equal(await page.locator('#simulate').isEnabled(),false);assert.equal(await page.locator('#saveMesh').isEnabled(),false);
  const draft=path.join(temp,'deleted-bone-draft.jiggle.json');await saveTo(draft);await (await control('save')).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект сохранён:'));
  const savedDraft=JSON.parse(await readFile(draft,'utf8'));assert.deepEqual(savedDraft.bones,[]);assert.deepEqual(savedDraft.mask,persisted.mask);assert.deepEqual(savedDraft.skinWeights,[]);
  await (await control('undo')).click();await rendered();assert.deepEqual((await inspect()).project.bones,oneBefore.project.bones);assert.deepEqual((await inspect()).project.skinWeights,oneBefore.project.skinWeights);
  await openFile(draft);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект восстановлен.'));assert.equal(await page.locator('#simulate').isEnabled(),false);assert.deepEqual((await inspect()).project.mask,persisted.mask);
  await createBasic();assert.deepEqual((await inspect()).project.mask,persisted.mask);
  await openFile(edited);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект восстановлен.'));await rendered();assertRestState(await inspect());
  console.log('PASS Delete middle node/one bone, button deletion, exact undo, painted draft save/reopen and new bone creation without losing paint.');
  const legacy=structuredClone(persisted);delete legacy.owners;delete legacy.partNames;delete legacy.activeChain;
  const legacyFile=path.join(temp,'legacy-one-chain.jiggle.json');await writeFile(legacyFile,JSON.stringify(legacy));await openFile(legacyFile);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект восстановлен.'));await rendered();assertRestState(await inspect());
  const migrated=(await inspect()).project;assert.equal(migrated.owners[1],'JiggleRoot');assert.deepEqual(migrated.skinWeights,legacy.skinWeights);assert.deepEqual(migrated.skinIndices,legacy.skinIndices);
  await saveTo(legacyFile);await (await control('save')).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект сохранён:'));assert.deepEqual(JSON.parse(await readFile(legacyFile,'utf8')).skinWeights,legacy.skinWeights);
  console.log('PASS legacy project migration preserves exact rest and skin rows.');
  // Edit a bone after moving/yawing an off-centre mesh, then reset and restart.
  const offsetProject=structuredClone(persisted),offset=[2.4,-1.7,.8];offsetProject.name='Offset rest edit';
  offsetProject.geometry.positions=offsetProject.geometry.positions.map((n,i)=>n+offset[i%3]);
  offsetProject.bones.slice(1).forEach(b=>b.position=b.position.map((n,i)=>n+offset[i]));
  for(const key of ['anchor','tip'])offsetProject[key]=offsetProject[key].map((n,i)=>n+offset[i]);
  const offsetFile=path.join(temp,'offset.jiggle.json');await writeFile(offsetFile,JSON.stringify(offsetProject));await openFile(offsetFile);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект восстановлен.'));
  await (await control('simulate')).click();await page.waitForFunction(()=>document.querySelector('#simulate').textContent==='Остановить симуляцию');
  await page.mouse.move(view.x+view.width*.5,view.y+view.height*.5);await page.mouse.down();await page.mouse.move(view.x+view.width*.6,view.y+view.height*.55,{steps:15});await page.mouse.up();await page.mouse.wheel(0,100);await rendered();
  await (await control('boneSelect')).selectOption('2');await (await control('boneX')).fill('2.56');await (await control('applyPosition')).click();await rendered();
  const offsetEdited=await inspect();assert.equal(offsetEdited.project.bones[2].position[0],2.56);assert.deepEqual(offsetEdited.project.mask,persisted.mask);assert.deepEqual(offsetEdited.project.skinIndices,persisted.skinIndices);assert.deepEqual(offsetEdited.project.skinWeights,persisted.skinWeights);
  const offsetWorld=new THREE.Matrix4().fromArray(offsetEdited.meshWorld);
  offsetEdited.worldVertices.forEach((p,i)=>assert(new THREE.Vector3().fromArray(p).distanceTo(new THREE.Vector3().fromArray(offsetProject.geometry.positions,i*3).applyMatrix4(offsetWorld))<1e-5,'rest edit after a moved/yawed mesh must not deform its geometry'));
  await (await control('simulate')).click();await page.waitForFunction(()=>document.querySelector('#simulate').textContent==='Остановить симуляцию');await rendered();
  const restarted=await inspect(),restartWorld=new THREE.Matrix4().fromArray(restarted.meshWorld);
  assert(new THREE.Vector3().fromArray(restarted.worldBones[1]).distanceTo(new THREE.Vector3().fromArray(offsetEdited.project.bones[1].position).applyMatrix4(restartWorld))<1e-5,'restarted anchor must follow a moved mesh');
  await (await control('reset')).click();await rendered();assertRestState(await inspect(),offsetEdited.project);
  await saveTo(offsetFile);await (await control('save')).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект сохранён:'));
  await openFile(offsetFile);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект восстановлен.'));await rendered();assertRestState(await inspect(),offsetEdited.project);
  await openFile(edited);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект восстановлен.'));await rendered();assertRestState(await inspect());
  console.log('PASS edit after moved/yawed off-centre mesh, SmartBone restart, reset and project reload preserve mesh-local rest and exact painted weights.');

  await page.screenshot({path:path.join(output,'editor.png')});
  const zip=path.join(temp,'export.zip');await saveTo(zip);await page.locator('#exportMenu').click();
  assert.equal(await page.locator('#exportDialog').evaluate(node=>node.open),false,'saving opens the file picker, not an ID form');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Готовый jiggle-предмет сохранён:'));
  assert.equal((await readFile(zip)).subarray(0,2).toString(),'PK');
  await (await control('reference')).fill('https://evil.example/catalog/123');await (await control('download')).click();
  try{await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));}
  catch(error){console.log('Remote import status:',await page.locator('#status').textContent());throw error;}
  assert.match(await page.locator('#status').textContent(),/Нужна ссылка Nyawing\/Roblox/);
  assert.match(await page.locator('#label').textContent(),/^Fixture/);assert.equal(await page.locator('#download').isEnabled(),true);
  if(process.env.WORKSHOP_LIVE_REFERENCE){
    await (await control('reference')).fill(process.env.WORKSHOP_LIVE_REFERENCE);await (await control('download')).click();
    await page.waitForFunction(()=>document.querySelector('#download').textContent==='Загрузить'&&!document.querySelector('#status').textContent.startsWith('Скачиваю'));
    assert.equal(await page.locator('#status').evaluate(node=>node.classList.contains('error')),false,await page.locator('#status').textContent());
    assert.doesNotMatch(await page.locator('#label').textContent(),/^Fixture/);
    await createBasic();
    const liveProject=path.join(output,'live-175567.jiggle.json');await saveTo(liveProject);await (await control('save')).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект сохранён:'));
    const live=JSON.parse(await readFile(liveProject,'utf8'));assert(live.geometry.positions.length>=9);assert(live.sourceBase64);assert(live.texture?.startsWith('data:image/'));assert(live.mask.every(n=>n===0));assert.equal(live.bones.length,3);
    if(process.env.WORKSHOP_LIVE_REFERENCE.includes('16451438708'))assert.equal(live.geometry.indices.length/3,1090,'White Cat Tail must use LOD0 only');
    if(await page.locator('#boneAdvanced').getAttribute('open')!==null)await (await control('boneAdvanced > summary')).click();if(await page.locator('#advanced').getAttribute('open')!==null)await (await control('advanced > summary')).click();await page.locator('aside').evaluate(node=>node.scrollTop=0);await page.screenshot({path:path.join(output,'live-175567.png')});
    console.log('PASS live reference: actual accessory, texture, LOD0 geometry, chain and editable project.');
  }
  // Use two nearby disconnected strips so a spherical brush would hit both.
  const brushProject=structuredClone(persisted);brushProject.name='Brush isolation';brushProject.itemType='hair';
  brushProject.geometry={positions:[-.4,-1,0,-.05,-1,0,-.05,1,0,-.4,1,0, 0,-1,0,.35,-1,0,.35,1,0,0,1,0],normals:Array(8).fill([0,0,1]).flat(),uv:Array(16).fill(0),indices:[0,1,2,0,2,3,4,5,6,4,6,7],rigged:false};
  brushProject.owners=Array(8).fill('');brushProject.mask=Array(8).fill(0);brushProject.skinIndices=Array(32).fill(0);brushProject.skinWeights=Array.from({length:32},(_,i)=>i%4===0?1:0);
  const brushFile=path.join(temp,'brush.jiggle.json');await writeFile(brushFile,JSON.stringify(brushProject));await openFile(brushFile);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект восстановлен.'));
  await (await control('paint')).click();await (await control('radius')).fill('90');await rendered();
  const brushView=await page.locator('canvas[data-engine]').boundingBox();
  const brushCamera=new THREE.PerspectiveCamera(38,brushView.width/brushView.height,.002,200);brushCamera.position.set(2.775,1,4.8);brushCamera.lookAt(-.025,0,0);brushCamera.updateMatrixWorld(true);
  await page.mouse.move(brushView.x+brushView.width/2,brushView.y+brushView.height/2);await page.mouse.wheel(0,80);await rendered();
  const brushScreen=p=>{const v=p.clone().add(new THREE.Vector3(.025,0,0)).applyAxisAngle(new THREE.Vector3(0,1,0),.32).add(new THREE.Vector3(-.025,0,0)).project(brushCamera);return {x:brushView.x+(v.x+1)*brushView.width/2,y:brushView.y+(1-v.y)*brushView.height/2};};
  const first=brushScreen(new THREE.Vector3(-.1,.9,0)),second=brushScreen(new THREE.Vector3(.1,.9,0));
  await page.locator('#surfaceSelect').click();await page.mouse.click(first.x,first.y);await page.locator('#paint').click();
  await page.mouse.move(first.x,first.y);await page.mouse.down();await page.mouse.move(second.x,second.y,{steps:10});await page.mouse.up();
  const paintSaved=path.join(temp,'painted.jiggle.json');await saveTo(paintSaved);await (await control('save')).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект сохранён:'));
  const painted=JSON.parse(await readFile(paintSaved,'utf8'));assert(painted.mask.slice(0,4).some(n=>n>0));assert(painted.mask.slice(4).every(n=>n===0),'stroke must not jump to the cap');
  assert.deepEqual(painted.skinWeights.slice(16),brushProject.skinWeights.slice(16));
  await (await control('radius')).focus();await page.evaluate(()=>document.querySelector('#radius').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',key:'я',ctrlKey:true,bubbles:true,cancelable:true})));
  await saveTo(paintSaved);await (await control('save')).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Проект сохранён:'));
  assert(JSON.parse(await readFile(paintSaved,'utf8')).mask.every(n=>n===0),'Ctrl+Z on a slider with Cyrillic layout must undo the whole stroke');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS invisible Electron UI: bone click/XYZ/XYZ gizmo/center/plane/undo, exact rest and weights persistence, edited SmartBone, binary import, zero-weight mesh and RBXM ZIP export; screenshots in '+output);
}finally{await app.close();}
