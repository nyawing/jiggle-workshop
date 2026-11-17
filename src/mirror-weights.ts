import {chainPaths, skinForBones} from './model';
import type {BoneData, GeometryData, SkinData} from './model';

export type MirrorWeightsResult = {
  mask: Float32Array; owners: string[]; skin: SkinData;
  matched: number; unmatched: number; protectedVertices: number;
};

/** Копируем скалярное поле весов относительно плоскости в координатах меша. Счётчики относятся только к вершинам целевой половины. Вершины без пары сохраняют прежние значения; успешный вызов не доказывает симметрию меша или цепочек. */
export function mirrorWeights(geometry: GeometryData, mask: Float32Array, owners: string[],
  bones: BoneData[], sourceChain: string, targetChain: string, axis: 0|1|2,
  plane: number, tolerance?: number): MirrorWeightsResult {
  const p = geometry.positions, count = p.length / 3;
  if (!Number.isInteger(count) || count > 100000 || !(mask instanceof Float32Array) ||
      mask.length !== count || owners.length !== count) throw new RangeError('Некорректные данные вершин. Допускается не более 100 000 вершин.');
  if (![0,1,2].includes(axis) || !Number.isFinite(plane) ||
      (tolerance !== undefined && (!Number.isFinite(tolerance) || tolerance < 0)))
    throw new RangeError('Некорректная ось, плоскость или точность отражения.');
  if (!p.every(Number.isFinite) || !Array.from(mask).every(v => Number.isFinite(v) && v >= 0 && v <= 1) ||
      owners.some(v => typeof v !== 'string') ||
      geometry.indices.some(i => !Number.isInteger(i) || i < 0 || i >= count))
    throw new RangeError('Некорректные координаты, веса, привязки к цепочкам или номера вершин.');
  const names = new Set<string>();
  if (!bones.length || bones.length > 26) throw new RangeError('Недопустимое количество костей.');
  bones.forEach((b,i) => {
    if (!b.name || names.has(b.name) || !Number.isInteger(b.parent) ||
        (i === 0 ? b.parent !== -1 : b.parent < 0 || b.parent >= i) ||
        b.position.length !== 3 || !b.position.every(Number.isFinite) ||
        b.rotation.length !== 9 || !b.rotation.every(Number.isFinite))
      throw new RangeError('Некорректные имена, номера или преобразования костей.');
    names.add(b.name);
  });
  const paths = chainPaths(bones), roots = new Map(paths.map(path => [bones[path[0]].name,path]));
  const source = roots.get(sourceChain), target = roots.get(targetChain);
  if (!sourceChain || !targetChain || sourceChain === targetChain || !source || !target ||
      source.length < 2 || target.length < 2 || owners.some(v => v !== '' && !roots.has(v)))
    throw new RangeError('Неизвестные или некорректные имена цепочек.');
  let side = bones[source[0]].position[axis] - plane;
  if (side === 0) side = source.reduce((sum,i) => sum + (bones[i].position[axis] - plane) / source.length, 0);
  if (!Number.isFinite(side) || side === 0) throw new RangeError('Исходная цепочка лежит в плоскости отражения.');
  const sign = Math.sign(side);
  let targetSide=bones[target[0]].position[axis]-plane;
  if(targetSide===0)targetSide=target.reduce((sum,i)=>sum+(bones[i].position[axis]-plane)/target.length,0);
  if(!Number.isFinite(targetSide)||targetSide*sign>=0)throw new RangeError('Цепочка назначения должна находиться по другую сторону плоскости отражения.');
  const low = [Infinity,Infinity,Infinity], high = [-Infinity,-Infinity,-Infinity];
  for (let i=0;i<p.length;i++) { const a=i%3; low[a]=Math.min(low[a],p[i]); high[a]=Math.max(high[a],p[i]); }
  const radius = tolerance ?? (count ? Math.max(...high.map((v,a)=>v-low[a]))*.002+1e-6 : 1e-6);
  if (!Number.isFinite(radius)) throw new RangeError('Размер меша выходит за допустимые пределы.');
  // Точно совпадающие копии шва используют минимальный допустимый индекс исходной вершины. Поиск в ячейках выполняется сбалансированными пространственными деревьями, без полного перебора плотной ячейки для каждой цели, включая многочисленные дубли UV-швов.
  type Node = {id:number; axis:number; left?:Node; right?:Node};
  const grid = new Map<string,number[]>(), trees = new Map<string,Node|undefined>();
  const cell = (v:number) => radius === 0 ? v : Math.floor(v/radius);
  const key = (v:number[]) => v.join(',');
  const unique = new Set<string>();
  for (let i=0;i<count;i++) {
    if ((p[i*3+axis]-plane)*sign <= 0 || (owners[i] !== sourceChain && owners[i] !== '')) continue;
    const point=p.slice(i*3,i*3+3), exact=key(point);
    if (unique.has(exact)) continue;
    unique.add(exact);
    const k=key(point.map(cell)), bucket=grid.get(k);
    if (bucket) bucket.push(i); else grid.set(k,[i]);
  }
  function build(ids:number[], depth=0):Node|undefined {
    if (!ids.length) return undefined;
    const a=depth%3; ids.sort((i,j)=>p[i*3+a]-p[j*3+a] || i-j);
    const middle=ids.length>>1;
    return {id:ids[middle],axis:a,left:build(ids.slice(0,middle),depth+1),right:build(ids.slice(middle+1),depth+1)};
  }
  const nextMask=mask.slice(), nextOwners=owners.slice();
  let matched=0, unmatched=0, protectedVertices=0;
  for (let i=0;i<count;i++) {
    if ((p[i*3+axis]-plane)*sign >= 0) continue;
    if (owners[i] !== targetChain && owners[i] !== '') { protectedVertices++; continue; }
    const point=p.slice(i*3,i*3+3); point[axis]=plane+(plane-point[axis]);
    if (!point.every(Number.isFinite)) throw new RangeError('Отражённая точка выходит за допустимые пределы.');
    let best=-1, distance=radius;
    function visit(node:Node|undefined):void {
      if (!node) return;
      const id=node.id, d=Math.hypot(...point.map((v,a)=>v-p[id*3+a]));
      if (d<distance || (d===distance && (best<0 || id<best))) { best=id; distance=d; }
      const delta=point[node.axis]-p[id*3+node.axis];
      visit(delta<=0?node.left:node.right);
      if (Math.abs(delta)<=distance) visit(delta<=0?node.right:node.left);
    }
    const c=point.map(cell), offsets=radius===0?[0]:[-1,0,1];
    for (const x of offsets) for (const y of offsets) for (const z of offsets) {
      const k=key([c[0]+x,c[1]+y,c[2]+z]);
      if (!trees.has(k)) trees.set(k,build(grid.get(k) ?? []));
      visit(trees.get(k));
    }
    if (best<0) { unmatched++; continue; }
    nextMask[i]=owners[best] === '' ? 0 : mask[best];
    nextOwners[i]=nextMask[i] === 0 ? '' : targetChain;
    matched++;
  }
  return {mask:nextMask,owners:nextOwners,skin:skinForBones(geometry,nextMask,bones,undefined,undefined,nextOwners),
    matched,unmatched,protectedVertices};
}
