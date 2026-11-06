import * as THREE from 'three';
import type {GeometryData} from './model';
import type {SurfaceGraph} from './brush';

/** CSS-pixel projection and brush queries. Call update before querying or hovering.
 * x/y are CSS pixels, z is NDC depth (-1 near, +1 far). point returns undefined
 * for clipped, isolated, culled, or occluded vertices. Arrays retain all projected
 * coordinates; use point when hover must obey the brush's visibility rules.
 * GeometryData supplies stable vertex IDs; mesh geometry supplies current indices
 * and posed positions. No raycasts are used. Mark changed attributes needsUpdate.
 */
export class WeightProjection {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  private eligible: Uint8Array;
  private grid = new Map<string, number[]>();
  private signature = '';
  private mesh?: THREE.SkinnedMesh;
  private buffer?: THREE.BufferGeometry;
  private graph?: SurfaceGraph;
  private readonly cellSize = 32;
  private identities = new WeakMap<object, number>();
  private nextIdentity = 0;

  private identity(value: object): number {
    let id=this.identities.get(value);
    if(id===undefined) {id=++this.nextIdentity;this.identities.set(value,id);}
    return id;
  }

  constructor(private readonly geometry: GeometryData) {
    const count = geometry.positions.length / 3;
    this.x = new Float64Array(count);
    this.y = new Float64Array(count);
    this.z = new Float64Array(count);
    this.x.fill(NaN); this.y.fill(NaN); this.z.fill(NaN);
    this.eligible = new Uint8Array(count);
  }

  point(index: number): {x: number; y: number; z: number} | undefined {
    return this.eligible[index] ? {x: this.x[index], y: this.y[index], z: this.z[index]} : undefined;
  }

  /** Rebuild only when transforms, pose, geometry versions, viewport, material
   * sides/groups, index identity/version, draw range, or component selection change.
   * through skips both depth visibility and sidedness, retaining isolation.
   */
  update(mesh: THREE.SkinnedMesh, camera: THREE.Camera, widthCSS: number, heightCSS: number,
    through: boolean, visibleComponents?: Set<number>, graph?: SurfaceGraph, restPose = false): void {
    mesh.updateWorldMatrix(true, false);
    // SkinnedMesh refreshes bindMatrixInverse in updateMatrixWorld (the base
    // updateWorldMatrix path alone does not run that override).
    mesh.updateMatrixWorld(true);
    camera.updateWorldMatrix(true, false);
    // Skeleton.update normally runs during rendering; update here for queries
    // between a bone edit and the next render.
    if (mesh.skeleton) {
      for (const bone of mesh.skeleton.bones) bone.updateWorldMatrix(true, false);
      mesh.skeleton.update();
    }
    const bg = mesh.geometry, index = bg.index;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const attrs = Object.entries(bg.attributes).filter(([name]) => restPose ? name==='position' : ['position','skinIndex','skinWeight'].includes(name)).map(([name, a]) => `${name}:${this.identity(a)}:${a.count}:${'version' in a ? a.version : a.data.version}`).join('|');
    const signature = [widthCSS, heightCSS, through, restPose, ...mesh.matrixWorld.elements,
      ...camera.matrixWorldInverse.elements, ...camera.projectionMatrix.elements,
      ...mesh.bindMatrix.elements, ...mesh.bindMatrixInverse.elements,
      !restPose&&mesh.skeleton?.boneMatrices ? Array.from(mesh.skeleton.boneMatrices).join(',') : '',
      mesh.morphTargetInfluences?.join(','), attrs,
      Object.values(bg.morphAttributes).flat().map(a => `${this.identity(a)}:${'version' in a ? a.version : a.data.version}`).join(','),
      index ? `${this.identity(index)}:${index.count}:${index.version}` : 'unindexed',
      bg.drawRange.start, bg.drawRange.count,
      bg.groups.map(g => `${g.start}:${g.count}:${g.materialIndex}`).join('|'),
      materials.map(m => `${m.side}:${m.visible}`).join('|'),
      visibleComponents ? [...visibleComponents].sort((a,b) => a-b).join(',') : '*'].join(';');
    if (this.mesh === mesh && this.buffer === bg && this.graph === graph && this.signature === signature) return;
    this.mesh = mesh; this.buffer = bg; this.graph = graph; this.signature = signature;
    this.grid.clear(); this.eligible.fill(0);
    this.x.fill(NaN); this.y.fill(NaN); this.z.fill(NaN);
    if (!(widthCSS > 0 && heightCSS > 0 && Number.isFinite(widthCSS + heightCSS))) return;
    const width = Math.ceil(widthCSS), height = Math.ceil(heightCSS);
    const clips: THREE.Vector4[] = [], candidates = new Uint8Array(this.x.length);
    const transform = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
    const p = new THREE.Vector3();
    const selected = (v: number) => !visibleComponents || !!graph && visibleComponents.has(graph.components[graph.nodes[v]]);
    for (let i = 0; i < this.x.length; i++) {
      if(restPose)p.fromBufferAttribute(bg.getAttribute('position'),i);else mesh.getVertexPosition(i, p);
      const c = new THREE.Vector4(p.x,p.y,p.z,1).applyMatrix4(transform); clips.push(c);
      if (c.w <= 0) continue;
      this.x[i] = (c.x / c.w + 1) * widthCSS / 2;
      this.y[i] = (1 - c.y / c.w) * heightCSS / 2;
      this.z[i] = c.z / c.w;
    }
    const depth = through ? undefined : new Float64Array(width * height).fill(Infinity);
    const tolerance = through ? undefined : new Float64Array(width * height);
    const length = index?.count ?? bg.getAttribute('position').count;
    const at = (i: number) => index ? index.getX(i) : i;
    const ranges = Array.isArray(mesh.material) ? bg.groups : [{start:0,count:length,materialIndex:0}];
    for (const group of ranges) {
      const material = materials[group.materialIndex ?? 0];
      if (!material || !material.visible) continue;
      const start = Math.max(group.start, bg.drawRange.start);
      const end = Math.min(length, group.start + group.count, bg.drawRange.start + bg.drawRange.count);
      for (let t = start; t + 2 < end; t += 3) {
        const ids = [at(t),at(t+1),at(t+2)];
        if (ids.some(i => i >= clips.length || !selected(i))) continue;
        if (through) { for (const i of ids) candidates[i] = 1; continue; }
        // Homogeneous clipping keeps triangles crossing the camera/near plane
        // from generating huge or inverted screen bounds.
        let polygon = ids.map(i => clips[i]);
        for (const plane of [ (v:THREE.Vector4)=>v.w+v.x, (v:THREE.Vector4)=>v.w-v.x,
          (v:THREE.Vector4)=>v.w+v.y, (v:THREE.Vector4)=>v.w-v.y,
          (v:THREE.Vector4)=>v.w+v.z, (v:THREE.Vector4)=>v.w-v.z ]) {
          const output: THREE.Vector4[] = [];
          for (let j=0;j<polygon.length;j++) {
            const a=polygon[j], b=polygon[(j+1)%polygon.length], da=plane(a), db=plane(b);
            if (da>=0) output.push(a);
            if ((da>=0)!==(db>=0)) output.push(a.clone().lerp(b,da/(da-db)));
          }
          polygon=output;
          if (!polygon.length) break;
        }
        for (let j=1;j+1<polygon.length;j++) {
          const tri=[polygon[0],polygon[j],polygon[j+1]].map(v=>({x:(v.x/v.w+1)*widthCSS/2,y:(1-v.y/v.w)*heightCSS/2,z:v.z/v.w}));
          const [a,b,c]=tri;
          const area=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
          // CSS y points downward. Account for mirrored world transforms just
          // as WebGLRenderer does when it sets the front-face winding.
          const front=area * (mesh.matrixWorld.determinant()<0 ? -1 : 1)<0;
          if (!Number.isFinite(area) || Math.abs(area)<1e-12 ||
            (material.side===THREE.FrontSide&&!front)||(material.side===THREE.BackSide&&front)) continue;
          for (const i of ids) candidates[i]=1;
          const dzdx=((b.z-a.z)*(c.y-a.y)-(c.z-a.z)*(b.y-a.y))/area;
          const dzdy=((b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z))/area;
          const tol=1e-5+1.5*(Math.abs(dzdx)+Math.abs(dzdy));
          const minX=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))), maxX=Math.min(width-1,Math.floor(Math.max(a.x,b.x,c.x)));
          const minY=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))), maxY=Math.min(height-1,Math.floor(Math.max(a.y,b.y,c.y)));
          for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
            const px=x+.5,py=y+.5;
            const u=((b.x-px)*(c.y-py)-(b.y-py)*(c.x-px))/area;
            const v=((c.x-px)*(a.y-py)-(c.y-py)*(a.x-px))/area;
            if(u < -1e-9 || v < -1e-9 || u+v>1+1e-9) continue;
            const z=a.z+dzdx*(px-a.x)+dzdy*(py-a.y), offset=y*width+x;
            if(z<depth![offset]) {depth![offset]=z;tolerance![offset]=tol;}
          }
        }
      }
    }
    for(let i=0;i<this.x.length;i++) {
      const x=this.x[i],y=this.y[i],z=this.z[i];
      if(!candidates[i] || !Number.isFinite(x+y+z) || z < -1 || z > 1 || x<0 || y<0 || x>widthCSS || y>heightCSS) continue;
      let visible=through, sampled=false;
      // Vertex locations lie on triangle edges (including duplicated UV seams).
      // Nearby pixel centers plus a depth-gradient tolerance avoid edge holes.
      if(depth) for(let sy=Math.max(0,Math.floor(y)-1);sy<=Math.min(height-1,Math.floor(y)+1);sy++)
        for(let sx=Math.max(0,Math.floor(x)-1);sx<=Math.min(width-1,Math.floor(x)+1);sx++) {
          const k=sy*width+sx;
          if(Number.isFinite(depth[k])) {sampled=true;if(z<=depth[k]+tolerance![k]) visible=true;}
        }
      if(!visible && sampled) continue;
      this.eligible[i]=1;
      const key=`${Math.floor(x/this.cellSize)},${Math.floor(y/this.cellSize)}`;
      const bucket=this.grid.get(key); if(bucket) bucket.push(i); else this.grid.set(key,[i]);
    }
  }

  /** Coverage is 1 inside hardness*radius, then falls linearly to 0.
   * hardness is clamped to [0,1]; invalid coordinates/radii return an empty map.
   */
  query(xCSS:number,yCSS:number,radius:number,hardness:number): Map<number,number> {
    return this.querySegment(xCSS,yCSS,xCSS,yCSS,radius,hardness);
  }

  /** Analytic capsule query: coverage depends on closest segment distance,
   * independent of event spacing. A zero-length segment is a circular dab.
   */
  querySegment(ax:number,ay:number,bx:number,by:number,radius:number,hardness:number): Map<number,number> {
    const result=new Map<number,number>();
    if(![ax,ay,bx,by,radius,hardness].every(Number.isFinite)||radius<=0) return result;
    const dx=bx-ax,dy=by-ay,length2=dx*dx+dy*dy,h=THREE.MathUtils.clamp(hardness,0,1);
    const minX=Math.floor((Math.min(ax,bx)-radius)/this.cellSize),maxX=Math.floor((Math.max(ax,bx)+radius)/this.cellSize);
    const minY=Math.floor((Math.min(ay,by)-radius)/this.cellSize),maxY=Math.floor((Math.max(ay,by)+radius)/this.cellSize);
    // Iterate occupied cells so a long offscreen segment cannot cause a huge
    // empty-cell traversal. Each vertex belongs to exactly one bucket.
    for(const [key,vertices] of this.grid) {
      const [cx,cy]=key.split(',').map(Number);
      if(cx<minX||cx>maxX||cy<minY||cy>maxY) continue;
      for(const i of vertices) {
        const t=length2 ? THREE.MathUtils.clamp(((this.x[i]-ax)*dx+(this.y[i]-ay)*dy)/length2,0,1) : 0;
        const d=Math.hypot(this.x[i]-ax-t*dx,this.y[i]-ay-t*dy);
        if(d>radius) continue;
        const coverage=h===1 ? 1 : Math.min(1,(radius-d)/(radius*(1-h)));
        if(coverage>0) result.set(i,coverage);
      }
    }
    return result;
  }
}
