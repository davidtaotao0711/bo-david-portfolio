import type { Project } from '../data/projects';
import { arrangedProjects, type Arrangement } from './arrangements';
import { saveProjectLayout, type LayoutSlot } from './gallery-layout';

export function indexProjects(all:Project[], arrangement:Arrangement) {
  return arrangedProjects(all,arrangement).sort((a,b)=>(a.indexCard?.order??Number.MAX_SAFE_INTEGER)-(b.indexCard?.order??Number.MAX_SAFE_INTEGER));
}
// A temporary editor view of project covers, never added to the photo library.
export function indexCanvas(all:Project[], arrangement:Arrangement):Project {
  const groups=indexProjects(all,arrangement);
  const layout:LayoutSlot[]=[];
  for(const project of groups){
    for(const side of ['before','after'] as const){
      if(side==='after')layout.push({kind:'photo',id:project.id});
      (project.indexCard?.[side]??[]).forEach((orientation,i)=>layout.push({kind:'blank',id:`blank-${project.id}-${side}-${i}`,orientation}));
    }
  }
  return {id:'index-canvas',slug:'index-canvas',title:`INDEX · ${arrangement==='color'?'颜色':'主题'}`,year:'',location:'',description:'',cover:groups[0]?.id??'',layout,images:groups.map(project=>({...project.images.find(image=>image.id===project.cover)!,id:project.id,alt:project.title}))};
}
export function saveIndexLayout(all:Project[], arrangement:unknown, value:unknown) {
  if(arrangement!=='color' && arrangement!=='theme')throw new Error('请选择颜色或主题 INDEX。');
  const canvas=indexCanvas(all,arrangement);
  saveProjectLayout(canvas,value);
  const groups=arrangedProjects(all,arrangement);
  if(!groups.length && canvas.layout!.length)throw new Error('请先创建一个包含照片的项目。');
  let pending:('portrait'|'landscape')[]=[], rank=0, last:Project|undefined;
  for(const slot of canvas.layout!){
    if(slot.kind==='blank'){pending.push(slot.orientation);continue;}
    const project=groups.find(project=>project.id===slot.id)!;
    project.indexCard={order:rank++,before:pending,after:[]};pending=[];last=project;
  }
  if(last)last.indexCard!.after=pending;
}
