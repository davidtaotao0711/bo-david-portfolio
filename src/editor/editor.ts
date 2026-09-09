import type { Project } from '../data/projects';
import { GitHubEditor } from './github-client';
import { samePhoto } from '../lib/github-model';
import { openLayoutEditor, hasUnsavedLayout } from './layout-editor';
import type { LayoutSlot } from '../lib/gallery-layout';
import { indexCanvas, indexProjects } from '../lib/index-layout';
const hosted = document.documentElement.dataset.editor === 'github';
let remote: GitHubEditor | undefined;
type Snapshot = { projects: Project[]; revision: string; thumbnails: Record<string, string> };
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
let state: Snapshot;
let selected = '';
let order: string[] = [];
let cover = '';
let dirty = false;
let busy = false;
let dragged: string | undefined;
let removingPhotoId: string | undefined;
const orientationOptions = ['all', 'landscape', 'portrait', 'square'] as const;
type OrientationFilter = typeof orientationOptions[number];
const orientationLabels = {all:'全部',landscape:'横图',portrait:'竖图',square:'方图'};
let photoFilter: OrientationFilter = 'all';
let libraryFilter: OrientationFilter = 'all';
function photoOrientation(width: number, height: number): OrientationFilter {
  return width > height ? 'landscape' : width < height ? 'portrait' : 'square';
}
function applyOrientationFilter(scope: 'photo' | 'library', filter: OrientationFilter) {
  const items = Array.from($(`#${scope}-grid`).children) as HTMLElement[];
  for (const item of items) item.hidden = filter !== 'all' && item.dataset.orientation !== filter;
  const bar = $(`#${scope}-filters`);
  for (const option of orientationOptions) {
    const control = bar.querySelector<HTMLButtonElement>(`[data-filter="${option}"]`)!;
    const count = option === 'all' ? items.length : items.filter(item => item.dataset.orientation === option).length;
    control.textContent = `${orientationLabels[option]}（${count}）`;
    control.setAttribute('aria-pressed', String(option === filter));
  }
  $(`#${scope}-filter-empty`).hidden = items.some(item => !item.hidden);
  if (scope === 'photo') {
    $('#photo-filter-note').hidden = filter === 'all';
    for (const item of items) item.draggable = !busy && filter === 'all';
    controls();
  } else updateLibraryCount();
}
for (const scope of ['photo', 'library'] as const) {
  for (const option of orientationOptions) {
    const control = document.createElement('button'); control.type = 'button'; control.dataset.filter = option;
    control.textContent = orientationLabels[option]; control.setAttribute('aria-pressed', String(option === 'all'));
    control.addEventListener('click', () => {
      if (!state || busy) return;
      if (scope === 'photo') { photoFilter = option; dragged = undefined; }
      else libraryFilter = option;
      applyOrientationFilter(scope, option);
    });
    $(`#${scope}-filters`).append(control);
  }
}

const project = () => state.projects.find(project => project.slug === selected)!;
function status(text: string, error = false) {
  $('#status').textContent = !hosted && text === 'Failed to fetch'
    ? '本地服务连接中断。请双击桌面的 BO DAVID 编辑器.cmd 重新连接，然后再同步。'
    : text;
  $('#status').dataset.error = String(error);
}
function controls() {
  for(const arrangement of ['color','theme'] as const)$<HTMLButtonElement>(`#index-${arrangement}`).disabled=busy||dirty||!indexProjects(state.projects,arrangement).length;
  $<HTMLButtonElement>('#open-layout').disabled = busy || dirty || !project() || project()?.github?.key === 'unassigned';
  $<HTMLSelectElement>('#project-arrangement').disabled = busy || dirty || !project();
  $<HTMLButtonElement>('#project-create').disabled = busy || dirty;
  $<HTMLButtonElement>('#project-delete').disabled = busy || dirty || !project() || project().github?.key === 'unassigned';
  $<HTMLButtonElement>('#disconnect').disabled = busy || dirty;
  $<HTMLButtonElement>('#refresh-content').disabled = busy || dirty;
  $<HTMLButtonElement>('#github-sync').disabled = busy || dirty;
  $<HTMLButtonElement>('#from-unassigned').disabled = busy || dirty || !project() || project()?.github?.key === 'unassigned';
  $<HTMLButtonElement>('#save').disabled = busy || !dirty;
  $<HTMLButtonElement>('#discard').disabled = busy || !dirty;
  $<HTMLInputElement>('#upload').disabled = busy || dirty || !project();
  $('.upload-label').classList.toggle('disabled', busy || dirty || !project());
  $<HTMLButtonElement>('#clear-placeholders').disabled = busy || dirty || !project()?.images.some(image => image.placeholderColor) || !project()?.images.some(image => !image.placeholderColor);
  $('#clear-placeholders').hidden = !project()?.images.some(image => image.placeholderColor);
  document.querySelectorAll<HTMLButtonElement>('.photo-controls button, .project-row button').forEach(button => button.disabled = busy || button.dataset.edge === 'true');
  document.querySelectorAll<HTMLButtonElement>('.photo-controls button[data-direction]').forEach(button => button.disabled = busy || photoFilter !== 'all' || button.dataset.edge === 'true');
  document.querySelectorAll<HTMLButtonElement>('.remove-photo').forEach(button => button.disabled = busy || dirty);
  $('#photo-grid').setAttribute('aria-busy', String(busy));
}
function button(text: string, label: string, action: () => void, edge = false) {
  const element = document.createElement('button');
  element.textContent = text; element.setAttribute('aria-label', label);
  element.dataset.edge = String(edge); element.disabled = busy || edge;
  element.addEventListener('click', action);
  return element;
}
function setState(next: Snapshot) {
  state = next;
  if (!state.projects.some(project => project.slug === selected)) selected = state.projects[0]?.slug ?? '';
  order = project()?.images.map(image => image.id) ?? []; cover = project()?.cover ?? ''; dirty = false;
  render();
}
function changed() { dirty = true; renderPhotos(); controls(); status('有未保存调整。点击“保存顺序与封面”应用到网站。'); }
function move(id: string, delta: number) {
  const index = order.indexOf(id); const to = index + delta;
  if (busy || photoFilter !== 'all' || to < 0 || to >= order.length) return;
  [order[index], order[to]] = [order[to], order[index]];
  changed();
  document.getElementById(`edit-${id}`)?.querySelector<HTMLButtonElement>(`button[data-direction="${delta}"]`)?.focus();
}
function renderPhotos() {
  const grid = $('#photo-grid'); grid.replaceChildren();
  order.forEach((id, index) => {
    const photo = project().images.find(image => image.id === id)!;
    const item = document.createElement('article'); item.className = 'photo-item'; item.id = `edit-${id}`; item.draggable = !busy && photoFilter === 'all'; item.dataset.id = id; item.dataset.orientation = photoOrientation(photo.width, photo.height);
    item.setAttribute('aria-label', `第 ${index + 1} 张，${photo.alt}`);
    const preview = document.createElement('div'); preview.className = 'photo-preview';
    const image = document.createElement('img'); image.src = state.thumbnails[id]; image.alt = photo.alt; image.loading = 'lazy'; image.draggable = false;
    preview.append(image);
    const meta = document.createElement('div'); meta.className = 'photo-meta';
    const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0');
    const dimensions = document.createElement('span'); dimensions.textContent = `${photo.width} × ${photo.height}${photo.placeholderColor ? ' · 色块' : ''}`;
    meta.append(number, dimensions);
    const actions = document.createElement('div'); actions.className = 'photo-controls';
    for (const delta of [-1, 1]) {
      const control = button(delta < 0 ? '← 前移' : '后移 →', `第 ${index + 1} 张${delta < 0 ? '前移' : '后移'}`, () => move(id, delta), delta < 0 ? index === 0 : index === order.length - 1);
      control.dataset.direction = String(delta); actions.append(control);
    }
    const coverButton = button(cover === id ? '已设为封面' : '设为封面', `第 ${index + 1} 张${cover === id ? '是封面' : '设为封面'}`, () => { cover = id; changed(); });
    coverButton.classList.toggle('is-cover', cover === id); coverButton.setAttribute('aria-pressed', String(cover === id)); actions.append(coverButton);
    const remove = button('删除照片', `删除第 ${index + 1} 张照片`, () => {
      if (busy || dirty) return;
      removingPhotoId = id;
      $('#remove-photo-description').textContent = project().github?.key === 'unassigned'
        ? '从 Unassigned 总库移除这张照片？其他项目中的使用不受影响。若原图仍在 GitHub 来源仓库，下次同步会重新加入总库。'
        : `从“${project().title}”移除这张照片？照片会保留在 Unassigned 总库。如删除的是封面，将自动使用剩余的第一张照片。`;
      $<HTMLDialogElement>('#remove-photo-dialog').showModal();
    });
    remove.className = 'remove-photo danger'; actions.append(remove);
    item.append(preview, meta, actions); grid.append(item);
    item.addEventListener('dragstart', event => { if (busy || photoFilter !== 'all') { event.preventDefault(); return; } dragged = id; item.classList.add('dragging'); event.dataTransfer?.setData('text/plain', id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; });
    item.addEventListener('dragover', event => { if (!busy && dragged && dragged !== id) { event.preventDefault(); item.classList.add('drag-over'); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; } });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', event => {
      event.preventDefault(); if (busy || photoFilter !== 'all' || !dragged || dragged === id) return;
      const from = order.indexOf(dragged), to = order.indexOf(id);
      order.splice(from, 1); order.splice(to, 0, dragged); dragged = undefined; changed();
    });
    item.addEventListener('dragend', () => { dragged = undefined; grid.querySelectorAll('.dragging,.drag-over').forEach(element => element.classList.remove('dragging', 'drag-over')); });
  });
  applyOrientationFilter('photo', photoFilter);
}
function renderProjectHeading() {
  $('#project-name').textContent = project()?.title ?? '创建你的第一个项目';
  $('#project-count').textContent = project()?.images.length ? `${project().images.length} 张图片 · ${project().location}` : '空项目：上传照片或从 Unassigned 添加后，将显示在网站上。';
  const library = project()?.github?.key === 'unassigned';
  $('#project-preview').hidden = !project()?.images.length || library;
  $('#project-arrangement-setting').hidden = !project() || library;
  $<HTMLSelectElement>('#project-arrangement').value = project()?.arrangement ?? 'color';
  $<HTMLAnchorElement>('#project-preview').href = `/?mode=overview&slug=${selected}&sort=${project()?.arrangement ?? 'color'}`;
}
function render() {
  renderProjectHeading();
  const list = $('#project-list'); list.replaceChildren();
  state.projects.forEach((item, index) => {
    const row = document.createElement('div'); row.className = 'project-row'; row.setAttribute('aria-current', String(item.slug === selected));
    const select = button(item.title, `选择项目 ${item.title}`, () => {
      if (dirty) { status('请先保存调整，或点击“撤销未保存调整”后切换项目。', true); return; }
      selected = item.slug; order = item.images.map(image => image.id); cover = item.cover;
      list.querySelectorAll('.project-row').forEach(element => element.setAttribute('aria-current', String(element === row)));
      renderProjectHeading(); renderPhotos(); controls(); status('拖拽照片或使用前移 / 后移调整顺序。');
    }); select.className = 'select-project'; row.append(select);
    if (item.arrangement === 'theme') select.textContent = `${item.title} · 主题`;
    select.title = item.github?.key === 'unassigned' ? '照片总库' : '双击重命名；回车保存，Esc 取消';
    select.addEventListener('dblclick', () => {
      if (busy || dirty || item.github?.key === 'unassigned') return;
      const input = document.createElement('input'); input.value = item.title; input.maxLength = 80;
      input.setAttribute('aria-label', '重命名项目'); input.style.width = '100%'; input.style.minWidth = '0';
      let finished = false;
      input.addEventListener('keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'Escape') { event.preventDefault(); finished = true; render(); }
        if (event.key === 'Enter') {
          event.preventDefault(); const title = input.value.trim();
          if (!title || title.toLowerCase() === 'unassigned') { status('请输入项目名称，不能使用 Unassigned。', true); return; }
          finished = true;
          if (title === item.title) { render(); return; }
          void operation(() => request('/projects-rename', {title}), '项目名称已保存。');
        }
      });
      input.addEventListener('blur', () => { if (!finished) { finished = true; render(); } });
      select.replaceWith(input); input.focus(); input.select();
    });
    for (const delta of [-1, 1]) {
      const control = button(delta < 0 ? '↑' : '↓', `${item.title} 项目${delta < 0 ? '上移' : '下移'}`, () => {
        if (dirty) { status('请先保存或撤销照片调整。', true); return; }
        const ids = state.projects.map(project => project.id); [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
        void operation(() => request('/projects-order', { ids }), '项目顺序已保存。');
      }, delta < 0 ? index === 0 : index === state.projects.length - 1);
      control.className = 'move-project'; row.append(control);
    }
    list.append(row);
  });
  renderPhotos(); controls();
}
async function request(path: string, data: unknown, file?: File): Promise<Snapshot> {
  if (hosted) return remote!.edit(path, selected, data as {ids?:string[];cover?:string;title?:string;arrangement?:'color'|'theme';layout?:LayoutSlot[]}, file);
  const response = await fetch(`/__editor${path}?project=${encodeURIComponent(selected)}`, { method: 'POST', headers: { 'X-BO-Editor': 'local', 'If-Match': state.revision, 'Content-Type': file ? 'application/octet-stream' : 'application/json', ...(file ? { 'X-File-Name': encodeURIComponent(file.name) } : {}) }, body: file ?? JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '保存失败，请重试。');
  return result;
}
async function operation(action: () => Promise<Snapshot>, message: string) {
  if (busy) return;
  busy = true; controls(); status('正在保存…');
  try { setState(await action()); status(hosted ? '已保存到 GitHub。网站将在自动部署完成后更新。' : message); }
  catch (error) { status(error instanceof Error ? error.message : '操作失败，请重试。', true); }
  finally { busy = false; controls(); }
}
const createDialog = $<HTMLDialogElement>('#create-dialog');
$('#project-arrangement').addEventListener('change', () => {
  const input = $<HTMLSelectElement>('#project-arrangement');
  if (busy || dirty || !project() || project().github?.key === 'unassigned') { renderProjectHeading(); return; }
  const arrangement = input.value;
  void operation(() => request('/projects-arrangement', {arrangement}), '项目分类已保存。网站可在颜色与主题之间切换。').finally(renderProjectHeading);
});
$('#remove-photo-cancel').addEventListener('click', () => $<HTMLDialogElement>('#remove-photo-dialog').close());
$('#remove-photo-confirm').addEventListener('click', () => {
  if (busy || dirty || !removingPhotoId) return;
  const id = removingPhotoId; removingPhotoId = undefined;
  const fromLibrary = project().github?.key === 'unassigned';
  $<HTMLDialogElement>('#remove-photo-dialog').close();
  void operation(() => request('/photos-remove', {ids:[id]}), fromLibrary ? '已从总库移除，其他项目不受影响。' : '已从当前项目移除，照片保留在 Unassigned 总库。');
});
const deleteDialog = $<HTMLDialogElement>('#delete-dialog');
$('#project-create').addEventListener('click', () => {
  if (busy || dirty) return;
  $<HTMLFormElement>('#create-form').reset(); createDialog.showModal();
  $<HTMLInputElement>('#new-project-title').focus();
});
$('#create-cancel').addEventListener('click', () => createDialog.close());
$('#create-form').addEventListener('submit', event => {
  event.preventDefault(); if (busy || dirty) return;
  const title = $<HTMLInputElement>('#new-project-title').value.trim();
  const arrangement = $<HTMLSelectElement>('#new-project-arrangement').value;
  if (!title) { $<HTMLInputElement>('#new-project-title').focus(); return; }
  const existing = new Set(state.projects.map(p => p.id));
  createDialog.close();
  void operation(async () => {
    const next = await request('/projects-create', {title, arrangement});
    selected = next.projects.find(p => !existing.has(p.id))?.slug ?? selected;
    return next;
  }, '项目已创建。现在可以上传照片，或从 Unassigned 添加图片。');
});
$('#project-delete').addEventListener('click', () => {
  if (busy || dirty || !project() || project().github?.key === 'unassigned') return;
  $('#delete-description').textContent = `确定删除“${project().title}”吗？`;
  deleteDialog.showModal();
});
$('#delete-cancel').addEventListener('click', () => deleteDialog.close());
$('#delete-confirm').addEventListener('click', () => {
  if (busy || dirty || !project()) return;
  deleteDialog.close();
  void operation(() => request('/projects-delete', {}), '项目已删除，照片已保留在 Unassigned 总库。');
});
$('#save').addEventListener('click', () => void operation(() => request('/order', { ids: order, cover }), '顺序与封面已保存，网站已更新。'));
const libraryDialog = $<HTMLDialogElement>('#library-dialog');
function updateLibraryCount() {
  const count = $('#library-grid').querySelectorAll('input:checked').length;
  const hiddenCount = $('#library-grid').querySelectorAll('[hidden] input:checked').length;
  $('#library-selection').textContent = `已选 ${count} 张${hiddenCount ? `，其中 ${hiddenCount} 张在其他分类中` : ''}。切换分类会保留勾选。`;
  const add = $<HTMLButtonElement>('#library-add');
  add.disabled = count === 0; add.textContent = `添加到当前项目（${count}）`;
}
$('#from-unassigned').addEventListener('click', () => {
  if (busy || dirty) return;
  const photos = state.projects.find(p => p.github?.key === 'unassigned')?.images ?? [];
  const grid = $('#library-grid'); grid.replaceChildren();
  $('#library-empty').hidden = photos.length > 0;
  for (const photo of photos) {
    const label = document.createElement('label'); label.className = 'library-photo'; label.dataset.orientation = photoOrientation(photo.width, photo.height);
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = photo.id;
    input.disabled = project().images.some(p => samePhoto(p, photo));
    input.setAttribute('aria-label', `选择 ${photo.alt}`);
    input.addEventListener('change', updateLibraryCount);
    const img = document.createElement('img'); img.src = state.thumbnails[photo.id] || photo.src; img.alt = photo.alt; img.loading = 'lazy';
    const caption = document.createElement('span'); caption.textContent = input.disabled ? '已在当前项目' : photo.alt;
    label.append(input, img, caption); grid.append(label);
  }
  applyOrientationFilter('library', libraryFilter); libraryDialog.showModal();
});
$('#library-close').addEventListener('click', () => libraryDialog.close());
for (const [id, checked] of [['library-all', true], ['library-none', false]] as const) {
  $(`#${id}`).addEventListener('click', () => {
    const selector = checked ? '.library-photo:not([hidden]) input:not(:disabled)' : 'input';
    $('#library-grid').querySelectorAll<HTMLInputElement>(selector).forEach(input => input.checked = checked);
    updateLibraryCount();
  });
}
$('#library-add').addEventListener('click', () => {
  const ids = Array.from($('#library-grid').querySelectorAll<HTMLInputElement>('input:checked')).map(input => input.value);
  if (!ids.length || busy || dirty) return;
  libraryDialog.close();
  void operation(() => request('/from-unassigned', { ids }), `已添加 ${ids.length} 张照片并保存，Unassigned 总库已保留。`);
});
$('#discard').addEventListener('click', () => { setState(state); status('已撤销未保存的顺序和封面调整。'); });
$('#clear-placeholders').addEventListener('click', () => void operation(() => request('/clear-placeholders', {}), '测试色块已移除，正式照片已保留。'));
$<HTMLInputElement>('#upload').addEventListener('change', async event => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []); if (!files.length || busy || dirty) return;
  busy = true; controls(); let completed = 0;
  try {
    for (const file of files) {
      if (file.size > 40 * 1024 * 1024) throw new Error(`${file.name} 超过 40 MB。`);
      status(`正在上传并生成图片 ${completed + 1} / ${files.length}：${file.name}`);
      setState(await request('/upload', {}, file)); completed++;
    }
    status(`已上传 ${completed} 张照片${hosted ? '到 GitHub，网站将在部署完成后更新' : ''}。现在可以调整顺序和封面。`);
  } catch (error) { status(`已保存 ${completed} 张。${error instanceof Error ? error.message : '上传失败，请重试。'}`, true); }
  finally { busy = false; input.value = ''; controls(); }
});
$('#open-layout').addEventListener('click', () => {
  if (busy || dirty || !project() || project().github?.key === 'unassigned') return;
  openLayoutEditor(project(), state.thumbnails, async layout => {
    busy = true; controls();
    try { setState(await request('/layout', {layout})); status('排版已保存，正式总览将使用相同的裁切、顺序与空白位置。'); }
    finally { busy = false; controls(); }
  });
});
for(const arrangement of ['color','theme'] as const){
  $(`#index-${arrangement}`).addEventListener('click',()=>{
    if(busy||dirty)return;
    const groups=indexProjects(state.projects,arrangement);
    const thumbnails=Object.fromEntries(groups.map(item=>[item.id,state.thumbnails[item.cover]]));
    openLayoutEditor(indexCanvas(state.projects,arrangement),thumbnails,async layout=>{
      busy=true;controls();
      try{setState(await request('/index-layout',{arrangement,layout}));status('INDEX 卡片顺序与空白已保存；OVERVIEW 顺序不变。');}
      finally{busy=false;controls();}
    },true);
  });
}
window.addEventListener('beforeunload', event => { if (dirty || busy || hasUnsavedLayout()) event.preventDefault(); });
type SyncStatus = { state: 'idle' | 'running' | 'complete' | 'error'; message: string; completed: number; total: number };
async function readSync(): Promise<SyncStatus> {
  if (hosted) return remote!.job;
  const response = await fetch('/__editor/github-sync', { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取同步进度，请刷新编辑器。');
  return response.json();
}
async function followSync(job: SyncStatus) {
  busy = true; controls();
  const progress = $<HTMLProgressElement>('#sync-progress');
  try {
    while (job.state === 'running') {
      status(job.message); progress.hidden = false;
      if (job.total) { progress.max = job.total; progress.value = job.completed; }
      else progress.removeAttribute('value');
      await new Promise(resolve => setTimeout(resolve, 1000)); job = await readSync();
    }
    if (job.state === 'complete') {
      const next: Snapshot = hosted ? await remote!.load() : await loadLocal();
      selected = next.projects.find(p => p.github)?.slug ?? selected; setState(next);
    }
    status(job.message || '已载入本地项目。', job.state === 'error');
  } catch (error) { status(error instanceof Error ? error.message : '请刷新查看同步进度。', true); }
  finally { progress.hidden = true; busy = false; controls(); }
}
$('#github-sync').addEventListener('click', async () => {
  if (busy || dirty) return;
  busy = true; controls(); status('正在启动 GitHub 同步…');
  try {
    if (hosted) { await followSync(remote!.startSync()); return; }
    const response = await fetch('/__editor/github-sync', { method: 'POST', headers: { 'X-BO-Editor': 'local', 'If-Match': state.revision } });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error);
    await followSync(job);
  } catch (error) { status(error instanceof Error ? error.message : '同步启动失败。', true); }
  finally { busy = false; controls(); }
});
async function loadLocal(): Promise<Snapshot> {
  const response = await fetch('/__editor/state', { cache: 'no-store' });
  const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
}
if (hosted) {
  $('#github-login').hidden = false; $('.editor-layout').hidden = true;
  $('#disconnect').hidden = false; $('#refresh-content').hidden = false;
  $('#connect-form').addEventListener('submit', async event => {
    event.preventDefault(); const input = $<HTMLInputElement>('#github-token');
    $<HTMLButtonElement>('#connect').disabled = true; $('#login-status').textContent = '正在验证 GitHub 权限…';
    try {
      const response = await fetch('/__editor/assets/manifest.json', {cache:'no-store'});
      if (!response.ok) throw new Error('网站图片索引暂不可用，请稍后重试。');
      remote = new GitHubEditor(await response.json());
      const sourceInput = $<HTMLInputElement>('#github-source-token');
      const next = await remote.connect(input.value, sourceInput.value); input.value = ''; sourceInput.value = '';
      $('#github-login').hidden = true; $('.editor-layout').hidden = false;
      setState(next); status('已连接 GitHub。上传和排序会保存到私有仓库。');
    } catch (error) { input.value = ''; $<HTMLInputElement>('#github-source-token').value = ''; $('#login-status').textContent = error instanceof Error ? error.message : '连接失败，请重试。'; }
    finally { $<HTMLButtonElement>('#connect').disabled = false; }
  });
  $('#disconnect').addEventListener('click', () => { remote?.disconnect(); location.reload(); });
  $('#refresh-content').addEventListener('click', () => void operation(() => remote!.load(), '已刷新内容。'));
} else {
  loadLocal().then(async data => {
    setState(data); status('已载入本地项目。');
    const job = await readSync(); if (job.state !== 'idle') await followSync(job);
  }).catch(error => status(`无法读取项目：${error.message}。请刷新重试。`, true));
}
