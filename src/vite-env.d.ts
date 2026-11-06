declare module '*?raw' {const content:string;export default content;}
interface Window {workshopInspect?:()=>any;workshop?:{
  testMode:boolean;
  onImportStatus?:(callback:(text:string)=>void)=>(()=>void);
  open:()=>Promise<any>;importDrop:(file:File)=>Promise<any>;mesh:()=>Promise<any>;
  importReference:(reference:string)=>Promise<any>;
  export:(project:any)=>Promise<any>;saveProject:(project:any)=>Promise<string|null>;
  saveMesh:(project:any)=>Promise<any>;
};}

