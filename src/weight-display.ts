import * as THREE from 'three';
// Interpolate scalar influences before applying the palette in fragment space.
export function weightDisplayMaterial(){
 const material=new THREE.MeshBasicMaterial({color:0xffffff});
 material.onBeforeCompile=shader=>{
  shader.vertexShader='attribute float paintWeight; attribute float paintForeign; attribute float paintSelection; varying float vPaintWeight; varying float vPaintForeign; varying float vPaintSelection;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPaintWeight=paintWeight;vPaintForeign=paintForeign;vPaintSelection=paintSelection;');
  shader.fragmentShader='varying float vPaintWeight; varying float vPaintForeign; varying float vPaintSelection;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  float w=clamp(vPaintWeight,0.0,1.0);
  vec3 c=vec3(0.025,0.055,0.11);
  if(w>0.0){float t=w*4.0;c=t<1.0?mix(vec3(0.03,0.15,0.8),vec3(0.0,0.8,0.9),t):t<2.0?mix(vec3(0.0,0.8,0.9),vec3(0.05,0.8,0.15),t-1.0):t<3.0?mix(vec3(0.05,0.8,0.15),vec3(1.0,0.85,0.0),t-2.0):mix(vec3(1.0,0.85,0.0),vec3(1.0,0.03,0.015),t-3.0);}
  c=mix(c,vec3(0.16),clamp(vPaintForeign,0.0,1.0));
  diffuseColor.rgb=mix(c,vec3(0.4,0.65,0.8),vPaintSelection*0.22);`);
 };
 material.customProgramCacheKey=()=> 'scalar-weight-display-v1';return material;
}
