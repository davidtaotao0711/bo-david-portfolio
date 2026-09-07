import type { Project } from '../data/projects';
import { GitHubEditor } from './github-client';
import { samePhoto } from '../lib/github-model';
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

const project = () => state.projects.find(project => project.slug === selected)!;
function status(text: string, error = false) {
  $('#status').textContent = !hosted && text === 'Failed to fetch'
    ? '本地服务连接中断。请双击桌面的 BO DAVID 编辑器.cmd 重新连接，然后再同步。'
    : text;
  $('#status').dataset.error = String(error);
}
function controls() {
  $<HTMLButtonElement>('#disconnect').disabled = busy || dirty;
  $<HTMLButtonElement>('#refresh-content').disabled = busy || dirty;
  $<HTMLButtonElement>('#github-sync').disabled = busy || dirty;
  $<HTMLButtonElement>('#from-unassigned').disabled = busy || dirty || project()?.github?.key === 'unassigned';
  $<HTMLButtonElement>('#save').disabled = busy || !dirty;
  $<HTMLButtonElement>('#discard').disabled = busy || !dirty;
  $<HTMLInputElement>('#upload').disabled = busy || dirty;
  $('.upload-label').classList.toggle('disabled', busy || dirty);
  $<HTMLButtonElement>('#clear-placeholders').disabled = busy || dirty || !project()?.images.some(image => image.placeholderColor) || !project()?.images.some(image => !image.placeholderColor);
  document.querySelectorAll<HTMLButtonElement>('.photo-controls button, .project-row button').forEach(button => button.disabled = busy || button.dataset.edge === 'true');
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
  if (!state.projects.some(project => project.slug === selected)) selected = state.projects[0].slug;
  order = project().images.map(image => image.id); cover = project().cover; dirty = false;
  render();
}
function changed() { dirty = true; renderPhotos(); controls(); status('有未保存调整。点击“保存顺序与封面”应用到网站。'); }
function move(id: string, delta: number) {
  const index = order.indexOf(id); const to = index + delta;
  if (busy || to < 0 || to >= order.length) return;
  [order[index], order[to]] = [order[to], order[index]];
  changed();
  document.getElementById(`edit-${id}`)?.querySelector<HTMLButtonElement>(`button[data-direction="${delta}"]`)?.focus();
}
function renderPhotos() {
  const grid = $('#photo-grid'); grid.replaceChildren();
  order.forEach((id, index) => {
    const photo = project().images.find(image => image.id === id)!;
    const item = document.createElement('article'); item.className = 'photo-item'; item.id = `edit-${id}`; item.draggable = !busy; item.dataset.id = id;
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
    item.append(preview, meta, actions); grid.append(item);
    item.addEventListener('dragstart', event => { if (busy) { event.preventDefault(); return; } dragged = id; item.classList.add('dragging'); event.dataTransfer?.setData('text/plain', id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; });
    item.addEventListener('dragover', event => { if (!busy && dragged && dragged !== id) { event.preventDefault(); item.classList.add('drag-over'); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; } });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', event => {
      event.preventDefault(); if (busy || !dragged || dragged === id) return;
      const from = order.indexOf(dragged), to = order.indexOf(id);
      order.splice(from, 1); order.splice(to, 0, dragged); dragged = undefined; changed();
    });
    item.addEventListener('dragend', () => { dragged = undefined; grid.querySelectorAll('.dragging,.drag-over').forEach(element => element.classList.remove('dragging', 'drag-over')); });
  });
}
function render() {
  $('#project-name').textContent = project().title;
  $('#project-count').textContent = `${project().images.length} 张图片 · ${project().location}`;
  $<HTMLAnchorElement>('#project-preview').href = `/${selected}?s=0`;
  const list = $('#project-list'); list.replaceChildren();
  state.projects.forEach((item, index) => {
    const row = document.createElement('div'); row.className = 'project-row'; row.setAttribute('aria-current', String(item.slug === selected));
    const select = button(item.title, `选择项目 ${item.title}`, () => {
      if (dirty) { status('请先保存调整，或点击“撤销未保存调整”后切换项目。', true); return; }
      selected = item.slug; setState(state); status('拖拽照片或使用前移 / 后移调整顺序。');
    }); select.className = 'select-project'; row.append(select);
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
  if (hosted) return remote!.edit(path, selected, data as {ids?:string[];cover?:string}, file);
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
$('#save').addEventListener('click', () => void operation(() => request('/order', { ids: order, cover }), '顺序与封面已保存，网站已更新。'));
const libraryDialog = $<HTMLDialogElement>('#library-dialog');
function updateLibraryCount() {
  const count = $('#library-grid').querySelectorAll('input:checked').length;
  const add = $<HTMLButtonElement>('#library-add');
  add.disabled = count === 0; add.textContent = `添加到当前项目（${count}）`;
}
$('#from-unassigned').addEventListener('click', () => {
  if (busy || dirty) return;
  const photos = state.projects.find(p => p.github?.key === 'unassigned')?.images ?? [];
  const grid = $('#library-grid'); grid.replaceChildren();
  $('#library-empty').hidden = photos.length > 0;
  for (const photo of photos) {
    const label = document.createElement('label'); label.className = 'library-photo';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = photo.id;
    input.disabled = project().images.some(p => samePhoto(p, photo));
    input.setAttribute('aria-label', `选择 ${photo.alt}`);
    input.addEventListener('change', updateLibraryCount);
    const img = document.createElement('img'); img.src = state.thumbnails[photo.id] || photo.src; img.alt = photo.alt; img.loading = 'lazy';
    const caption = document.createElement('span'); caption.textContent = input.disabled ? '已在当前项目' : photo.alt;
    label.append(input, img, caption); grid.append(label);
  }
  updateLibraryCount(); libraryDialog.showModal();
});
$('#library-close').addEventListener('click', () => libraryDialog.close());
for (const [id, checked] of [['library-all', true], ['library-none', false]] as const) {
  $(`#${id}`).addEventListener('click', () => {
    $('#library-grid').querySelectorAll<HTMLInputElement>('input:not(:disabled)').forEach(input => input.checked = checked);
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
window.addEventListener('beforeunload', event => { if (dirty || busy) event.preventDefault(); });
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
