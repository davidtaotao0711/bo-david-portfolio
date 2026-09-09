import type { Project } from '../data/projects';
import { galleryRuns, projectLayout, frameRatio, type LayoutSlot } from '../lib/gallery-layout';

const dialog = document.createElement('dialog');
dialog.className = 'layout-dialog'; dialog.setAttribute('aria-label','正式页排版');
dialog.innerHTML = `<header class="layout-toolbar"><strong id="layout-title"></strong><button data-action="portrait">＋ 竖版空白</button><button data-action="landscape">＋ 横版空白</button><button data-action="previous">← 前移</button><button data-action="next">后移 →</button><button data-action="remove">删除空白</button><label><input id="layout-guides" type="checkbox" checked /> 显示编辑辅助线</label><button data-action="save" class="primary">保存排版</button><button data-action="close">关闭</button><p id="layout-message" role="status"></p></header><div class="layout-scroll"><div class="gallery-sheet layout-canvas show-guides"></div></div>`;
document.body.append(dialog);
const canvas = dialog.querySelector<HTMLElement>('.layout-canvas')!;
const message = dialog.querySelector<HTMLElement>('#layout-message')!;
let project: Project, thumbnails: Record<string,string>, slots: LayoutSlot[] = [], selected = '', dragged = '';
let dirty = false, saving = false;
let indexMode = false;
let save: (slots:LayoutSlot[]) => Promise<void>;
export const hasUnsavedLayout = () => dirty || saving;
const control = (action:string) => dialog.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
function controls() {
  const index = slots.findIndex(slot => slot.id === selected);
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('button')) button.disabled = saving;
  control('previous').disabled = saving || index < 1;
  control('next').disabled = saving || index < 0 || index === slots.length - 1;
  control('remove').disabled = saving || slots[index]?.kind !== 'blank';
  control('save').disabled = saving || !dirty;
  canvas.inert = saving;
}
function change() { dirty = true; message.textContent = '排版未保存。完成后点击“保存排版”。空白不会进入照片总库。'; render(); }
function render() {
  canvas.replaceChildren();
  const images = new Map(project.images.map(image => [image.id,image]));
  for (const run of indexMode ? [{orientation:'portrait',slots}] : galleryRuns(project,slots)) {
    const row = document.createElement('div'); row.className = indexMode ? 'index-run' : 'gallery-run'; row.dataset.orientation = run.orientation;
    for (const slot of run.slots) {
      const cell = document.createElement('div'); cell.className = 'gallery-cell layout-slot'; cell.dataset.slot = slot.id;
      cell.tabIndex = 0; cell.setAttribute('role','button'); cell.setAttribute('aria-pressed',String(slot.id === selected)); cell.draggable = !saving;
      const photo = images.get(slot.id);
      if(indexMode)cell.style.aspectRatio=slot.kind==='blank'?(slot.orientation==='portrait'?'2/3':'3/2'):frameRatio(photo!);
      const label = slot.kind === 'blank' ? `${slot.orientation === 'portrait' ? '竖版' : '横版'}空白` : photo!.alt;
      cell.setAttribute('aria-label',`位置 ${slots.indexOf(slot) + 1}：${label}`);
      if (slot.kind === 'blank') { cell.classList.add('layout-blank'); cell.dataset.label = label; }
      else {
        const img = document.createElement('img'); img.src = thumbnails[slot.id] || photo!.src; img.alt = photo!.alt; img.draggable = false; img.loading = 'lazy'; cell.append(img);
        if(indexMode){const caption=document.createElement('span');caption.className='layout-caption';caption.textContent=photo!.alt;cell.append(caption);}
      }
      const select = () => {
        selected = slot.id;
        canvas.querySelectorAll<HTMLElement>('[data-slot]').forEach(item => item.setAttribute('aria-pressed',String(item.dataset.slot === selected))); controls();
      };
      cell.addEventListener('click',select);
      cell.addEventListener('keydown',event => { if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();select();} });
      cell.addEventListener('dragstart',event => { if(saving){event.preventDefault();return;} dragged = slot.id; select(); event.dataTransfer?.setData('text/plain',slot.id); });
      cell.addEventListener('dragover',event => { if(dragged && !saving) {event.preventDefault();cell.classList.add('drop-target');} });
      cell.addEventListener('dragleave',()=>cell.classList.remove('drop-target'));
      cell.addEventListener('drop',event => {
        event.preventDefault(); if(!dragged || saving || dragged === slot.id)return;
        const from = slots.findIndex(item=>item.id===dragged), to = slots.findIndex(item=>item.id===slot.id);
        if(from<0 || to<0)return;
        const [moved] = slots.splice(from,1); slots.splice(to,0,moved); dragged=''; change();
      });
      cell.addEventListener('dragend',()=>{dragged='';canvas.querySelectorAll('.drop-target').forEach(item=>item.classList.remove('drop-target'));});
      row.append(cell);
    }
    canvas.append(row);
  }
  controls();
}
function close() {
  if(saving || (dirty && !confirm('排版尚未保存，确定放弃这些调整？')))return;
  dirty=false; dragged=''; dialog.close();
}
dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
dialog.querySelector<HTMLInputElement>('#layout-guides')!.addEventListener('change',event=>canvas.classList.toggle('show-guides',(event.target as HTMLInputElement).checked));
dialog.addEventListener('click',event=>{
  const action=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
  if(!action || saving)return;
  const index=slots.findIndex(slot=>slot.id===selected);
  if(action==='close'){close();return;}
  if(action==='portrait' || action==='landscape'){
    const slot:LayoutSlot={kind:'blank',id:`blank-${crypto.randomUUID()}`,orientation:action};
    slots.splice(index<0?slots.length:index+1,0,slot);selected=slot.id;change();return;
  }
  if(action==='remove' && slots[index]?.kind==='blank'){slots.splice(index,1);selected=slots[Math.min(index,slots.length-1)]?.id??'';change();return;}
  if(action==='previous' || action==='next'){
    const to=index+(action==='previous'?-1:1); if(index<0 || to<0 || to>=slots.length)return;
    [slots[index],slots[to]]=[slots[to],slots[index]];change();return;
  }
  if(action==='save'){
    saving=true;controls();message.textContent='正在保存排版…';
    void save(structuredClone(slots)).then(()=>{dirty=false;dialog.close();}).catch(error=>{message.textContent=error instanceof Error?error.message:'保存失败，请重试。';}).finally(()=>{saving=false;controls();});
  }
});
export function openLayoutEditor(value:Project, previews:Record<string,string>, onSave:(slots:LayoutSlot[])=>Promise<void>, index = false) {
  indexMode=index;canvas.classList.toggle('index-layout',indexMode);
  project=value;thumbnails=previews;slots=projectLayout(project);selected='';dirty=false;dragged='';save=onSave;
  dialog.querySelector('#layout-title')!.textContent=`${project.title} · 正式页排版`;
  message.textContent=indexMode?'与正式 INDEX 使用相同列数和封面。拖动卡片调整位置；空白插在选中位置之后。不改变 OVERVIEW 顺序。':'与正式总览使用相同列数、间距和裁切。横竖图自动分行；点击选中，拖拽调整，空白插在选中位置之后。';
  render();dialog.showModal();dialog.querySelector('.layout-scroll')!.scrollTop=0;
}
