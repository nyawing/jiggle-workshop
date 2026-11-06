import * as THREE from 'three';
import type {GeometryData} from './model';
export type SurfaceGraph={points:THREE.Vector3[];vertices:number[][];nodes:number[];edges:Map<number,number>[];components:number[]};
// Weld identical positions across UV/normal seams, never nearby disconnected
// surfaces. Brush distance follows triangle edges instead of a spatial sphere.
export function surfaceGraph(geometry:GeometryData):SurfaceGraph{
  const points:THREE.Vector3[]=[],vertices:number[][]=[],nodes:number[]=[],lookup=new Map<string,number>();
  for(let i=0;i<geometry.positions.length/3;i++){
    const point=new THREE.Vector3().fromArray(geometry.positions,i*3),key=point.toArray().map(n=>Math.round(n*1e6)).join(',');
    let node=lookup.get(key);if(node===undefined){node=points.length;lookup.set(key,node);points.push(point);vertices.push([]);}
    nodes.push(node);vertices[node].push(i);
  }
  const edges=points.map(()=>new Map<number,number>());
  for(let i=0;i<geometry.indices.length;i+=3){const ids=geometry.indices.slice(i,i+3).map(v=>nodes[v]);for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3];if(a!==b){const d=points[a].distanceTo(points[b]);edges[a].set(b,d);edges[b].set(a,d);}}}
  const components=points.map(()=>-1);let component=0;
  for(let i=0;i<points.length;i++){if(components[i]>=0)continue;const queue=[i];components[i]=component;for(let j=0;j<queue.length;j++)for(const next of edges[queue[j]].keys())if(components[next]<0){components[next]=component;queue.push(next);}component++;}
  return {points,vertices,nodes,edges,components};
}
export function faceComponent(graph:SurfaceGraph,geometry:GeometryData,face:number){return graph.components[graph.nodes[geometry.indices[face*3]]];}
export function surfaceBrush(graph:SurfaceGraph,geometry:GeometryData,face:number,point:THREE.Vector3,radius:number,locked:number|null){
  const component=faceComponent(graph,geometry,face),weights=new Map<number,number>();
  if(locked!==null&&component!==locked)return weights;
  const distances=new Map<number,number>(),queue:{node:number;distance:number}[]=[];
  const push=(node:number,distance:number)=>{if(distance>radius||distance>=(distances.get(node)??Infinity))return;distances.set(node,distance);let i=queue.length;queue.push({node,distance});while(i>0){const p=(i-1)>>1;if(queue[p].distance<=distance)break;queue[i]=queue[p];i=p;}queue[i]={node,distance};};
  for(const vertex of geometry.indices.slice(face*3,face*3+3)){const node=graph.nodes[vertex];push(node,point.distanceTo(graph.points[node]));}
  while(queue.length){const current=queue[0],last=queue.pop()!;if(queue.length){let i=0;queue[0]=last;while(i*2+1<queue.length){let next=i*2+1;if(next+1<queue.length&&queue[next+1].distance<queue[next].distance)next++;if(queue[next].distance>=last.distance)break;queue[i]=queue[next];i=next;}queue[i]=last;}
    if(current.distance!==distances.get(current.node))continue;
    const strength=THREE.MathUtils.clamp((radius-current.distance)/(radius*.35),0,1);
    for(const vertex of graph.vertices[current.node])weights.set(vertex,strength);
    for(const [next,length] of graph.edges[current.node])push(next,current.distance+length);
  }
  return weights;
}
