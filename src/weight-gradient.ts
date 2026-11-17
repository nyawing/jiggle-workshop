/** Линейное поле в координатах экрана, независимое от числа событий указателя и плотности меша. Проекцию, перекрытия и область действия по компонентам задаёт редактор. */
export function linearGradient(start:{x:number;y:number},end:{x:number;y:number},points:Iterable<[number,{x:number;y:number}]>,weights:Float32Array,owners:string[],activeChain:string,from=0,to=1,strength=1){
 if(![start.x,start.y,end.x,end.y,from,to,strength].every(Number.isFinite)||[from,to,strength].some(n=>n<0||n>1)||owners.length!==weights.length)throw new Error('Некорректные параметры градиента.');
 const dx=end.x-start.x,dy=end.y-start.y,length=dx*dx+dy*dy,changes=new Map<number,number>();
 if(length<16)return changes;
 for(const [i,p] of points){if(!Number.isInteger(i)||i<0||i>=weights.length||!Number.isFinite(p.x+p.y))throw new Error('Не удалось определить положение вершины на экране.');if(owners[i]&&owners[i]!==activeChain)continue;
 const t=Math.max(0,Math.min(1,((p.x-start.x)*dx+(p.y-start.y)*dy)/length));changes.set(i,weights[i]+(from+(to-from)*t-weights[i])*strength);
 }return changes;
}
