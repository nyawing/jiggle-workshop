import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {LuauState} from 'luau-web';
import source from './generated/simulation.lua?raw';
import {TryOn} from './try-on';
import {createChain,appendChain,chainPaths,copyBones,moveRestBone,deleteRestBone,makeSkinned,rebindRest,skinForBones,type SkinData,type GeometryData,type BoneData} from './model';
import {surfaceGraph,type SurfaceGraph} from './brush';
import './style.css';
import {linearGradient} from './weight-gradient';
import {WeightStroke} from './weight-stroke';
import {WeightProjection} from './weight-projection';
import {weightDisplayMaterial} from './weight-display';
import {automaticWeights,insertRestPoint,mirrorChain} from './model';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<header><strong>Jiggle Workshop</strong><form id="remote"><input id="reference" aria-label="Ссылка или ID предмета" placeholder="Ссылка на предмет или ID" maxlength="2048" required><button id="download" type="submit">Загрузить</button></form><button id="open">Открыть файл</button><button id="save">Сохранить проект</button><button id="exportMenu">Экспорт</button></header>
<main><section id="stage"><div id="empty"><h1>Откройте аксессуар</h1><p>Ссылка / ID сверху или файл RBXM, RBXMX, .jiggle.json.</p><button id="demo">Учебный пример</button></div><div id="brushCursor"></div><div id="label">Ничего не загружено</div><div id="hint">Правая кнопка — камера · колёсико — вращение предмета</div></section>
<aside><nav class="tabs"><button id="tabBones">Кости</button><button id="tabWeights">Веса</button><button id="tabCheck">Проверка</button></nav>
<label id="chainPicker">Часть предмета<select id="chainSelect"><option value="">Новая часть</option></select></label>
<section id="panelBones"><button id="chain" class="wide">Добавить кость: начало → конец</button><p class="help">Два клика — одна кость для отдельной части.</p><div class="pair"><button id="selectBone">Выбрать / двигать</button><button id="deleteBone" disabled>Удалить (Delete)</button></div>
<details id="boneAdvanced"><summary>Точки и дополнительные звенья</summary><label>Название части<input id="chainName" maxlength="60" placeholder="Например, левый колокольчик"></label><div class="pair"><button id="anchor">Начало</button><button id="tip">Конец</button></div><label>Точка / кость<select id="boneSelect"><option value="anchor">Крепление</option><option value="tip">Конец</option></select></label><div class="coordinates"><label>X<input id="boneX" type="number" step="0.01"></label><label>Y<input id="boneY" type="number" step="0.01"></label><label>Z<input id="boneZ" type="number" step="0.01"></label></div><div class="pair"><button id="applyPosition">Применить XYZ</button><button id="centerBone">В центр меша</button></div><button id="place" class="wide">Поставить в плоскости вида</button><p class="help">Стрелки / XYZ — оси предмета. Клик в плоскости вида сохраняет глубину точки.</p><label>Число звеньев<input id="segments" type="number" min="1" max="24" step="1" value="1"></label><button id="applySegments" class="wide">Применить число звеньев</button></details></section>
<section id="panelWeights" hidden><div class="pair"><button id="paint" class="selected">Кисть</button><button id="erase">Стереть</button></div><label>Вес <output id="weightValue">100%</output><input id="weight" type="range" min="0" max="100" value="100"></label><label>Размер кисти<input id="radius" type="range" min="8" max="90" value="28"></label><p class="help">Кисть задаёт вес выбранной части. 100% — сильное движение, 20% — слабое, 0% — неподвижно. Контрастный вид: красный — сильный вес, синий — неподвижно; фиолетовый — другие цепочки.</p><details id="brushAdvanced"><summary>Ограничение кисти</summary><div class="pair"><button id="part">Выбрать поверхность</button><button id="unlockPart">Все поверхности</button></div><p id="partHint" class="help">Мазок остаётся на поверхности, где начат.</p><button id="all" class="wide">Привязать весь меш к этой части</button></details></section>
<section id="panelCheck" hidden><button id="simulate" class="wide" disabled>Включить симуляцию</button><button id="reset" class="wide">Сбросить положение</button><p class="help">Тяни предмет левой кнопкой. Сброс сохраняет кости и веса.</p><details id="physicsAdvanced" hidden><summary>Параметры движения</summary><label>Характер<select id="preset"><option value="hair">Волосы</option><option value="ears">Уши</option><option value="tail">Хвост</option><option value="pendant">Подвеска</option></select></label><label>Мягкость <output id="softValue">60%</output><input id="soft" type="range" min="0" max="100" value="60"></label><label>Затухание <output id="dampValue">18%</output><input id="damp" type="range" min="0" max="100" value="18"></label><label>Предел изгиба <output id="bendLimitValue">180°</output><input id="bendLimit" type="range" min="0" max="180" value="180"></label></details></section><button id="undo" class="wide">Отменить · Ctrl+Z</button></aside>
<dialog id="exportDialog"><div class="dialogTitle"><strong>Экспорт</strong><button id="closeExport">Закрыть</button></div><button id="saveMesh" class="wide">Сохранить .mesh</button><details id="advanced"><summary>Экспорт аксессуара RBXM</summary><p class="help">Загрузите сохранённый .mesh как ассет и укажите новый ID.</p><label>ID нового меша<input id="assetId" placeholder="После загрузки .mesh" inputmode="numeric"></label><button id="export" class="wide">Экспорт RBXM + mesh</button></details></dialog></main><footer><span id="status">Откройте аксессуар или учебный пример.</span><span>0.5.3 · V1 синхронный</span></footer>`;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
window.workshop?.onImportStatus?.(message=>status(message));
const workspace=document.querySelector('main')!;
const sidebar=document.querySelector('aside')!;
function showWorkspace(loaded:boolean){sidebar.hidden=!loaded;el('exportMenu').hidden=!loaded;workspace.classList.toggle('empty-workspace',!loaded);}
showWorkspace(false);
const fileActions=document.createElement('div');fileActions.className='file-actions';
el('save').hidden=true;
el<HTMLInputElement>('reference').placeholder='Полная ссылка на предмет Roblox или Nyawing';
el('reference').setAttribute('aria-label','Полная ссылка на предмет Roblox или Nyawing');
el('exportMenu').textContent='Сохранить';
el('open').hidden=true;
for(const id of ['open','exportMenu'])fileActions.append(el(id));
document.querySelector('header')!.append(fileActions);
fileActions.style.borderLeft='0';fileActions.style.paddingLeft='0';
el('saveMesh').hidden=true;el('advanced').hidden=true;
document.querySelector('#empty h1')!.textContent='Загрузите аксессуар';
document.querySelector('#empty p')!.textContent='Вставьте полную ссылку на предмет Roblox или Nyawing в поле сверху и нажмите «Загрузить».';
// Keep everyday editing compact; precise positioning remains available on demand.
el('undo').remove();
el('brushAdvanced').querySelector('summary')!.textContent='Дополнительно';
el('part').parentElement!.hidden=true;
el('partHint').hidden=true;
el('boneAdvanced').querySelector('summary')!.textContent='Настройка кости';
const preciseTools=document.createElement('details');
preciseTools.id='preciseTools';
preciseTools.innerHTML='<summary>Точное положение и звенья</summary>';
const boneDetails=el('boneAdvanced');
const coordinateTools=boneDetails.querySelector('.coordinates')!;
while(coordinateTools.nextSibling)preciseTools.append(coordinateTools.nextSibling);
preciseTools.prepend(coordinateTools);
// The summary must precede the controls for native details keyboard behaviour.
preciseTools.prepend(preciseTools.querySelector('summary')!);
boneDetails.append(preciseTools);
boneDetails.hidden=true;
const pointTools=document.createElement('div');
pointTools.innerHTML='<button id="surfacePlace" class="wide">Точка по поверхности (G)</button><div class="pair"><select id="mirrorAxis" aria-label="Ось отражения"><option value="0">Зеркало X</option><option value="1">Зеркало Y</option><option value="2">Зеркало Z</option></select><button id="mirrorChain">Копировать цепочку</button></div><p class="help">G: точка следует за курсором по поверхности. Клик — применить, Esc — отменить. Зеркало проходит через центр меша; веса копии назначаются отдельно.</p>';
boneDetails.before(pointTools);
const weightView=document.createElement('label');
weightView.className='weight-view';
weightView.innerHTML='<span><input id="weightHeatmap" type="checkbox" checked> Контрастные веса</span><span class="help">Синий — неподвижно · Голубой → жёлтый → красный — сила веса. Другие цепочки — фиолетовые.</span>';
el('chainPicker').before(weightView);
const brushOptions=document.createElement('div');
brushOptions.className='brush-options';
brushOptions.innerHTML='<label>Сила<input id="brushStrength" type="range" min="0" max="100" value="100"></label><label>Жёсткость<input id="brushHardness" type="range" min="0" max="100" value="65"></label><label class="toggle"><input id="throughBrush" type="checkbox"> Насквозь</label><div class="pair"><button id="surfaceSelect">Выделить</button><button id="smoothWeights">Сгладить</button></div><div id="surfaceActions"><span id="selectionCount">Выделено: 0</span><label class="toggle"><input id="isolateWeights" type="checkbox"> Изолировать</label><div class="pair"><button id="fillSelection">Задать вес</button><button id="zeroSelection">Обнулить</button></div></div><details><summary>Действия</summary><button id="reassignSelection" class="wide">Переназначить выделение</button><button id="clearSelection" class="wide">Снять выделение</button><button id="clearWeights" class="wide">Очистить все веса</button></details><label class="toggle"><input id="allWeightOverview" type="checkbox"> Все назначения</label><div id="weightLegend"><span>0%</span><i></i><span>100%</span></div>' ;
el('panelWeights').append(brushOptions);
const fittingUi=document.createElement('div');fittingUi.id='fittingControls';
fittingUi.innerHTML=`<label class="toggle"><input id="tryOn" type="checkbox">Примерить на персонажа</label>
<div id="fittingOptions" hidden><label>Крепление<select id="fittingSlot"><option value="hat">Шляпа</option><option value="hair">Волосы</option><option value="face">Лицо</option><option value="neck">Шея</option><option value="back">Спина / плащ</option><option value="front">Грудь</option><option value="shoulder">Плечо</option><option value="waist">Пояс</option></select></label>
<p>Кликни по сцене: WASD — ходьба, пробел — прыжок. Правая кнопка — камера.</p>
<button id="fittingHome" class="wide">Вернуть персонажа на старт</button>
<button id="fittingShiftLock" class="wide">Shift Lock · Shift</button><p>Shift — камера за плечом; Esc — освободить мышь. Удерживай пробел для повторных прыжков.</p>
<details><summary>Смещение примерки</summary><p>Только для просмотра, не меняет крепление предмета.</p>
${['X','Y','Z'].map(axis=>`<label>${axis}<input id="fitting${axis}" type="number" min="-20" max="20" step="0.05" value="0"></label>`).join('')}</details></div>`;
el('simulate').after(fittingUi);
const solverLabel=document.createElement('label');solverLabel.hidden=true;solverLabel.innerHTML='Физика<select id="physicsSolver"><option value="v1-sync">V1 · синхронизация (как в игре)</option><option value="legacy">V1 · без синхронизации</option><option value="v2-sync" hidden>Архивный проект V2</option></select>';fittingUi.before(solverLabel);
const solverNote=document.createElement('p');solverNote.id='solverNote';solverNote.style.display='none';solverNote.textContent='V2: примерка и сохранение проекта. Экспорт этой физики — после обновления игрового runtime.';solverLabel.after(solverNote);

const windUi=document.createElement('label');windUi.innerHTML='<input id="softWind" type="checkbox"> Лёгкий ветер';el('physicsAdvanced').before(windUi);windUi.hidden=true;
const ribbonUi=document.createElement('div');ribbonUi.innerHTML='<label><input id="ribbonWind" type="checkbox">Волна ветра</label><label>Направление волны<select id="ribbonDirection"><option value="mixed">Плавная волна</option><option value="horizontal">Влево — вправо</option><option value="vertical">Вверх — вниз</option><option value="depth">Вперёд — назад</option></select></label>';el('boneAdvanced').before(ribbonUi);
const capeUi=document.createElement('div');capeUi.innerHTML='<label>Изгиб цепочек<select id="motionMode"><option value="standard">Исходная форма</option><option value="cape">Плавный изгиб — ткань</option></select></label><label><input id="useGravity" type="checkbox" checked>Гравитация</label>';el('boneAdvanced').before(capeUi);capeUi.querySelector('input')!.parentElement!.hidden=true;const motionHelp=document.createElement('p');motionHelp.className='help';motionHelp.textContent='Исходная форма: звенья возвращаются к заданному направлению. Ткань: нижние звенья наследуют изгиб предыдущих, образуя плавную дугу. Режим действует на цепочки всего предмета.';capeUi.append(motionHelp);
let ribbonBones:Record<string,string>|null={};
let legacyWave:string|null=null;
function motionExtras(){return {ribbonBones:ribbonBones===null?undefined:Object.fromEntries(Object.entries(ribbonBones).filter(([name])=>bones.some(b=>b.name===name))),motionMode:el<HTMLSelectElement>('motionMode').value,useGravity:el<HTMLInputElement>('useGravity').checked,ribbonWind:ribbonBones===null&&legacyWave!==null,ribbonDirection:legacyWave??'mixed'};}
function restoreMotionExtras(s:any){legacyWave=s?.ribbonWind===true?(s.ribbonDirection??'mixed'):null;ribbonBones=s?.ribbonBones&&typeof s.ribbonBones==='object'?{...s.ribbonBones}:s?.ribbonWind===true?null:{};el<HTMLSelectElement>('motionMode').value=s?.motionMode==='cape'?'cape':'standard';el<HTMLInputElement>('useGravity').checked=s?.useGravity!==false;el<HTMLInputElement>('ribbonWind').checked=s?.ribbonWind===true;el<HTMLSelectElement>('ribbonDirection').value=['horizontal','vertical','depth'].includes(s?.ribbonDirection)?s.ribbonDirection:'mixed';}
const motionFields=[['inertia','Inertia · игнорирование движения',0,1,.01,0],['elasticity','Elasticity · возврат к исходной форме',0,1,.01,.5],['windInfluence','Влияние ветра',0,1,.01,0],['windStrength','Плотность ветра',0,10,.1,1],['windSpeed','Скорость ветра',0,30,.1,8],['windAngle','Направление ветра, °',-180,180,5,0]] as const;
for(const [id,title,min,max,step,value]of motionFields){const label=document.createElement('label');label.innerHTML=`${title}<input id="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${value}">`;el('physicsAdvanced').append(label);}

brushOptions.querySelector('details')!.id='weightActions';
const weightSettings=document.createElement('div');weightSettings.className='weight-settings';
for(const id of ['weight','radius','brushStrength','brushHardness'])weightSettings.append(el(id).parentElement!);
brushOptions.before(weightSettings);el('paint').parentElement!.append(el('smoothWeights'));el('paint').parentElement!.classList.add('weight-tools');
el('weightActions').append(el('all'));el('brushAdvanced').hidden=true;
// Compact controls: shortcuts live on the action itself, not in a help panel.
for(const [id,label] of [['chain','Новая цепочка · Ctrl+Q'],['mirrorChain','Отразить · Ctrl+D'],['paint','Кисть · V'],['erase','Ластик · E'],['selectBone','Выбрать · Q']])el(id).textContent=label;
document.querySelectorAll<HTMLElement>('aside .help').forEach(node=>node.hidden=true);
el('part').parentElement!.hidden=true;
el('hint').hidden=true;
const vertexPreview=document.createElement('label');vertexPreview.className='toggle';vertexPreview.innerHTML='<input id="previewVertices" type="checkbox"> Показать вершины';el('weightActions').append(vertexPreview);

const gradientButton=document.createElement('button');gradientButton.id='gradient';gradientButton.textContent='Градиент · Ctrl+W';el('surfaceSelect').parentElement!.append(gradientButton);
el('surfaceSelect').parentElement!.after(el('clearSelection'));el('clearSelection').textContent='Снять выделение';
const gradientStartLabel=document.createElement('label');gradientStartLabel.hidden=true;gradientStartLabel.innerHTML='Начальный вес<output id="gradientFromValue">0%</output><input id="gradientFrom" type="range" min="0" max="100" value="0">';weightSettings.append(gradientStartLabel);
const weightMaterial=weightDisplayMaterial();
let heatmapPreference=false;
el<HTMLInputElement>('weightHeatmap').checked=false;
el<HTMLInputElement>('weightHeatmap').onchange=()=>{heatmapPreference=el<HTMLInputElement>('weightHeatmap').checked;colors();};
const stage=el('stage');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;stage.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#242424');scene.fog=new THREE.Fog('#242424',18,45);
const camera=new THREE.PerspectiveCamera(38,1,.01,1000);camera.position.set(6,4,9);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enableZoom=false;controls.enablePan=false;controls.mouseButtons={LEFT:undefined as any,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};
controls.zoomToCursor=true;
el('hint').textContent='Ctrl + колёсико — приближение к курсору · Колёсико — вращение предмета · Правая кнопка — камера';
// OrbitControls receives wheel events before the editor's rotation handler.
// Capture sets the mode per event, so releasing Ctrl cannot leave zoom enabled.
renderer.domElement.addEventListener('wheel',event=>{
  controls.enableZoom=event.ctrlKey&&!!geometry&&!dragging&&!transform.dragging;
  if(event.ctrlKey)event.preventDefault();
},{capture:true,passive:false});
scene.add(new THREE.HemisphereLight(0xe2edff,0x314355,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(5,8,6);scene.add(light);
const body=new THREE.Group();scene.add(body);
const fitting=new TryOn(scene);
let fittingBackup:{motion:THREE.Vector3;yaw:number;camera:THREE.Vector3;target:THREE.Vector3;near:number;far:number;min:number;max:number}|null=null;
renderer.domElement.tabIndex=0;
const transform=new TransformControls(camera,renderer.domElement);transform.setMode('translate');transform.setSpace('local');transform.setSize(.8);scene.add(transform.getHelper());
// Draw selectable points above the translation axes, not underneath them.
transform.getHelper().traverse(node=>{if(node instanceof THREE.Mesh||node instanceof THREE.Line)node.renderOrder=4;});
const boneProxy=new THREE.Object3D(),boneMarkers=new THREE.Group();scene.add(boneMarkers);
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
const surfaceGhost=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),new THREE.MeshBasicMaterial({color:0xff6bac,depthTest:false}));
surfaceGhost.renderOrder=9;surfaceGhost.visible=false;scene.add(surfaceGhost);
let dragPlane:THREE.Plane|null=null,dragPoint:THREE.Vector3|null=null;
let geometry:GeometryData|null=null,mask:Float32Array=new Float32Array(),mesh:THREE.SkinnedMesh|null=null,helper:THREE.LineSegments|null=null;
let bones:BoneData[]=[],anchor=new THREE.Vector3(),tip=new THREE.Vector3(),center=new THREE.Vector3(),size=new THREE.Vector3(1,1,1),motion=new THREE.Vector3();
let projection:WeightProjection|null=null,weightStroke:WeightStroke|null=null,lastDab:{x:number;y:number}|null=null;
let pendingHover:PointerEvent|null=null;const pendingBrush:PointerEvent[]=[];const frameTouched=new Set<number>();
let strokeOperation='';let surfaceSelection=new Set<number>(),smoothSelected=false;let selectionDots:THREE.Points|null=null;
const hoverCanvas=document.createElement('canvas');hoverCanvas.className='weight-hover';el('stage').append(hoverCanvas);
const hoverContext=hoverCanvas.getContext('2d')!;
let gradientDrag:{start:{x:number;y:number};end:{x:number;y:number};components:Set<number>}|null=null;
let mode:'gradient'|'paint'|'erase'|'bone'|'place'|'anchor'|'tip'|'part'|'check'|'surface'='paint',yaw=0,running=false,dragging=false,busy=false;
type Selection=number|'anchor'|'tip';
let skin:SkinData|null=null,selected:Selection='anchor',syncing=false,revision=0;
let owners:string[]=[],partNames:Record<string,string>={},activeChain='',creating=false,helperEdges:number[]=[];
function activePath(){return chainPaths(bones).find(p=>bones[p[0]].name===activeChain)??[];}
function chainEndpoints(){const path=activePath();if(path.length&&!creating){anchor.fromArray(bones[path[0]].position);tip.fromArray(bones[path[path.length-1]].position);}}
let anchorSet=false,tipSet=false,graph:SurfaceGraph|null=null,strokePart:number|null=null,lockedPart:number|null=null;
type EditState={owners:string[];partNames:Record<string,string>;activeChain:string;creating:boolean;anchorSet:boolean;tipSet:boolean;mask:Float32Array;bones:BoneData[];skin:SkinData|null;anchor:number[];tip:number[];selected:Selection;surfaceSelection:number[];isolated:boolean;physics:{stiffness:number;damping:number;rotationLimit?:number;solver?:string;motionMode?:string;useGravity?:boolean;ribbonWind?:boolean;ribbonDirection?:string;ribbonBones?:Record<string,string>;inertia?:number;elasticity?:number;windInfluence?:number;windStrength?:number;windSpeed?:number;windAngle?:number}};
let imported:any=null,texture:THREE.Texture|null=null,material:THREE.MeshStandardMaterial|null=null,history:EditState[]=[],projectModified=false;
let luau:LuauState|null=null,api:any=null,physicsBusy=false,needInit=false,physicsPending=0;
function status(text:string,error=false){el('status').textContent=text;el('status').classList.toggle('error',error);}
async function action(fn:()=>Promise<void>){if(busy)return;busy=true;try{await fn();}catch(error){const message=error instanceof Error?error.message:String(error);status(message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''),true);}finally{busy=false;}}
function settings(){return {...motionExtras(),solver:el<HTMLSelectElement>('physicsSolver').value,stiffness:1-Number(el<HTMLInputElement>('soft').value)/100,damping:Number(el<HTMLInputElement>('damp').value)/100,rotationLimit:Number(el<HTMLInputElement>('bendLimit').value),...Object.fromEntries(motionFields.map(([id,,min,max,,fallback])=>{const n=Number(el<HTMLInputElement>(id).value);return [id,Number.isFinite(n)?THREE.MathUtils.clamp(n,min,id==='elasticity'&&el<HTMLSelectElement>('physicsSolver').value==='v2-sync'?12:max):fallback];}))} as {motionMode:string;useGravity:boolean;ribbonWind:boolean;ribbonDirection:string;ribbonBones?:Record<string,string>;solver:string;stiffness:number;damping:number;rotationLimit:number;inertia:number;elasticity:number;windInfluence:number;windStrength:number;windSpeed:number;windAngle:number};}
function worldOrientation(){const m=new THREE.Matrix4().makeRotationFromQuaternion(mesh!.getWorldQuaternion(new THREE.Quaternion())).elements;return [m[0],m[4],m[8],m[1],m[5],m[9],m[2],m[6],m[10]].join(',');}
let lockYaw=0,lockPitch=.25,lockDistance=12;
function setFittingLock(value:boolean){
 fitting.shiftLock=value;controls.enabled=!value;
 renderer.domElement.style.cursor=value?'crosshair':'';
 el('fittingShiftLock').classList.toggle('active',value);el('fittingShiftLock').textContent=value?'Shift Lock включён · Shift':'Shift Lock · Shift';
 if(!value&&document.pointerLockElement===renderer.domElement)document.exitPointerLock();
}
async function toggleFittingLock(){
 if(!fitting.enabled)return;
 if(fitting.shiftLock){setFittingLock(false);return;}
 const offset=camera.position.clone().sub(controls.target);lockDistance=THREE.MathUtils.clamp(offset.length(),3,30);lockYaw=Math.atan2(offset.x,offset.z);lockPitch=Math.asin(THREE.MathUtils.clamp(offset.y/Math.max(offset.length(),.01),-.8,.8));
 renderer.domElement.focus();
 // Lock the camera immediately; cursor capture is optional (offscreen windows
 // and some desktop policies reject it). Hover rotation remains usable there.
 setFittingLock(true);
 try{const request=renderer.domElement.requestPointerLock();request?.catch(()=>{});}catch{}
}
function endFitting(){
 if(!fitting.enabled)return;setFittingLock(false);fitting.show(false);el<HTMLInputElement>('tryOn').checked=false;el('fittingOptions').hidden=true;
 if(fittingBackup){motion.copy(fittingBackup.motion);yaw=fittingBackup.yaw;camera.position.copy(fittingBackup.camera);controls.target.copy(fittingBackup.target);camera.near=fittingBackup.near;camera.far=fittingBackup.far;controls.minDistance=fittingBackup.min;controls.maxDistance=fittingBackup.max;camera.updateProjectionMatrix();}
 body.position.copy(center).add(motion);body.rotation.set(0,yaw,0);body.scale.set(1,1,1);fittingBackup=null;
}
function startFitting(){
 if(fitting.enabled)return;finishStroke();
 fittingBackup={motion:motion.clone(),yaw,camera:camera.position.clone(),target:controls.target.clone(),near:camera.near,far:camera.far,min:controls.minDistance,max:controls.maxDistance};
 fitting.reset();fitting.show(true);el('fittingOptions').hidden=false;
 controls.target.set(0,3,0);camera.position.set(8,6,12);camera.near=.01;camera.far=1000;controls.minDistance=2;controls.maxDistance=40;camera.updateProjectionMatrix();updateFitting(0);needInit=true;
}
function updateFitting(dt:number){
 const last=fitting.rig.position.clone();const look=camera.position.clone().sub(controls.target);fitting.update(running?dt:0,fitting.shiftLock?lockYaw:Math.atan2(look.x,look.z));
 const delta=fitting.rig.position.clone().sub(last);camera.position.add(delta);controls.target.add(delta);
 if(fitting.shiftLock){
  controls.target.copy(fitting.rig.position).add(new THREE.Vector3(0,3,0)).add(new THREE.Vector3(Math.cos(lockYaw),0,-Math.sin(lockYaw)).multiplyScalar(1.3));
  camera.position.copy(controls.target).add(new THREE.Vector3(Math.sin(lockYaw)*Math.cos(lockPitch),Math.sin(lockPitch),Math.cos(lockYaw)*Math.cos(lockPitch)).multiplyScalar(lockDistance));camera.lookAt(controls.target);
 }
 const slot=el<HTMLSelectElement>('fittingSlot').value;
 const names:Record<string,string[]>={hat:['HatAttachment'],hair:['HairAttachment'],face:['FaceFrontAttachment','FaceCenterAttachment'],back:['BodyBackAttachment'],front:['BodyFrontAttachment'],waist:['WaistCenterAttachment','WaistBackAttachment','WaistFrontAttachment'],neck:['NeckAttachment'],shoulder:['RightShoulderAttachment','LeftShoulderAttachment','RightCollarAttachment','LeftCollarAttachment']};
 const attachment=(Array.isArray(imported?.attachments)?imported.attachments:[]).find((a:any)=>names[slot]?.includes(a.name)&&Array.isArray(a.frame)&&a.frame.length===12&&a.frame.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<10000));
 const offset=['X','Y','Z'].map(axis=>{const n=Number(el<HTMLInputElement>('fitting'+axis).value);return Number.isFinite(n)?THREE.MathUtils.clamp(n,-20,20):0;});
 // body contains mesh translated by -center; compensate so the mesh's original
 // attachment frame, not its bounding-box centre, lands on the avatar mount.
 const world=fitting.mount(slot,attachment?.frame,offset).multiply(new THREE.Matrix4().makeTranslation(center.x,center.y,center.z));
 world.decompose(body.position,body.quaternion,body.scale);yaw=fitting.yaw;
}

function snapshot(){projectModified=true;history.push({physics:settings(),surfaceSelection:[...surfaceSelection],isolated:el<HTMLInputElement>('isolateWeights').checked,owners:[...owners],partNames:{...partNames},activeChain,creating,anchorSet,tipSet,mask:mask.slice(),bones:copyBones(bones),skin:skin?{skinIndices:[...skin.skinIndices],skinWeights:[...skin.skinWeights]}:null,anchor:anchor.toArray(),tip:tip.toArray(),selected});if(history.length>20)history.shift();}
function confirmProjectReplacement(){
  // Ask before IPC/downloads: an import also replaces the backend's source file.
  // Keep protection after undo/export too; neither should silently discard work.
  const hasWork=geometry&&(projectModified||bones.length>0||anchorSet||tipSet||mask.some(value=>value>0));
  return !hasWork||window.confirm('В текущем предмете есть изменения: кости, веса или настройки.\nЗагрузить другой предмет и потерять текущую работу?\n\nНажмите «Отмена», чтобы остаться и сначала сохранить предмет.');
}
function stop(){endFitting();revision++;running=false;physicsPending=0;el('simulate').textContent='Включить симуляцию';el('simulate').classList.remove('active');if(mesh&&bones.length){rebindRest(mesh,bones);needInit=true;}syncSelection();updateMarkers();}
function clearMesh(){revision++;transform.detach();boneProxy.removeFromParent();if(selectionDots){selectionDots.geometry.dispose();(selectionDots.material as THREE.Material).dispose();selectionDots.removeFromParent();selectionDots=null;}if(mesh){body.remove(mesh);mesh.geometry.dispose();mesh.skeleton.dispose();mesh=null;}if(helper){scene.remove(helper);(helper.geometry).dispose();(helper.material as THREE.Material).dispose();helper=null;}}
function project(){if(!geometry)throw new Error('Сначала загрузите аксессуар.');return {version:1,itemType:imported?.itemType,name:imported?.name,sourceHash:imported?.sourceHash,editor:{through:el<HTMLInputElement>('throughBrush').checked,radius:Number(el<HTMLInputElement>('radius').value),strength:Number(el<HTMLInputElement>('brushStrength').value),hardness:Number(el<HTMLInputElement>('brushHardness').value),target:Number(el<HTMLInputElement>('weight').value),gradientFrom:Number(el<HTMLInputElement>('gradientFrom').value),surfaceSelection:[...surfaceSelection],isolated:el<HTMLInputElement>('isolateWeights').checked},texture:imported?.texture,appearance:imported?.appearance,attachments:imported?.attachments,catalogType:imported?.catalogType,geometry,bones:copyBones(bones),owners:[...owners],partNames:{...partNames},activeChain,anchorSet,tipSet,skinIndices:skin?.skinIndices??[],skinWeights:skin?.skinWeights??[],mask:Array.from(mask),anchor:anchor.toArray(),tip:tip.toArray(),settings:settings(),meshAssetId:el<HTMLInputElement>('assetId').value.trim()};}
// Display the same scalar values the skin builder exports, with a fixed palette.
function colors(){
 if(!mesh||!geometry||!graph)return;
 const inWeights=['paint','erase','part','gradient'].includes(mode)&&!running;
 const heatmap=el<HTMLInputElement>('weightHeatmap').checked&&inWeights;
 weightView.hidden=!inWeights;el('weightLegend').hidden=!heatmap;
 const side=el<HTMLInputElement>('throughBrush').checked&&inWeights?THREE.DoubleSide:material!.side;
 if(weightMaterial.side!==side){weightMaterial.side=side;weightMaterial.needsUpdate=true;}
 mesh.material=heatmap?weightMaterial:material!;if(selectionDots)selectionDots.visible=inWeights&&surfaceSelection.size>0;
 const overview=el<HTMLInputElement>('allWeightOverview').checked;
 const values=(mesh.geometry.getAttribute('paintWeight')?.array as Float32Array)??new Float32Array(mask.length),foreign=(mesh.geometry.getAttribute('paintForeign')?.array as Float32Array)??new Float32Array(mask.length),selection=(mesh.geometry.getAttribute('paintSelection')?.array as Float32Array)??new Float32Array(mask.length);
 for(let i=0;i<mask.length;i++){
  const other=!!owners[i]&&!!activeChain&&owners[i]!==activeChain;
  values[i]=other&&!overview?0:mask[i];foreign[i]=other&&!overview?1:0;selection[i]=surfaceSelection.has(graph.components[graph.nodes[i]])?1:0;
 }
 for(const [name,valuesArray] of [['paintWeight',values],['paintForeign',foreign],['paintSelection',selection]] as const){const attribute=mesh.geometry.getAttribute(name);if(attribute)attribute.needsUpdate=true;else mesh.geometry.setAttribute(name,new THREE.BufferAttribute(valuesArray,1));}
 if(!mesh.geometry.getAttribute('color'))mesh.geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(mask.length*3).fill(1),3));
}
function applyIsolation(){
 if(!mesh||!geometry||!graph)return;
 const isolated=el<HTMLInputElement>('isolateWeights').checked&&surfaceSelection.size>0;
 mesh.geometry.setIndex(isolated?geometry.indices.filter((_,i)=>surfaceSelection.has(graph!.components[graph!.nodes[geometry!.indices[Math.floor(i/3)*3]]])):geometry.indices);
 if(selectionDots){selectionDots.geometry.dispose();(selectionDots.material as THREE.Material).dispose();selectionDots.removeFromParent();}const sg=new THREE.BufferGeometry();sg.setAttribute('position',mesh.geometry.getAttribute('position'));sg.setIndex(Array.from({length:mask.length},(_,i)=>i).filter(i=>surfaceSelection.has(graph!.components[graph!.nodes[i]])));selectionDots=new THREE.Points(sg,new THREE.PointsMaterial({color:0xb9e4ff,size:3,sizeAttenuation:false,depthTest:true}));mesh.add(selectionDots);
 el('selectionCount').textContent='Выделено: '+surfaceSelection.size;
 colors();
}

function rebuild(){
  if(!geometry)return;clearMesh();
  const chain=bones.length?bones:createChain(new THREE.Vector3(0,.3,0),new THREE.Vector3(0,-.3,0));
  const binding=bones.length?skin!:{skinIndices:Array(mask.length*4).fill(0),skinWeights:Array.from({length:mask.length*4},(_,i)=>i%4===0?1:0)};
  mesh=makeSkinned(geometry,chain,binding,material!);mesh.position.copy(center).negate();body.add(mesh);body.position.copy(center).add(motion);body.rotation.y=yaw;applyIsolation();colors();
  helperEdges=bones.flatMap((b,i)=>b.parent>0?[i]:[]);
  if(bones.length){helper=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(helperEdges.length*6),3)),new THREE.LineBasicMaterial({color:0x84b8ff,depthTest:false}));helper.renderOrder=4;helper.frustumCulled=false;scene.add(helper);}
  for(const id of ['simulate','saveMesh','export'])el<HTMLButtonElement>(id).disabled=!bones.length||!!geometry.rigged;needInit=true;syncSelection();
}
function selectedPosition(){return typeof selected==='number'?new THREE.Vector3().fromArray(bones[selected].position):(selected==='anchor'?anchor:tip).clone();}
function syncSelection(){
  syncing=true;
  const select=el<HTMLSelectElement>('boneSelect');
  if(typeof selected==='number'&&bones[selected]){const path=chainPaths(bones).find(p=>p.includes(selected as number));if(path)activeChain=bones[path[0]].name;}
  if(!activePath().length&&bones.length)activeChain=bones[chainPaths(bones)[0][0]].name;
  chainEndpoints();
  const path=activePath(),partSelect=el<HTMLSelectElement>('chainSelect');partSelect.replaceChildren(...chainPaths(bones).map((p,i)=>new Option(partNames[bones[p[0]].name]??`Часть ${i+1}`,bones[p[0]].name)));
  if(!bones.length||creating)partSelect.add(new Option('Новая часть',''));partSelect.value=creating?'':activeChain;
  el<HTMLInputElement>('chainName').value=creating?'':partNames[activeChain]??'';
  select.replaceChildren(...(!creating&&path.length?path.map((i,k)=>new Option(k===0?'Крепление':k===path.length-1?'Конец':`Точка ${k+1}`,String(i))):[new Option('Крепление','anchor'),new Option('Конец','tip')]));
  if(bones.length&&!creating&&typeof selected!=='number')selected=selected==='anchor'?path[0]:path[path.length-1];
  if((!bones.length||creating)&&typeof selected==='number')selected='anchor';
  if(typeof selected==='number'&&!path.includes(selected))selected=path[0];
  el<HTMLInputElement>('segments').value=String(path.length?path.length-1:1);
  el<HTMLButtonElement>('deleteBone').disabled=mode!=='bone'||typeof selected!=='number'||!bones.length||!!geometry?.rigged;
  select.value=String(selected);refreshRibbonSelection();const p=selectedPosition();
  for(const [i,axis] of ['X','Y','Z'].entries())el<HTMLInputElement>('bone'+axis).value=String(Number(p.getComponent(i).toFixed(5)));
  const hasSelectedPoint=typeof selected==='number'?!!bones[selected]:selected==='anchor'?anchorSet:tipSet;
  if(mesh&&hasSelectedPoint&&!running&&(mode==='bone'||mode==='place')&&!geometry?.rigged){mesh.add(boneProxy);boneProxy.position.copy(p);boneProxy.quaternion.identity();transform.attach(boneProxy);transform.enabled=true;}else{transform.detach();transform.enabled=false;transform.axis=null;}
  for(const marker of [...boneMarkers.children]){boneMarkers.remove(marker);(marker as THREE.Mesh).geometry.dispose();((marker as THREE.Mesh).material as THREE.Material).dispose();}
  const points:(number|string)[]=bones.slice(1).map((_,i)=>i+1);if(!bones.length||creating)points.push('anchor','tip');
  for(const value of points){if(typeof value==='string'&&!((value==='anchor'&&anchorSet)||(value==='tip'&&tipSet)))continue;const marker=new THREE.Mesh(new THREE.SphereGeometry(Math.max(size.length()*.012,.015),12,8),new THREE.MeshBasicMaterial({color:String(value)===String(selected)?0xffd45c:typeof value==='number'&&!path.includes(value)?0x7c8995:0x84b8ff,depthTest:false}));marker.userData.selection=value;marker.renderOrder=5;boneMarkers.add(marker);}
  const showBones=!!geometry&&!running&&['bone','place','anchor','tip','surface'].includes(mode);boneMarkers.visible=showBones;if(helper)helper.visible=showBones;syncing=false;colors();
}
function setPosition(position:THREE.Vector3,remember=true){
  if(!geometry||geometry.rigged)return;
  try{
    const next=typeof selected==='number'?moveRestBone(bones,selected,position):null;
    if(!position.toArray().every(n=>Number.isFinite(n)&&Math.abs(n)<10000))throw new Error('Некорректные координаты.');
    if(remember){stop();snapshot();}else revision++;
    if(next){bones=next;chainEndpoints();rebindRest(mesh!,bones);needInit=true;}
    else {(selected==='anchor'?anchor:tip).copy(position);if(selected==='anchor')anchorSet=true;else tipSet=true;}
    // Updating bind inverses preserves every rest vertex; weights are untouched.
    boneProxy.position.copy(selectedPosition());
    for(const [i,axis] of ['X','Y','Z'].entries())el<HTMLInputElement>('bone'+axis).value=String(Number(position.getComponent(i).toFixed(5)));
    status('Положение сохранено в rest-позе. Веса не изменены.');
  }catch(error){boneProxy.position.copy(selectedPosition());status((error as Error).message,true);}
}
transform.addEventListener('dragging-changed',event=>{controls.enabled=!event.value;if(event.value){stop();snapshot();}else syncSelection();});
transform.addEventListener('objectChange',()=>{if(!syncing&&!running)setPosition(boneProxy.position.clone(),false);});
function updateMarkers(){
  mesh?.updateWorldMatrix(true,true);
  if(helper&&mesh){const positions=helper.geometry.getAttribute('position') as THREE.BufferAttribute;for(const [k,i] of helperEdges.entries()){const a=mesh.skeleton.bones[bones[i].parent].getWorldPosition(new THREE.Vector3()),b=mesh.skeleton.bones[i].getWorldPosition(new THREE.Vector3());positions.setXYZ(k*2,a.x,a.y,a.z);positions.setXYZ(k*2+1,b.x,b.y,b.z);}positions.needsUpdate=true;}
  for(const marker of boneMarkers.children){const value=marker.userData.selection;if(typeof value==='number'&&mesh)mesh.skeleton.bones[value].getWorldPosition(marker.position);else if(mesh)marker.position.copy(mesh.localToWorld((value==='anchor'?anchor:tip).clone()));}
}
async function load(result:any){
  projectModified=false;
  el<HTMLInputElement>('bendLimit').value='180';el('bendLimitValue').textContent='180°';
  endFitting();restoreMotionExtras(result.savedProject?.settings);el<HTMLSelectElement>('physicsSolver').value=result.savedProject?(result.savedProject.settings?.solver==='v2-sync'?'v2-sync':'v1-sync'):'v1-sync';el<HTMLInputElement>('elasticity').max=el<HTMLSelectElement>('physicsSolver').value==='v2-sync'?'12':'1';el('solverNote').hidden=el<HTMLSelectElement>('physicsSolver').value!=='v2-sync';for(const [id,,,,,value]of motionFields)el<HTMLInputElement>(id).value=String(result.savedProject?.settings?.[id]??value);el<HTMLInputElement>('softWind').checked=Number(el<HTMLInputElement>('windInfluence').value)>0;
  for(const axis of ['X','Y','Z'])el<HTMLInputElement>('fitting'+axis).value='0';
  const category=result.catalogType??result.savedProject?.catalogType;el<HTMLSelectElement>('fittingSlot').value=['hat','hair','back','front','waist','neck','shoulder'].includes(category)?category:category==='face_accessory'?'face':'hat';
  showWorkspace(false);
  stop();clearMesh();geometry=null;bones=[];owners=[];partNames={};activeChain='';creating=false;skin=null;selected='anchor';history=[];anchorSet=false;tipSet=false;graph=null;lockedPart=null;strokePart=null;mode='paint';heatmapPreference=false;el<HTMLInputElement>('weightHeatmap').checked=false;el<HTMLInputElement>('throughBrush').checked=false;surfaceSelection.clear();projection=null;el<HTMLInputElement>('isolateWeights').checked=false;for(const [id,n] of [['radius',28],['brushStrength',100],['brushHardness',65],['weight',100],['gradientFrom',0]] as const)el<HTMLInputElement>(id).value=String(n);el<HTMLInputElement>('allWeightOverview').checked=false;imported=result;texture?.dispose();texture=null;material?.dispose();
  el('label').textContent=result.name+' · '+(result.itemType==='hair'?'Волосы':'Аксессуар');el('partHint').textContent='Мазок остаётся на той части, где начат.';el<HTMLInputElement>('segments').value='1';el<HTMLSelectElement>('preset').value=result.itemType==='hair'?'hair':'pendant';el<HTMLSelectElement>('preset').dispatchEvent(new Event('change'));el('empty').style.display='none';boneMarkers.visible=false;el<HTMLInputElement>('assetId').value='';
  if(!result.geometry){status(result.warnings.join(' '),true);el('empty').style.display='grid';el('empty').querySelector('h1')!.textContent='Нужен файл геометрии';el('empty').querySelector('p')!.textContent='Меш не удалось загрузить. Выберите его .mesh вручную.';el('demo').textContent='Выбрать .mesh';return;}
  geometry=result.geometry;showWorkspace(true);graph=surfaceGraph(geometry!);projection=new WeightProjection(geometry!);mask=new Float32Array(geometry!.positions.length/3);owners=Array(mask.length).fill('');yaw=0;motion.set(0,0,0);
  if(result.texture){texture=await new THREE.TextureLoader().loadAsync(result.texture);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;}
  // Inverted-hull accessories rely on backface culling for their outlines.
  material=new THREE.MeshStandardMaterial({color:0xffffff,map:texture,roughness:.65,metalness:.04,side:result.appearance?.doubleSided?THREE.DoubleSide:THREE.FrontSide,vertexColors:true});
  const bounds=new THREE.Box3().setFromArray(geometry!.positions);bounds.getCenter(center);bounds.getSize(size);
  anchor.set(center.x,bounds.max.y,center.z);tip.set(center.x,bounds.min.y,center.z);
  const extent=Math.max(size.x,size.y,size.z,.3);camera.position.copy(center).add(new THREE.Vector3(extent*1.4,extent*.5,extent*2.4));controls.target.copy(center);camera.near=extent/1000;camera.far=extent*100;camera.updateProjectionMatrix();
  controls.minDistance=Math.max(camera.near*3,extent*.01);controls.maxDistance=extent*20;
  rebuild();setMode('paint');status(result.geometry.rigged?'Этот меш уже имеет риг: пока доступен только осмотр.':result.warnings?.join(' ')||'Выдели кистью гибкую часть. Затем укажи крепление и конец.');
  if(result.savedProject){const saved=result.savedProject;anchorSet=saved.anchorSet??saved.bones.length>0;tipSet=saved.tipSet??saved.bones.length>0;mask=new Float32Array(saved.mask);anchor.fromArray(saved.anchor);tip.fromArray(saved.tip);bones=copyBones(saved.bones);el<HTMLInputElement>('segments').value=String(bones.length?bones.length-2:1);skin=bones.length?{skinIndices:[...saved.skinIndices],skinWeights:[...saved.skinWeights]}:null;partNames={...saved.partNames};activeChain=saved.activeChain??(bones[1]?.name??'');owners=saved.owners?[...saved.owners]:Array.from(mask,(_,i)=>{const path=chainPaths(bones).find(p=>skin?.skinIndices.slice(i*4,i*4+4).some((id,k)=>p.includes(id)&&skin!.skinWeights[i*4+k]>0));return path?bones[path[0]].name:'';});el<HTMLInputElement>('soft').value=String(Math.round((1-saved.settings.stiffness)*100));el<HTMLInputElement>('damp').value=String(Math.round(saved.settings.damping*100));el<HTMLInputElement>('bendLimit').value=String(saved.settings.rotationLimit??180);el('bendLimitValue').textContent=el<HTMLInputElement>('bendLimit').value+'°';el('softValue').textContent=el<HTMLInputElement>('soft').value+'%';el('dampValue').textContent=el<HTMLInputElement>('damp').value+'%';el<HTMLInputElement>('assetId').value=saved.meshAssetId||'';rebuild();updateMarkers();status('Проект восстановлен. Можно продолжить редактирование.');}
  smoothSelected=false;syncBrushUi();
  const editor=result.savedProject?.editor;
  if(editor){for(const [id,key,min,max] of [['radius','radius',8,90],['brushStrength','strength',0,100],['brushHardness','hardness',0,100],['weight','target',0,100],['gradientFrom','gradientFrom',0,100]] as const){const n=editor[key];if(typeof n==='number'&&Number.isFinite(n))el<HTMLInputElement>(id).value=String(THREE.MathUtils.clamp(n,min,max));}el<HTMLInputElement>('throughBrush').checked=editor.through===true;surfaceSelection=new Set((Array.isArray(editor.surfaceSelection)?editor.surfaceSelection:[]).filter((n:unknown)=>Number.isInteger(n)&&graph!.components.includes(n as number)));el<HTMLInputElement>('isolateWeights').checked=editor.isolated===true;applyIsolation();}
  el('weightValue').textContent=el<HTMLInputElement>('weight').value+'%';el('gradientFromValue').textContent=el<HTMLInputElement>('gradientFrom').value+'%';
  if(result.geometry.rigged)el<HTMLButtonElement>('simulate').disabled=true;
}
async function ensureSimulation(){
  if(!luau){luau=await LuauState.createAsync();const entry=luau.loadstring(source,'trusted-smartbone',true);api=(await entry())[0];}
  if(needInit){const initRevision=revision,s=settings(),position=mesh!.getWorldPosition(new THREE.Vector3());await api.get('initialize')(bones.flatMap(b=>b.position).join(','),bones.map(b=>b.parent).join(','),bones.flatMap(b=>b.rotation).join(','),s.stiffness,s.damping,Math.max(size.x,.001),Math.max(size.y,.001),Math.max(size.z,.001),position.x,position.y,position.z,yaw,s.rotationLimit,worldOrientation(),s.solver);needInit=initRevision!==revision;}
  const s=settings();await api.get('configure')(s.inertia,s.elasticity,s.windInfluence,s.windStrength,s.windSpeed,s.windAngle,s.stiffness,s.damping,s.rotationLimit,el<HTMLInputElement>('ribbonWind').checked,el<HTMLSelectElement>('ribbonDirection').value,s.motionMode==='cape',s.useGravity,ribbonBones===null?'':bones.map((b,i)=>ribbonBones![b.name]?`${i+1}:${ribbonBones![b.name]}`:'').filter(Boolean).join(','),ribbonBones!==null);
}
function setRay(event:PointerEvent){const bounds=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);ray.setFromCamera(pointer,camera);}
function pick(event:PointerEvent){mesh?.updateWorldMatrix(true,true);camera.updateMatrixWorld();setRay(event);return mesh?ray.intersectObject(mesh,false)[0]:undefined;}
function projected(){
 if(!mesh||!geometry||!projection||!graph)return null;
 mesh.updateWorldMatrix(true,true);camera.updateMatrixWorld();const b=renderer.domElement.getBoundingClientRect();
 projection.update(mesh,camera,b.width,b.height,el<HTMLInputElement>('throughBrush').checked,el<HTMLInputElement>('isolateWeights').checked&&surfaceSelection.size?surfaceSelection:undefined,graph,true);
 return {cache:projection,bounds:b};
}
function brushCandidates(event:PointerEvent,from=lastDab){
 const p=projected();if(!p)return new Map<number,number>();
 const x=event.clientX-p.bounds.left,y=event.clientY-p.bounds.top,r=Number(el<HTMLInputElement>('radius').value),hardness=Number(el<HTMLInputElement>('brushHardness').value)/100;
 const result=p.cache.querySegment(from?.x??x,from?.y??y,x,y,r,hardness);
 for(const [i] of result)if((surfaceSelection.size&&!surfaceSelection.has(graph!.components[graph!.nodes[i]]))||(owners[i]&&owners[i]!==activeChain))result.delete(i);
 return result;
}
function updateSkin(touched:Set<number>){
 if(!mesh)return;
 if(bones.length){skin=skinForBones(geometry!,mask,bones,skin??undefined,touched,owners);for(const [name,values] of [['skinIndex',skin.skinIndices],['skinWeight',skin.skinWeights]] as const){const attribute=mesh.geometry.getAttribute(name) as THREE.BufferAttribute;for(const i of touched)attribute.setXYZW(i,values[i*4],values[i*4+1],values[i*4+2],values[i*4+3]);attribute.needsUpdate=true;}}
 colors();
}
function brush(event:PointerEvent,defer=false){
 if(!geometry||!mesh||!graph||geometry.rigged)return;
 const op=event.shiftKey||smoothSelected?'smooth':mode==='erase'?'erase':'set';
 if(!weightStroke||strokeOperation!==op){weightStroke=new WeightStroke(mask,owners,activeChain,graph,op,Number(el<HTMLInputElement>('weight').value)/100,Number(el<HTMLInputElement>('brushStrength').value)/100);strokeOperation=op;lastDab=null;}
 const changes=weightStroke.apply(brushCandidates(event));const touched=new Set<number>();
 for(const [i,w] of changes)if(Math.abs(mask[i]-w)>1e-8){mask[i]=w;owners[i]=w>0?(owners[i]||activeChain):'';touched.add(i);}
 const b=renderer.domElement.getBoundingClientRect();lastDab={x:event.clientX-b.left,y:event.clientY-b.top};if(touched.size){if(defer)for(const i of touched)frameTouched.add(i);else updateSkin(touched);}
}
function flushBrush(){const queued=pendingBrush.splice(0);for(const event of queued)brush(event,true);if(frameTouched.size){updateSkin(frameTouched);frameTouched.clear();}}
function beginGradient(event:PointerEvent){
 if(!geometry||!mesh||!graph)return;const b=renderer.domElement.getBoundingClientRect(),x=event.clientX-b.left,y=event.clientY-b.top;const components=new Set(surfaceSelection);
 if(!components.size){const hit=pick(event);if(hit?.faceIndex!=null)components.add(graph.components[graph.nodes[mesh.geometry.index!.getX(hit.faceIndex*3)]]);}
 if(!components.size){status('Выделите поверхность для градиента.',true);return;}
 gradientDrag={start:{x,y},end:{x,y},components};dragging=true;controls.enabled=false;renderer.domElement.setPointerCapture(event.pointerId);
}
function previewGradient(event:PointerEvent){
 if(!gradientDrag)return;const b=renderer.domElement.getBoundingClientRect();gradientDrag.end={x:event.clientX-b.left,y:event.clientY-b.top};hoverCanvas.width=Math.round(b.width);hoverCanvas.height=Math.round(b.height);
 const {start,end}=gradientDrag;hoverContext.strokeStyle='#e7edf4';hoverContext.lineWidth=2;hoverContext.beginPath();hoverContext.moveTo(start.x,start.y);hoverContext.lineTo(end.x,end.y);hoverContext.stroke();
 for(const [p,c] of [[start,'#80beff'],[end,'#ffd465']] as const){hoverContext.fillStyle=c;hoverContext.beginPath();hoverContext.arc(p.x,p.y,5,0,Math.PI*2);hoverContext.fill();}
 hoverContext.fillStyle='#ffffff';hoverContext.font='12px Segoe UI';hoverContext.fillText(el<HTMLInputElement>('gradientFrom').value+'% → '+el<HTMLInputElement>('weight').value+'%',end.x+10,end.y-10);
}
function endGradient(event:PointerEvent){
 if(!gradientDrag||!geometry||!graph)return;previewGradient(event);const p=projected();if(!p)return;
 const points:Array<[number,{x:number;y:number}]>=[];
 for(let i=0;i<mask.length;i++)if(gradientDrag.components.has(graph.components[graph.nodes[i]])){const point=p.cache.point(i);if(point)points.push([i,point]);}
 const changes=linearGradient(gradientDrag.start,gradientDrag.end,points,mask,owners,activeChain,Number(el<HTMLInputElement>('gradientFrom').value)/100,Number(el<HTMLInputElement>('weight').value)/100,Number(el<HTMLInputElement>('brushStrength').value)/100);
 if(!changes.size){status('Градиент: нет доступных вершин или слишком короткая линия.',true);return;}
 snapshot();const touched=new Set<number>();for(const [i,w] of changes){mask[i]=w;owners[i]=w>0?(owners[i]||activeChain):'';touched.add(i);}updateSkin(touched);status('Градиент применён. Ctrl+Z — отмена.');
}
function hoverWeights(event:PointerEvent){
 if(event.buttons){hoverContext.clearRect(0,0,hoverCanvas.width,hoverCanvas.height);return;}
 if(!geometry||!['paint','erase'].includes(mode)||running)return;
 const candidates=brushCandidates(event,null),b=renderer.domElement.getBoundingClientRect();
 if(hoverCanvas.width!==Math.round(b.width)||hoverCanvas.height!==Math.round(b.height)){hoverCanvas.width=Math.round(b.width);hoverCanvas.height=Math.round(b.height);}
 hoverContext.clearRect(0,0,hoverCanvas.width,hoverCanvas.height);
 // Hover points are projected independently of the GPU's interpolated heatmap.
 hoverContext.fillStyle='#e9f4ff';
 if(el<HTMLInputElement>('previewVertices').checked)for(const [i] of candidates){const p=projection!.point(i);if(!p)continue;hoverContext.beginPath();hoverContext.arc(p.x,p.y,2,0,Math.PI*2);hoverContext.fill();}
 el('brushCursor').classList.toggle('inactive',candidates.size===0);
}

function endpoint(next:'anchor'|'tip'){const path=activePath();selected=path.length&&!creating?(next==='anchor'?path[0]:path[path.length-1]):next;setMode(next);}
function placeEndpoint(event:PointerEvent){
  const target=mode==='anchor'?'anchor':'tip';const hit=pick(event);
  const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),mesh!.localToWorld(selectedPosition()));
  const world=hit?.point.clone()??ray.ray.intersectPlane(plane,new THREE.Vector3());if(!world)return;
  const position=mesh!.worldToLocal(world);
  try{
    if(bones.length&&!creating){const path=activePath(),fresh=createChain(target==='anchor'?position:anchor,target==='tip'?position:tip,path.length-1);stop();snapshot();for(const [k,i] of path.entries()){bones[i].position=fresh[k+1].position;bones[i].rotation=fresh[k+1].rotation;}chainEndpoints();rebindRest(mesh!,bones);needInit=true;setMode('bone');status('Точка изменена. Веса сохранены.');}
    else{
      const start=target==='anchor'?position:anchor,end=target==='tip'?position:tip;
      const complete=(target==='anchor'||anchorSet)&&(target==='tip'||tipSet);
      const next=complete?appendChain(bones,start,end):null;stop();snapshot();(target==='anchor'?anchor:tip).copy(position);if(target==='anchor')anchorSet=true;else tipSet=true;
      if(next){bones=next;const path=chainPaths(bones).at(-1)!;activeChain=bones[path[0]].name;partNames[activeChain]=`Часть ${chainPaths(bones).length}`;creating=false;selected=path[0];const pending=new Set<number>();owners.forEach((owner,i)=>{if(!owner&&mask[i]>0){owners[i]=activeChain;pending.add(i);}});skin=skinForBones(geometry!,mask,bones,skin??undefined,skin?pending:undefined,owners);rebuild();setMode('bone');status('Кость готова. Можно двигать точки или добавить следующую кость.');}
      else endpoint(target==='anchor'?'tip':'anchor');
    }
  }catch(error){status((error as Error).message,true);}
}
function finishStroke(){gradientDrag=null;flushBrush();pendingHover=null;weightStroke=null;lastDab=null;hoverContext.clearRect(0,0,hoverCanvas.width,hoverCanvas.height);dragging=false;strokePart=null;dragPlane=null;dragPoint=null;controls.enabled=!transform.dragging&&!fitting.shiftLock;}
// Capture marker selection before TransformControls consumes an overlapping axis.
renderer.domElement.addEventListener('pointerdown',event=>{
  if(event.button!==0||!geometry||geometry.rigged||running||mode!=='bone'||transform.dragging)return;
  mesh?.updateWorldMatrix(true,true);updateMarkers();setRay(event);
  const hit=ray.intersectObjects(boneMarkers.children,false)[0];
  if(!hit||hit.object.userData.selection===selected)return;
  event.preventDefault();event.stopImmediatePropagation();
  selected=hit.object.userData.selection;transform.axis=null;syncSelection();
  status('Точка выбрана. Тяни стрелки для перемещения.');
},{capture:true});
renderer.domElement.addEventListener('pointerdown',event=>{
  if(fitting.enabled){renderer.domElement.focus();return;}
  if(event.button!==0||!geometry||geometry.rigged||(transform.enabled&&(transform.dragging||transform.axis)))return;
  if(!running&&mode==='gradient'){beginGradient(event);return;}
  if(!running&&mode==='surface'){
    const hit=pick(event);if(!hit){status('Наведите курсор на поверхность предмета.');return;}
    setPosition(mesh!.worldToLocal(hit.point.clone()));setMode('bone');return;
  }
  if(!running&&(mode==='anchor'||mode==='tip')){placeEndpoint(event);return;}
  if(!running&&mode==='part'){
    const old=mesh!.material;mesh!.material=el<HTMLInputElement>('throughBrush').checked?weightMaterial:material!;
    const hit=pick(event);mesh!.material=old;
    if(hit?.faceIndex!=null&&graph){const indices=mesh!.geometry.index!;const vertex=indices.getX(hit.faceIndex*3),component=graph.components[graph.nodes[vertex]];snapshot();if(event.ctrlKey||event.metaKey)surfaceSelection.delete(component);else{if(!event.shiftKey)surfaceSelection.clear();surfaceSelection.add(component);}applyIsolation();}return;
  }
  if(!running&&(mode==='bone'||mode==='place')){
    mesh?.updateWorldMatrix(true,true);setRay(event);
    if(mode==='bone'){
      updateMarkers();const hit=ray.intersectObjects(boneMarkers.children,false)[0];
      if(hit)selected=hit.object.userData.selection;
      else if(helper){helper.geometry.computeBoundingSphere();ray.params.Line.threshold=2*camera.position.distanceTo(body.position)*Math.tan(camera.fov*Math.PI/360)*6/stage.clientHeight;const line=ray.intersectObject(helper,false)[0];if(line?.index!=null)selected=helperEdges[Math.floor(line.index/2)];else return;}
      else return;
      syncSelection();status('Кость выбрана. Delete — удалить; Ctrl+Z — вернуть.');return;
    }
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),mesh!.localToWorld(selectedPosition()));
    const point=ray.ray.intersectPlane(plane,new THREE.Vector3());if(point)setPosition(mesh!.worldToLocal(point));return;
  }
  if(!running&&mode==='check')return;
  dragging=true;strokePart=null;renderer.domElement.setPointerCapture(event.pointerId);
  if(running){camera.updateMatrixWorld();setRay(event);dragPlane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),body.getWorldPosition(new THREE.Vector3()));dragPoint=ray.ray.intersectPlane(dragPlane,new THREE.Vector3());controls.enabled=false;}
  else{snapshot();brush(event);}
});
renderer.domElement.addEventListener('pointermove',event=>{
  if(mode==='gradient'&&gradientDrag){previewGradient(event);return;}
  if(mode==='surface'&&!running){const hit=pick(event);surfaceGhost.visible=!!hit;if(hit){surfaceGhost.position.copy(hit.point);surfaceGhost.scale.setScalar(Math.max(size.length()*.012,.015));}return;}
  const cursor=el('brushCursor'),bounds=stage.getBoundingClientRect(),radius=Number(el<HTMLInputElement>('radius').value);
  cursor.style.display=!running&&(mode==='paint'||mode==='erase')&&geometry?'block':'none';cursor.style.width=cursor.style.height=radius*2+'px';cursor.style.left=event.clientX-bounds.left+'px';cursor.style.top=event.clientY-bounds.top+'px';
  if(!dragging){pendingHover=event;return;}
  if(running&&!fitting.enabled&&dragPlane&&dragPoint){setRay(event);const point=ray.ray.intersectPlane(dragPlane,new THREE.Vector3());if(point){motion.add(point.clone().sub(dragPoint));dragPoint.copy(point);body.position.copy(center).add(motion);updateMarkers();}}
  else if(!running)pendingBrush.push(event);
});
renderer.domElement.addEventListener('pointerleave',()=>{pendingHover=null;surfaceGhost.visible=false;hoverContext.clearRect(0,0,hoverCanvas.width,hoverCanvas.height);el('brushCursor').style.display='none';});
window.addEventListener('blur',finishStroke);window.addEventListener('pointerup',endPointerStroke);renderer.domElement.addEventListener('lostpointercapture',finishStroke);
function endPointerStroke(event:PointerEvent){if(mode==='gradient'&&gradientDrag)endGradient(event);if(dragging&&!running&&(mode==='paint'||mode==='erase')){flushBrush();brush(event);}finishStroke();}
renderer.domElement.addEventListener('pointerup',endPointerStroke);renderer.domElement.addEventListener('pointercancel',finishStroke);
renderer.domElement.addEventListener('wheel',event=>{event.preventDefault();if(!geometry||event.ctrlKey||dragging||fitting.enabled)return;yaw+=THREE.MathUtils.clamp(event.deltaY,-100,100)*.004;body.rotation.y=yaw;updateMarkers();},{passive:false});
renderer.domElement.addEventListener('contextmenu',event=>event.preventDefault());
function showPanel(panel:'Bones'|'Weights'|'Check'){if(panel!=='Bones'&&creating){creating=false;anchorSet=tipSet=!!bones.length;selected=activePath()[0]??'anchor';chainEndpoints();}el('chainPicker').hidden=panel==='Check';for(const name of ['Bones','Weights','Check']){el('panel'+name).hidden=name!==panel;el('tab'+name).classList.toggle('selected',name===panel);}}
function syncBrushUi(){gradientStartLabel.hidden=mode!=='gradient';el('radius').parentElement!.hidden=mode==='gradient';el('brushHardness').parentElement!.hidden=mode==='gradient';gradientButton.classList.toggle('selected',mode==='gradient');el('weight').parentElement!.hidden=mode==='erase'||smoothSelected;el('smoothWeights').classList.toggle('selected',smoothSelected);}
function setMode(next:typeof mode){showPanel(['paint','erase','part','gradient'].includes(next)?'Weights':'Bones');finishStroke();stop();mode=next;syncBrushUi();surfaceGhost.visible=false;renderer.domElement.style.cursor=next==='surface'?'crosshair':'';el('brushCursor').style.display='none';for(const [id,tool] of [['paint','paint'],['erase','erase'],['selectBone','bone'],['place','place'],['anchor','anchor'],['tip','tip'],['part','part']])el(id).classList.toggle('selected',next===tool);syncSelection();status(next==='gradient'?'Протяните от начала к концу градиента.':next==='anchor'?'Кликни начало кости. Следующий клик задаст конец.':next==='tip'?'Кликни конец кости.':next==='part'?'Кликни по хвостику или другой части, которую хочешь красить.':next==='bone'?'Выбери точку в списке или кликом. Тяни стрелки X / Y / Z.':next==='place'?'Кликни в любом месте плоскости вида на глубине выбранной точки.':next==='erase'?'Ластик':'Кисть');}
el('anchor').onclick=()=>endpoint('anchor');el('tip').onclick=()=>endpoint('tip');
function startSurfacePlacement(){
  if(!geometry||geometry.rigged||running||transform.dragging)return;
  setMode('surface');status('Точка по поверхности: наведите мышь, кликните для применения. Esc — отмена.');
}
el('surfacePlace').onclick=startSurfacePlacement;
el('mirrorChain').onclick=()=>{
  if(!geometry||geometry.rigged||typeof selected!=='number'||creating||!skin||running)return;
  try{
    const axis=Number(el<HTMLSelectElement>('mirrorAxis').value) as 0|1|2;
    const result=mirrorChain(bones,selected,axis,center.getComponent(axis));
    stop();snapshot();const oldName=partNames[activeChain]??'Часть';bones=result.bones;activeChain=bones[result.root].name;
    partNames[activeChain]=oldName+' (зеркало)';selected=result.root;
    chainEndpoints();rebuild();setMode('bone');updateMarkers();status('Цепочка отражена. Назначьте веса новой стороне кистью или автовесами. Ctrl+Z — отмена.');
  }catch(error){status((error as Error).message,true);}
};
window.addEventListener('keydown',event=>{
  const target=event.target as HTMLElement;if(['TEXTAREA','SELECT'].includes(target?.tagName)||(target instanceof HTMLInputElement&&!['range','checkbox','button'].includes(target.type))||target?.isContentEditable||event.altKey)return;
  if(fitting.enabled&&!event.ctrlKey&&!event.metaKey&&['KeyW','KeyA','KeyS','KeyD','Space'].includes(event.code))return;
  if((event.ctrlKey||event.metaKey)&&!event.repeat){if(event.code==='KeyW'){event.preventDefault();smoothSelected=false;setMode('gradient');}else if(event.code==='KeyQ'||event.code==='KeyD'){event.preventDefault();el(event.code==='KeyQ'?'chain':'mirrorChain').click();}return;}
  if(event.repeat||busy||document.querySelector('dialog[open]'))return;
  const shortcuts:Record<string,()=>void>={KeyQ:()=>setMode('bone'),KeyV:()=>{smoothSelected=false;setMode('paint');},KeyE:()=>{smoothSelected=false;setMode('erase');},KeyX:()=>{const n=el<HTMLInputElement>('throughBrush');n.checked=!n.checked;finishStroke();colors();status(n.checked?'Кисть насквозь: обе стороны под курсором.':'Кисть по поверхности.');},KeyH:()=>{el<HTMLInputElement>('weightHeatmap').click();},Space:()=>{if(!geometry||!bones.length)return;if(!running)el('tabCheck').click();el('simulate').click();}};
  if(shortcuts[event.code]){event.preventDefault();shortcuts[event.code]();return;}
  if(event.key==='Escape'&&mode==='gradient'){event.preventDefault();finishStroke();return;}
  if(event.key==='Escape'&&mode==='surface'){event.preventDefault();setMode('bone');status('Размещение отменено.');}
  if(event.code==='KeyG'&&!event.repeat){event.preventDefault();if(mode==='surface')setMode('bone');else startSurfacePlacement();}
});
el('part').onclick=()=>setMode('part');el('unlockPart').onclick=()=>{lockedPart=null;el('partHint').textContent='Мазок остаётся на той части, где начат.';setMode('paint');};
el('paint').onclick=()=>{smoothSelected=false;setMode('paint');};el('erase').onclick=()=>{smoothSelected=false;setMode('erase');};el('selectBone').onclick=()=>setMode('bone');el('place').onclick=()=>setMode('place');
el<HTMLSelectElement>('boneSelect').onchange=()=>{selected=bones.length&&!creating?Number(el<HTMLSelectElement>('boneSelect').value):el<HTMLSelectElement>('boneSelect').value as 'anchor'|'tip';setMode('bone');};
el('applyPosition').onclick=()=>{setPosition(new THREE.Vector3(...['X','Y','Z'].map(axis=>Number(el<HTMLInputElement>('bone'+axis).value)) as [number,number,number]));syncSelection();};
el('centerBone').onclick=()=>{setPosition(center.clone());syncSelection();};
const autoWeightsButton=document.createElement('button');autoWeightsButton.id='autoWeights';autoWeightsButton.className='wide';autoWeightsButton.textContent='Автовеса по всем костям';
document.querySelector('footer > span:last-child')!.remove();
el('gradientFrom').oninput=()=>el('gradientFromValue').textContent=el<HTMLInputElement>('gradientFrom').value+'%';
gradientButton.onclick=()=>{smoothSelected=false;setMode('gradient');};
el('surfaceSelect').onclick=()=>setMode('part');el('smoothWeights').onclick=()=>{smoothSelected=true;setMode('paint');};
el('throughBrush').onchange=()=>{finishStroke();colors();};el('allWeightOverview').onchange=()=>colors();
el('isolateWeights').onchange=()=>{finishStroke();const requested=el<HTMLInputElement>('isolateWeights').checked;el<HTMLInputElement>('isolateWeights').checked=!requested;snapshot();el<HTMLInputElement>('isolateWeights').checked=requested;applyIsolation();};
el('clearSelection').onclick=()=>{finishStroke();snapshot();surfaceSelection.clear();el<HTMLInputElement>('isolateWeights').checked=false;applyIsolation();};
function selectionWeights(operation:'set'|'zero'|'reassign'){
 if(!geometry||!surfaceSelection.size||!graph||running||geometry.rigged)return;
 if(operation!=='zero'&&!activeChain){status('Выберите цепочку.',true);return;}
 finishStroke();snapshot();const touched=new Set<number>();
 for(let i=0;i<mask.length;i++)if(surfaceSelection.has(graph.components[graph.nodes[i]])&&(operation==='zero'||operation==='reassign'||!owners[i]||owners[i]===activeChain)){
 mask[i]=operation==='zero'?0:operation==='reassign'?mask[i]:Number(el<HTMLInputElement>('weight').value)/100;owners[i]=mask[i]>0?activeChain:'';touched.add(i);
 }updateSkin(touched);
}
el('fillSelection').onclick=()=>selectionWeights('set');el('zeroSelection').onclick=()=>selectionWeights('zero');el('reassignSelection').onclick=()=>selectionWeights('reassign');
el('all').textContent='Назначить весь предмет этой цепочке';
for(const id of ['radius','brushStrength','brushHardness','weight','gradientFrom'])el(id).addEventListener('input',()=>{finishStroke();projectModified=true;});
el('clearWeights').onclick=()=>{if(!geometry)return;finishStroke();stop();snapshot();mask.fill(0);owners.fill('');if(bones.length)skin=skinForBones(geometry,mask,bones,skin??undefined,undefined,owners);rebuild();status('Веса очищены. Ctrl+Z — отмена.');};
const insertPointButton=document.createElement('button');insertPointButton.id='insertPoint';insertPointButton.className='wide';insertPointButton.textContent='Добавить точку изгиба';
el('boneAdvanced').before(insertPointButton);
insertPointButton.onclick=()=>{
  if(!geometry||busy||creating||!skin)return;
  try{
    finishStroke();const path=activePath();
    const point=typeof selected==='number'?selected:path[0];
    // Selected point denotes the following edge; the tip denotes its last edge.
    const at=path.indexOf(point),child=path[Math.min(Math.max(at,0)+1,path.length-1)];
    const result=insertRestPoint(geometry,bones,child,mask,owners,skin);
    stop();snapshot();bones=result.bones;skin=result.skin;selected=result.selected;
    chainEndpoints();rebuild();setMode('bone');updateMarkers();
    el<HTMLDetailsElement>('boneAdvanced').open=true;
    status('Точка добавлена в середину сегмента. Передвиньте её стрелками на изгиб. Покраска сохранена; Ctrl+Z — отменить.');
  }catch(error){status((error as Error).message,true);}
};
el('panelWeights').prepend(autoWeightsButton);
function applyAutomaticWeights(confirmReplacement=true){
 if(!geometry||geometry.rigged)throw new Error('Load an editable accessory first');
 finishStroke();const result=automaticWeights(geometry,bones,Number(el<HTMLInputElement>('weight').value)/100);
 if(confirmReplacement&&mask.some(n=>n>0)&&!window.confirm('Заменить текущую покраску автовесами? Изменение можно отменить.'))return;
 stop();snapshot();mask=result.mask;owners=result.owners;skin=result.skin;rebuild();status('Автовеса готовы.');
}
autoWeightsButton.onclick=()=>{if(busy)return;try{applyAutomaticWeights();}catch(error){status((error as Error).message,true);}};
el('all').onclick=()=>{if(!geometry||geometry.rigged)return;stop();snapshot();mask.fill(Number(el<HTMLInputElement>('weight').value)/100);owners.fill(activeChain);if(bones.length)skin=skinForBones(geometry,mask,bones,undefined,undefined,owners);rebuild();};
function undo(){finishStroke();const previous=history.pop();if(previous){stop();transform.axis=null;if(previous.physics){restoreMotionExtras(previous.physics);el<HTMLSelectElement>('physicsSolver').value=previous.physics.solver??'v1-sync';el<HTMLInputElement>('elasticity').max=el<HTMLSelectElement>('physicsSolver').value==='v2-sync'?'12':'1';el('solverNote').hidden=el<HTMLSelectElement>('physicsSolver').value!=='v2-sync';for(const [id,,,,,fallback]of motionFields)el<HTMLInputElement>(id).value=String(previous.physics[id]??fallback);el<HTMLInputElement>('softWind').checked=Number(el<HTMLInputElement>('windInfluence').value)>0;el<HTMLInputElement>('bendLimit').value=String(previous.physics.rotationLimit??180);el('bendLimitValue').textContent=el<HTMLInputElement>('bendLimit').value+'°';el<HTMLInputElement>('soft').value=String((1-previous.physics.stiffness)*100);el<HTMLInputElement>('damp').value=String(previous.physics.damping*100);el('softValue').textContent=el<HTMLInputElement>('soft').value+'%';el('dampValue').textContent=el<HTMLInputElement>('damp').value+'%';}surfaceSelection=new Set(previous.surfaceSelection);el<HTMLInputElement>('isolateWeights').checked=previous.isolated;owners=previous.owners;partNames=previous.partNames;activeChain=previous.activeChain;creating=false;mask=previous.mask;bones=previous.bones;skin=previous.skin;anchor.fromArray(previous.anchor);tip.fromArray(previous.tip);anchorSet=previous.anchorSet;tipSet=previous.tipSet;selected=previous.selected;if(mode==='anchor'||mode==='tip'||mode==='place')mode='bone';el<HTMLInputElement>('segments').value=String(bones.length?bones.length-2:1);rebuild();showPanel(['paint','erase','part','gradient'].includes(mode)?'Weights':'Bones');status('Последнее изменение отменено.');}}
window.addEventListener('keydown',event=>{const target=event.target as HTMLElement;const editingText=target?.tagName==='TEXTAREA'||(target instanceof HTMLInputElement&&['text','search','url'].includes(target.type));if((event.ctrlKey||event.metaKey)&&(event.code==='KeyZ'||event.key.toLowerCase()==='z')&&!editingText){event.preventDefault();undo();}},true);
function deleteSelected(){
  if(mode!=='bone'||typeof selected!=='number'||!skin||!bones.length||geometry?.rigged||transform.dragging)return;
  try{
    const root=activeChain,oldPaths=chainPaths(bones),path=oldPaths.find(p=>p.includes(selected as number))!;const next=deleteRestBone(bones,selected,skin);finishStroke();stop();snapshot();bones=next.bones;skin=next.skin;if(path.length===2){owners=owners.map(owner=>owner===root?'':owner);delete partNames[root];activeChain=chainPaths(bones).length?bones[chainPaths(bones)[0][0]].name:'';}creating=false;
    if(bones.length){selected=activePath()[0];chainEndpoints();}
    else{selected='anchor';anchorSet=tipSet=false;}
    el<HTMLInputElement>('segments').value=String(bones.length?bones.length-2:1);rebuild();updateMarkers();
    status(bones.length?'Кость удалена. Положение остальных точек и покраска сохранены. Ctrl+Z — вернуть.':'Кость удалена. Покраска сохранена; можно создать новую кость. Ctrl+Z — вернуть.');
  }catch(error){status((error as Error).message,true);}
}
el('deleteBone').onclick=deleteSelected;
window.addEventListener('keydown',event=>{const target=event.target as HTMLElement;if(event.key==='Delete'&&mode==='bone'&&!['INPUT','TEXTAREA'].includes(target?.tagName)&&!target?.isContentEditable){event.preventDefault();deleteSelected();}},true);
el('chain').onclick=()=>{if(!geometry||geometry.rigged)return;stop();snapshot();creating=true;anchorSet=tipSet=false;selected='anchor';anchor.copy(center).add(new THREE.Vector3(0,size.y/3,0));tip.copy(center).add(new THREE.Vector3(0,-size.y/3,0));endpoint('anchor');};
el('applySegments').onclick=()=>{try{
  if(!geometry||geometry.rigged||!activePath().length)throw new Error('Сначала укажите начало и конец.');const count=Number(el<HTMLInputElement>('segments').value),path=activePath();if(count===path.length-1)return;
  const fresh=createChain(anchor,tip,count);if(bones.length-path.length+fresh.length-1>26)throw new Error('В одном меше доступно до 25 точек костей.');
  const old=copyBones(bones),other=old.map((_,i)=>i).filter(i=>!path.includes(i)),remap=new Map(other.map((id,i)=>[id,i]));
  const next=other.map(i=>({...old[i],parent:old[i].parent<0?-1:remap.get(old[i].parent)!})),offset=next.length-1;
  const existing=new Set(next.map(b=>b.name));const nodes=fresh.slice(1).map((b,k)=>{let name=k===0?activeChain:`${activeChain}_${k}`;while(existing.has(name))name+='_';existing.add(name);return {...b,name,parent:k===0?0:b.parent+offset};});
  next.push(...nodes);stop();snapshot();bones=next;const touched=new Set<number>();owners.forEach((owner,i)=>{if(owner===activeChain)touched.add(i);});
  const mapped={skinIndices:skin!.skinIndices.map(id=>remap.get(id)??0),skinWeights:[...skin!.skinWeights]};skin=skinForBones(geometry,mask,bones,mapped,touched,owners);selected=offset+1;rebuild();status('Звенья этой части изменены. Остальные части сохранены.');
}catch(error){status((error as Error).message,true);}};
el<HTMLSelectElement>('chainSelect').onchange=()=>{creating=false;activeChain=el<HTMLSelectElement>('chainSelect').value;selected=activePath()[0]??'anchor';stop();syncSelection();};
el<HTMLInputElement>('chainName').onchange=()=>{if(!activeChain||creating)return;snapshot();partNames[activeChain]=el<HTMLInputElement>('chainName').value.trim()||'Часть';syncSelection();};
el<HTMLInputElement>('weight').oninput=()=>el('weightValue').textContent=el<HTMLInputElement>('weight').value+'%';
el('tabBones').onclick=()=>setMode('bone');el('tabWeights').onclick=()=>{el<HTMLInputElement>('weightHeatmap').checked=heatmapPreference;setMode('paint');};el('tabCheck').onclick=()=>{finishStroke();if(mode!=='check')stop();mode='check';showPanel('Check');syncSelection();status('Включи симуляцию и подвигай предмет.');};
el('exportMenu').onclick=()=>el('export').click();el('closeExport').onclick=()=>el<HTMLDialogElement>('exportDialog').close();
el('simulate').onclick=()=>action(async()=>{if(running){stop();status('Редактирование.');return;}while(physicsBusy)await new Promise(requestAnimationFrame);const startRevision=revision;await ensureSimulation();if(startRevision!==revision)return;running=true;syncSelection();el('simulate').textContent='Остановить симуляцию';el('simulate').classList.add('active');status(fitting.enabled?'WASD — ходьба, пробел — прыжок. Параметры можно менять на ходу.':'Тяни левой кнопкой. Колёсико вращает аксессуар, правая кнопка — камеру.');});
el('reset').onclick=()=>{finishStroke();stop();motion.set(0,0,0);yaw=0;body.position.copy(center);body.rotation.set(0,0,0);if(mesh&&bones.length)rebindRest(mesh,bones);needInit=true;syncSelection();updateMarkers();status('Положение сброшено. Кости и веса сохранены; симуляция остановлена.');};
for(const name of ['soft','damp'])el<HTMLInputElement>(name).oninput=()=>{if(geometry)projectModified=true;el(name==='soft'?'softValue':'dampValue').textContent=el<HTMLInputElement>(name).value+'%';};
el<HTMLSelectElement>('preset').onchange=()=>{if(geometry)projectModified=true;const presets:Record<string,number[]>={hair:[60,18],ears:[35,30],tail:[75,14],pendant:[20,24]};const [soft,damp]=presets[el<HTMLSelectElement>('preset').value];el<HTMLInputElement>('soft').value=String(soft);el<HTMLInputElement>('damp').value=String(damp);el('softValue').textContent=soft+'%';el('dampValue').textContent=damp+'%';needInit=true;};
el('open').onclick=()=>action(async()=>{if(!window.workshop)throw new Error('Открой приложение через Electron.');if(!confirmProjectReplacement())return;status('Загружаю аксессуар…');const result=await window.workshop.open();if(result)await load(result);});
el<HTMLFormElement>('remote').onsubmit=event=>{event.preventDefault();void action(async()=>{
  if(!window.workshop)throw new Error('Загрузка доступна в приложении.');
  if(!confirmProjectReplacement())return;
  const button=el<HTMLButtonElement>('download');button.disabled=true;button.textContent='Загружаю…';stop();
  try{status('Скачиваю предмет, меш и текстуру…');await load(await window.workshop.importReference(el<HTMLInputElement>('reference').value));}
  finally{button.disabled=false;button.textContent='Загрузить';}
});};
el('save').onclick=()=>action(async()=>{finishStroke();const saved=project(),signature=JSON.stringify(saved);const file=await window.workshop?.saveProject(saved);if(file){if(JSON.stringify(project())===signature)projectModified=false;status('Проект сохранён: '+file);}});
el('saveMesh').onclick=()=>action(async()=>{const result=await window.workshop?.saveMesh(project());if(result)status('Меш сохранён. Загрузи его как ассет и укажи полученный ID.');});
el('export').onclick=()=>action(async()=>{if(!window.workshop)throw new Error('Сохранение доступно в приложении.');finishStroke();const saved=project(),signature=JSON.stringify(saved);const result=await window.workshop.export({...saved,meshAssetId:''});if(result){if(JSON.stringify(project())===signature)projectModified=false;status('Готовый jiggle-предмет сохранён: '+result.path);}});
stage.addEventListener('dragover',event=>{event.preventDefault();stage.classList.add('drop');});stage.addEventListener('dragleave',()=>stage.classList.remove('drop'));
stage.addEventListener('drop',event=>{event.preventDefault();stage.classList.remove('drop');const file=event.dataTransfer?.files[0];if(file&&window.workshop)void action(async()=>{if(!confirmProjectReplacement())return;status('Загружаю аксессуар…');await load(await window.workshop!.importDrop(file));});});
function demo(){const geo=new THREE.CylinderGeometry(.18,.42,3,24,20,true).toNonIndexed();const p=Array.from(geo.getAttribute('position').array),n=Array.from(geo.getAttribute('normal').array),uv=Array.from(geo.getAttribute('uv').array);geo.dispose();return {name:'Учебная подвеска',warnings:[],geometry:{positions:p,normals:n,uv,indices:Array.from({length:p.length/3},(_,i)=>i),rigged:false},texture:null};}
el('demo').onclick=()=>action(async()=>{if(imported&&!geometry&&window.workshop){const geo=await window.workshop.mesh();if(geo)await load({...imported,geometry:geo,warnings:[]});}else{if(!confirmProjectReplacement())return;await load(demo());}});
new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(stage);
let previousTime=performance.now();
async function physics(dt:number){
  if(!running||!bones.length||!mesh)return;physicsPending+=dt;if(physicsBusy)return;physicsBusy=true;const frameRevision=revision;
  try{await ensureSimulation();dt=physicsPending;physicsPending=0;const position=mesh!.getWorldPosition(new THREE.Vector3());
    let result:any;
    if(settings().solver!=='legacy')result=await api.get('step')(Math.min(dt,10),position.x,position.y,position.z,yaw,worldOrientation());
    else{const steps=Math.max(1,Math.ceil(Math.min(dt,.05)/(1/60)));
    for(let i=0;i<steps;i++)result=await api.get('step')(Math.min(dt,.05)/steps,position.x,position.y,position.z,yaw,worldOrientation());}
    if(!running||!mesh||frameRevision!==revision)return;const transforms:number[]=JSON.parse(result[0]);const matrix=new THREE.Matrix4();
    mesh.skeleton.bones.forEach((bone,i)=>{const a=transforms.slice(i*12,i*12+12);matrix.set(a[3],a[4],a[5],a[0],a[6],a[7],a[8],a[1],a[9],a[10],a[11],a[2],0,0,0,1);matrix.decompose(bone.position,bone.quaternion,bone.scale);});
  }catch(error){stop();status('Симуляция остановлена: '+(error as Error).message,true);}finally{physicsBusy=false;}
}
renderer.setAnimationLoop(()=>{flushBrush();if(pendingHover){const event=pendingHover;pendingHover=null;hoverWeights(event);}const time=performance.now(),dt=Math.max(.001,(time-previousTime)/1000);previousTime=time;if(fitting.enabled)updateFitting(dt);if(!fitting.shiftLock)controls.update();updateMarkers();void physics(dt);renderer.render(scene,camera);});

if(window.workshop?.testMode)window.workshopInspect=()=>{
  mesh?.updateWorldMatrix(true,true);mesh?.updateMatrixWorld(true);mesh?.skeleton.update();
  return {project:project(),running,fitting:{enabled:fitting.enabled,shiftLock:fitting.shiftLock,position:fitting.rig.position.toArray(),yaw:fitting.yaw,keys:[...fitting.keys]},boneMarkersVisible:boneMarkers.visible,motion:motion.toArray(),yaw,cameraWorld:camera.matrixWorld.toArray(),cameraProjection:camera.projectionMatrix.toArray(),cameraTarget:controls.target.toArray(),cameraLimits:[controls.minDistance,controls.maxDistance],meshWorld:mesh?.matrixWorld.toArray(),worldBones:mesh?.skeleton.bones.map(b=>b.getWorldPosition(new THREE.Vector3()).toArray()),worldVertices:geometry?.positions.filter((_,i)=>i%3===0).map((_,i)=>mesh!.localToWorld(mesh!.getVertexPosition(i,new THREE.Vector3())).toArray()),markerPositions:boneMarkers.children.map(m=>m.position.toArray())};
};



el<HTMLInputElement>('bendLimit').oninput=()=>{if(geometry)projectModified=true;el('bendLimitValue').textContent=el<HTMLInputElement>('bendLimit').value+'°';};

// Use the existing exported wind attributes; never animate the mesh separately.
el<HTMLInputElement>('softWind').onchange=()=>{
 if(geometry)snapshot();
 const enabled=el<HTMLInputElement>('softWind').checked;
 el<HTMLInputElement>('windInfluence').value=enabled?'0.15':'0';
 if(enabled){el<HTMLInputElement>('windStrength').value='0.4';el<HTMLInputElement>('windSpeed').value='1.5';}
};
for(const id of ['motionMode','useGravity'])el(id).addEventListener('change',()=>{if(geometry)projectModified=true;});
for(const [id]of motionFields)el<HTMLInputElement>(id).oninput=()=>{if(geometry)projectModified=true;};
el<HTMLInputElement>('tryOn').onchange=()=>void action(async()=>{
 if(!el<HTMLInputElement>('tryOn').checked){stop();return;}
 if(!mesh||!bones.length||geometry?.rigged){el<HTMLInputElement>('tryOn').checked=false;status('Сначала добавь кости и веса.');return;}
 while(physicsBusy)await new Promise(requestAnimationFrame);
 try{startFitting();await ensureSimulation();running=true;syncSelection();el('simulate').textContent='Остановить симуляцию';el('simulate').classList.add('active');status('Кликни по сцене: WASD — ходьба, пробел — прыжок.');}catch(e){stop();throw e;}
});
el('fittingHome').onclick=()=>{const old=fitting.rig.position.clone();fitting.reset();camera.position.sub(old);controls.target.sub(old);updateFitting(0);needInit=true;renderer.domElement.focus();};
el('fittingShiftLock').onclick=()=>void toggleFittingLock();
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==renderer.domElement){setFittingLock(false);fitting.keys.clear();}});
document.addEventListener('mousemove',event=>{if(fitting.shiftLock&&(document.pointerLockElement===renderer.domElement||document.activeElement===renderer.domElement&&event.target===renderer.domElement)){lockYaw-=event.movementX*.0025;lockPitch=THREE.MathUtils.clamp(lockPitch+event.movementY*.0025,-.8,1.2);}});
window.addEventListener('keydown',event=>{
 if(!fitting.enabled||event.target!==renderer.domElement||event.ctrlKey||event.metaKey||event.altKey)return;
 if(event.code==='Escape'&&fitting.shiftLock){event.preventDefault();setFittingLock(false);return;}
 if(['ShiftLeft','ShiftRight'].includes(event.code)){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)void toggleFittingLock();return;}
 if(['KeyW','KeyA','KeyS','KeyD','Space'].includes(event.code)){event.preventDefault();event.stopImmediatePropagation();fitting.keys.add(event.code);if(event.code==='Space'&&!event.repeat)fitting.jump();}
},true);
window.addEventListener('keyup',event=>{fitting.keys.delete(event.code);});
window.addEventListener('blur',()=>fitting.keys.clear());
renderer.domElement.addEventListener('blur',()=>fitting.keys.clear());

el<HTMLSelectElement>('physicsSolver').onchange=()=>{
 const resume=running,tryOn=fitting.enabled;stop();if(geometry)projectModified=true;
 el<HTMLInputElement>('elasticity').max=el<HTMLSelectElement>('physicsSolver').value==='v2-sync'?'12':'1';
 el('solverNote').hidden=el<HTMLSelectElement>('physicsSolver').value!=='v2-sync';needInit=true;
 if(tryOn){el<HTMLInputElement>('tryOn').checked=true;el('tryOn').dispatchEvent(new Event('change'));}else if(resume)el('simulate').click();
};





// Wave controls edit the selected part in one action; storage stays per bone.
ribbonUi.className='bone-wave-settings';
for(const parent of [windUi,capeUi,ribbonUi])for(const box of Array.from(parent.querySelectorAll('input[type=checkbox]')))box.parentElement!.classList.add('toggle');
function refreshRibbonSelection(){
 const path=activePath();
 const valid=!creating&&path.length>0;
 const direction=ribbonBones===null?legacyWave:path.map(i=>ribbonBones![bones[i].name]).find(Boolean);
 el<HTMLInputElement>('ribbonWind').disabled=!valid;
 if(ribbonBones!==null)el<HTMLInputElement>('ribbonWind').checked=!!direction;
 el<HTMLSelectElement>('ribbonDirection').disabled=!valid||!direction;
 if(direction)el<HTMLSelectElement>('ribbonDirection').value=direction;
}
function editRibbon(){
 const targets=activePath();if(creating||!targets.length)return;
 snapshot();
 // First local edit migrates an old whole-item wave without disabling other bones.
 if(ribbonBones===null){ribbonBones={};if(legacyWave)for(const b of bones.slice(1))ribbonBones[b.name]=legacyWave;}
 for(const i of targets){if(el<HTMLInputElement>('ribbonWind').checked)ribbonBones[bones[i].name]=el<HTMLSelectElement>('ribbonDirection').value;else delete ribbonBones[bones[i].name];}
 revision++;projectModified=true;refreshRibbonSelection();
}
el('ribbonWind').addEventListener('change',()=>editRibbon());
el('ribbonDirection').addEventListener('change',()=>editRibbon());


// Electron's main process owns the confirmation for every window-close route.
window.addEventListener('beforeunload',event=>{
 finishStroke();
 if(geometry&&projectModified){event.preventDefault();event.returnValue='';}
});
el('assetId').addEventListener('input',()=>{if(geometry)projectModified=true;});
