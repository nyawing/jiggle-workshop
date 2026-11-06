import * as THREE from 'three';
export type GeometryData={positions:number[];normals:number[];uv:number[];indices:number[];rigged:boolean};
export type BoneData={name:string;parent:number;position:number[];rotation:number[]};
export type SkinData={skinIndices:number[];skinWeights:number[]};
export function copyBones(bones:BoneData[]):BoneData[]{return bones.map(b=>({...b,position:[...b.position],rotation:[...b.rotation]}));}
// Split an edge without straightening a bent chain or moving its other points.
// Parent-first insertion also preserves the native export hierarchy ordering.
export function insertRestPoint(geometry:GeometryData,bones:BoneData[],child:number,mask:Float32Array,owners:string[],skin:SkinData){
  if(geometry.rigged)throw new Error('Существующий риг доступен только для осмотра.');
  if(!Number.isInteger(child)||child<1||child>=bones.length||bones[child].parent<1)throw new Error('Выберите сегмент цепочки.');
  if(bones.length>=26)throw new Error('Достигнут предел 25 точек костей.');
  const parent=bones[child].parent,start=new THREE.Vector3().fromArray(bones[parent].position),end=new THREE.Vector3().fromArray(bones[child].position);
  if(start.distanceTo(end)<.02)throw new Error('Сегмент слишком короткий для новой точки.');
  const path=chainPaths(bones).find(p=>p.includes(child))!,root=bones[path[0]].name;
  let n=1;while(bones.some(b=>b.name===`Bend${n}`))n++;
  const next=copyBones(bones);next.forEach(b=>{if(b.parent>=child)b.parent++;});
  next.splice(child,0,{name:`Bend${n}`,parent,position:start.lerp(end,.5).toArray(),rotation:[...bones[child].rotation]});
  next[child+1].parent=child;
  const previous={skinIndices:skin.skinIndices.map(i=>i>=child?i+1:i),skinWeights:[...skin.skinWeights]};
  const touched=new Set<number>();owners.forEach((owner,i)=>{if(owner===root)touched.add(i);});
  return {bones:next,skin:skinForBones(geometry,mask,next,previous,touched,owners),selected:child};
}
export function chainPaths(bones:BoneData[]):number[][]{
  return bones.flatMap((b,i)=>b.parent===0?[i]:[]).map(root=>{
    const path=[root];let child:number;
    while((child=bones.findIndex(b=>b.parent===path[path.length-1]))!==-1)path.push(child);
    return path;
  });
}
export function appendChain(bones:BoneData[],start:THREE.Vector3,end:THREE.Vector3,segments=1):BoneData[]{
  const fresh=createChain(start,end,segments);
  if(!bones.length)return fresh;
  if(bones.length+fresh.length-1>26)throw new Error('В одном меше доступно до 25 точек костей.');
  let suffix=2;while(bones.some(b=>b.name===`JiggleRoot${suffix}`))suffix++;
  const offset=bones.length-1;
  return [...copyBones(bones),...fresh.slice(1).map((b,i)=>({...b,name:i===0?`JiggleRoot${suffix}`:`Jiggle${suffix}_${i}`,parent:i===0?0:b.parent+offset}))];
}
// Rest positions are mesh-local absolute coordinates. Rebuild the bind pose after
// editing them, keeping geometry and weights intact. RigidRoot is never editable.
export function moveRestBone(bones:BoneData[],index:number,position:THREE.Vector3):BoneData[]{
  if(index<1||index>=bones.length)throw new Error('Выберите кость цепочки.');
  if(!position.toArray().every(n=>Number.isFinite(n)&&Math.abs(n)<10000))throw new Error('Некорректные координаты.');
  const next=copyBones(bones);next[index].position=position.toArray();
  const path=chainPaths(next).find(p=>p.includes(index))!;
  for(const [k,i] of path.entries()){
    const from=new THREE.Vector3().fromArray(next[i].position);
    const to=new THREE.Vector3().fromArray(next[path[k===path.length-1?k-1:k+1]].position);
    const direction=k===path.length-1?from.sub(to):to.sub(from);
    if(direction.length()<.01)throw new Error('Соседние кости должны быть на расстоянии не менее 0.01.');
    const m=new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize())).elements;
    next[i].rotation=[m[0],m[4],m[8],m[1],m[5],m[9],m[2],m[6],m[10]];
  }
  return next;
}
export function createChain(start:THREE.Vector3,end:THREE.Vector3,segments=1):BoneData[]{
  if(!Number.isInteger(segments)||segments<1||segments>24)throw new Error('Число звеньев должно быть от 1 до 24.');
  if(start.distanceTo(end)/segments<0.01)throw new Error('Крепление и конец цепочки слишком близко.');
  const orientation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(start).normalize());
  const m=new THREE.Matrix4().makeRotationFromQuaternion(orientation).elements;
  const rotation=[m[0],m[4],m[8],m[1],m[5],m[9],m[2],m[6],m[10]];
  const bones:BoneData[]=[{name:'RigidRoot',parent:-1,position:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1]}];
  // One editor bone is a segment with a start and end. The stationary skin root
  // stays internal; SmartBone receives its usual root/tip Bone nodes.
  for(let i=0;i<=segments;i++)bones.push({name:i===0?'JiggleRoot':`Jiggle${i}`,parent:i,position:start.clone().lerp(end,i/segments).toArray(),rotation:[...rotation]});
  return bones;
}
export function skinForChain(geometry:GeometryData,mask:Float32Array,start:THREE.Vector3,end:THREE.Vector3){
  return skinForBones(geometry,mask,createChain(start,end));
}
// Conservative mesh-local proximity binding. Root vertices and distant surfaces
// stay rigid; nearest chain owns each flexible vertex. Does not edit rest pose.
export function automaticWeights(geometry:GeometryData,bones:BoneData[],strength=1){
  if(geometry.rigged)throw new Error('Автовеса не заменяют существующий риг.');
  const paths=chainPaths(bones);
  if(!paths.length||paths.some(p=>p.length<2))throw new Error('Сначала создайте кости.');
  if(!Number.isFinite(strength)||strength<0||strength>1)throw new Error('Некорректная сила веса.');
  const chains=paths.map(path=>{
    const points=path.map(i=>new THREE.Vector3().fromArray(bones[i].position));
    const lengths=points.slice(1).map((p,i)=>p.distanceTo(points[i]));
    if(lengths.some(n=>!Number.isFinite(n)||n<.01))throw new Error('Соседние кости слишком близко.');
    return {path,points,lengths,total:lengths.reduce((a,b)=>a+b,0)};
  });
  const mask=new Float32Array(geometry.positions.length/3),owners=Array<string>(mask.length).fill('');
  const smooth=(t:number)=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
  for(let i=0;i<mask.length;i++){
    const point=new THREE.Vector3().fromArray(geometry.positions,i*3);
    let best=Infinity,weight=0,owner='';
    for(const chain of chains){
      let walked=0;
      const radius=chain.total*.35;
      for(let j=0;j<chain.lengths.length;j++){
        const start=chain.points[j],delta=chain.points[j+1].clone().sub(start);
        const t=THREE.MathUtils.clamp(point.clone().sub(start).dot(delta)/delta.lengthSq(),0,1);
        const distance=point.distanceTo(start.clone().addScaledVector(delta,t));
        // Compare scale-relative distances so short ears do not lose to long tails.
        const score=distance/radius;
        if(score<1&&score<best){
          best=score;owner=bones[chain.path[0]].name;
          weight=strength*(1-smooth(score))*smooth((walked+t*chain.lengths[j])/(chain.total*.3));
        }
        walked+=chain.lengths[j];
      }
    }
    mask[i]=weight;if(weight>1e-7)owners[i]=owner;else mask[i]=0;
  }
  return {mask,owners,skin:skinForBones(geometry,mask,bones,undefined,undefined,owners)};
}
// Only a brush's touched vertices are recalculated. Rest edits never call this.
export function skinForBones(geometry:GeometryData,mask:Float32Array,bones:BoneData[],previous?:SkinData,touched?:Set<number>,owners?:string[]):SkinData{
  const ids:number[]=[],weights:number[]=[];
  const paths=chainPaths(bones),roots=new Map(paths.map(p=>[bones[p[0]].name,p]));
  for(let i=0;i<geometry.positions.length/3;i++){
    if(previous&&touched&&!touched.has(i)){ids.push(...previous.skinIndices.slice(i*4,i*4+4));weights.push(...previous.skinWeights.slice(i*4,i*4+4));continue;}
    const point=new THREE.Vector3().fromArray(geometry.positions,i*3);
    const m=THREE.MathUtils.clamp(mask[i],0,1);
    // Zero flexible weight is 100% rigid influence, not a zero-sum skin row.
    const path=owners?roots.get(owners[i]):undefined;
    if(m===0||(owners&&!path)){ids.push(0,0,0,0);weights.push(1,0,0,0);continue;}
    let lo=1,hi=2,blend=0,best=Infinity;
    for(const j of (path??paths.flat()).filter(j=>bones[j].parent>0)){
      const parent=bones[j].parent;
      const start=new THREE.Vector3().fromArray(bones[parent].position),direction=new THREE.Vector3().fromArray(bones[j].position).sub(start);
      const t=THREE.MathUtils.clamp(point.clone().sub(start).dot(direction)/Math.max(direction.lengthSq(),1e-12),0,1);
      const distance=point.distanceToSquared(start.addScaledVector(direction,t));
      if(distance<best){best=distance;lo=parent;hi=j;blend=t;}
    }
    ids.push(0,lo,hi,0);weights.push(1-m,m*(1-blend),m*blend,0);
  }
  return {skinIndices:ids,skinWeights:weights};
}
export function makeSkinned(geometry:GeometryData,bones:BoneData[],skin:{skinIndices:number[];skinWeights:number[]},material:THREE.Material){
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(geometry.positions,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(geometry.normals,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(geometry.uv,2));
  geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skin.skinIndices,4));
  geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skin.skinWeights,4));
  geo.setIndex(geometry.indices);geo.computeBoundingBox();geo.computeBoundingSphere();
  const mesh=new THREE.SkinnedMesh(geo,material);const nodes=bones.map(()=>new THREE.Bone());
  const matrices=bones.map(b=>{const r=b.rotation,p=b.position;return new THREE.Matrix4().set(r[0],r[1],r[2],p[0],r[3],r[4],r[5],p[1],r[6],r[7],r[8],p[2],0,0,0,1);});
  bones.forEach((b,i)=>{nodes[i].name=b.name;const local=b.parent<0?matrices[i]:matrices[b.parent].clone().invert().multiply(matrices[i]);local.decompose(nodes[i].position,nodes[i].quaternion,nodes[i].scale);if(b.parent>=0)nodes[b.parent].add(nodes[i]);else mesh.add(nodes[i]);});
  mesh.bind(new THREE.Skeleton(nodes,matrices.map(m=>m.clone().invert())),new THREE.Matrix4());mesh.updateMatrixWorld(true);mesh.skeleton.update();mesh.frustumCulled=false;
  return mesh;
}
export function rebindRest(mesh:THREE.SkinnedMesh,bones:BoneData[]){
  const matrices=bones.map(b=>{const r=b.rotation,p=b.position;return new THREE.Matrix4().set(r[0],r[1],r[2],p[0],r[3],r[4],r[5],p[1],r[6],r[7],r[8],p[2],0,0,0,1);});
  bones.forEach((b,i)=>{
    const local=b.parent<0?matrices[i]:matrices[b.parent].clone().invert().multiply(matrices[i]);
    local.decompose(mesh.skeleton.bones[i].position,mesh.skeleton.bones[i].quaternion,mesh.skeleton.bones[i].scale);
  });
  // Keep bind matrices in mesh coordinates, independent of the editor's body
  // translation/yaw. Skeleton.pose() assumes a non-Bone parent has identity;
  // capturing scene-world inverses here would move RigidRoot on reset.
  mesh.skeleton.boneInverses=matrices.map(m=>m.clone().invert());
  mesh.bind(mesh.skeleton,new THREE.Matrix4());mesh.updateWorldMatrix(true,false);mesh.updateMatrixWorld(true);mesh.skeleton.update();
}

// Remove one flexible node, retaining the absolute rest frames of survivors.
// Only indices need remapping: weights and the painted mask stay unchanged.
export function deleteRestBone(bones:BoneData[],index:number,skin:SkinData):{bones:BoneData[];skin:SkinData|null}{
  if(index<1||index>=bones.length)throw new Error('Выберите кость для удаления.');
  const path=chainPaths(bones).find(p=>p.includes(index))!;
  const removedIds=new Set(path.length===2?path:[index]);
  if(removedIds.size===bones.length-1)return {bones:[],skin:null};
  const kept=bones.map((_,i)=>i).filter(i=>!removedIds.has(i)),remap=new Map(kept.map((old,i)=>[old,i]));
  const next=kept.map(i=>({...copyBones([bones[i]])[0],parent:bones[i].parent}));
  next.forEach(b=>{let parent=b.parent;while(removedIds.has(parent))parent=bones[parent].parent;b.parent=parent<0?-1:remap.get(parent)!;});
  if(path.length>2&&index===path[0])next[remap.get(path[1])!].name=bones[index].name;
  for(let i=1;i<next.length;i++)if(next[i].parent>0&&new THREE.Vector3().fromArray(next[i].position).distanceTo(new THREE.Vector3().fromArray(next[next[i].parent].position))<.01)throw new Error('После удаления соседние точки совпадут. Сначала передвиньте одну из них.');
  const removed=new THREE.Vector3().fromArray(bones[index].position);let replacement=1,distance=Infinity;
  for(const old of path.filter(i=>!removedIds.has(i))){const i=remap.get(old)!;const d=removed.distanceToSquared(new THREE.Vector3().fromArray(next[i].position));if(d<distance){distance=d;replacement=i;}}
  const rows={skinIndices:[...skin.skinIndices],skinWeights:[...skin.skinWeights]};
  for(let i=0;i<rows.skinIndices.length;i+=4){
    if(path.length===2&&rows.skinIndices.slice(i,i+4).some((id,k)=>removedIds.has(id)&&rows.skinWeights[i+k]>0)){rows.skinIndices.splice(i,4,0,0,0,0);rows.skinWeights.splice(i,4,1,0,0,0);}
    else for(let k=0;k<4;k++)rows.skinIndices[i+k]=removedIds.has(skin.skinIndices[i+k])?replacement:remap.get(skin.skinIndices[i+k])!;
  }
  return {bones:next,skin:rows};
}

// Reflect a complete chain around a mesh-local symmetry plane. Conjugate
// handedness with a local X reflection so exported rotations remain proper.
export function mirrorChain(bones:BoneData[],selected:number,axis:0|1|2,plane:number){
  const path=chainPaths(bones).find(p=>p.includes(selected));
  if(!path)throw new Error('Выберите цепочку.');
  if(bones.length+path.length>26)throw new Error('Зеркальная цепочка превысит предел 25 точек.');
  if(!Number.isFinite(plane))throw new Error('Некорректная плоскость симметрии.');
  const next=copyBones(bones),indices=new Map<number,number>();
  for(const i of path){
    const b=bones[i],position=[...b.position];position[axis]=2*plane-position[axis];
    const rotation=b.rotation.map((v,k)=>v*(Math.floor(k/3)===axis?-1:1)*(k%3===0?-1:1));
    let name=b.name+'_Mirror',n=2;while(next.some(x=>x.name===name))name=b.name+'_Mirror'+n++;
    indices.set(i,next.length);next.push({name,parent:b.parent===0?0:indices.get(b.parent)!,position,rotation});
  }
  return {bones:next,root:indices.get(path[0])!};
}
