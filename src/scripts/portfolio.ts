import { projects } from '../data/projects';
import { asset, srcset } from '../lib/images';
import { parseRoute, projectUrl, adjacentIndex, neighborIndices, type PageState, type Route } from '../lib/state';

const main = document.querySelector<HTMLElement>('#main')!;
const header = document.querySelector<HTMLElement>('.header')!;
let route: Route = parseRoute(new URL(location.href), projects);
let transition: { finished: Promise<void>; skipTransition(): void } | undefined;
const preloads = new Map<string, HTMLLinkElement>();
history.scrollRestoration = 'manual';
if (!history.state?.bo) history.replaceState({ bo: true }, '');

function clone(id: string) {
  const template = document.querySelector<HTMLTemplateElement>(`#${id}-template`);
  main.replaceChildren(template!.content.cloneNode(true));
}
function decode(image: HTMLImageElement) {
  image.decode().then(() => image.classList.add('decoded')).catch(() => {
    if (image.complete && image.naturalWidth) image.classList.add('decoded');
  });
}
function revealPhotos() {
  main.querySelectorAll<HTMLImageElement>('.photo img').forEach(image => {
    if (image.complete) decode(image);
    else image.addEventListener('load', () => decode(image), { once: true });
  });
}
function saveScroll() {
  if (route.kind !== 'viewer') history.replaceState({ ...history.state, bo: true, scroll: scrollY }, '');
}
function focusMain() { main.focus({ preventScroll: true }); }
function viewerSizes(width: number, height: number) {
  const ratio = width / height;
  return `(max-width: 600px) min(calc(100vw - 20px), ${(70 * ratio).toFixed(3)}vh), min(82vw, calc((100dvh - 155px) * ${ratio}))`;
}
function renderViewer(slug: string, index: number, preserveFocus: boolean) {
  const project = projects.find(p => p.slug === slug)!;
  const p = projects.indexOf(project);
  if (!main.querySelector('.viewer')) clone('viewer');
  const image = project.images[index];
  const data = asset(image);
  const sizes = viewerSizes(image.width, image.height);
  const current = main.querySelector<HTMLElement>('#current-photo')!;
  current.style.setProperty('--ratio', String(image.width / image.height));
  current.style.viewTransitionName = `photo-${image.id}`;
  const picture = document.createElement('picture');
  picture.className = 'photo';
  picture.style.backgroundImage = `url('${data.tiny}')`;
  picture.style.aspectRatio = `${image.width}/${image.height}`;
  for (const format of ['avif', 'webp']) {
    const source = document.createElement('source');
    source.type = `image/${format}`;
    source.srcset = srcset(data, format);
    source.sizes = sizes;
    picture.append(source);
  }
  const img = document.createElement('img');
  img.width = image.width; img.height = image.height; img.alt = image.alt;
  img.fetchPriority = 'high'; img.decoding = 'async'; img.loading = 'eager';
  img.sizes = sizes; img.srcset = srcset(data, 'jpg'); img.src = `${data.base}-960.jpg`;
  picture.append(img);
  current.replaceChildren(picture);
  decode(img);
  main.querySelector('#project-title')!.textContent = project.title;
  main.querySelector('#image-status')!.textContent = `${project.title}, image ${index + 1} of ${project.images.length}`;
  const close = main.querySelector<HTMLAnchorElement>('#close-viewer')!;
  close.href = (history.state as PageState).origin?.url ?? '/?mode=grid';
  for (const [id, delta] of [['previous-project', -1], ['next-project', 1]] as const) {
    const adjacent = projects[adjacentIndex(p, delta, projects.length)];
    const link = main.querySelector<HTMLAnchorElement>(`#${id}`)!;
    link.href = projectUrl(adjacent.slug);
    link.setAttribute('aria-label', `${delta < 0 ? 'Previous' : 'Next'} project: ${adjacent.title}`);
    link.title = adjacent.title;
  }
  const activePreloads = new Set<string>();
  for (const neighbor of neighborIndices(index, project.images.length)) {
    const photo = project.images[neighbor];
    activePreloads.add(photo.id);
    if (preloads.has(photo.id)) {
      preloads.get(photo.id)!.fetchPriority = neighbor === index ? 'high' : 'low';
      continue;
    }
    const source = asset(photo);
    const link = document.createElement('link');
    link.rel = 'preload'; link.as = 'image'; link.type = 'image/avif';
    link.imageSrcset = srcset(source, 'avif'); link.imageSizes = viewerSizes(photo.width, photo.height);
    link.href = `${source.base}-960.avif`;
    link.fetchPriority = neighbor === index ? 'high' : 'low';
    link.dataset.viewerPreload = photo.id;
    preloads.set(photo.id, link); document.head.append(link);
  }
  for (const [id, link] of preloads) if (!activePreloads.has(id)) { link.remove(); preloads.delete(id); }
  if (!preserveFocus) close.focus({ preventScroll: true });
}

function render(preserveFocus = false) {
  route = parseRoute(new URL(location.href), projects);
  document.body.classList.toggle('viewing', route.kind === 'viewer');
  header.hidden = route.kind === 'viewer';
  const state = history.state as PageState;
  const currentProject = route.kind === 'viewer' ? projects.find(project => project.slug === (route as { slug: string }).slug) : undefined;
  const description = currentProject?.description ?? 'Photographic projects by BO DAVID. Shanghai.';
  document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  if (route.kind === 'viewer') {
    const canonical = projectUrl(route.slug, route.index);
    if (location.pathname + location.search !== canonical) history.replaceState(state, '', canonical);
    renderViewer(route.slug, route.index, preserveFocus);
    document.title = `${projects.find(p => p.slug === (route as { slug: string }).slug)!.title} — BO DAVID`;
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
    scrollTo(0, 0);
    return;
  }
  for (const link of preloads.values()) link.remove();
  preloads.clear();
  if (route.kind === 'archive') {
    clone(route.mode);
    header.querySelector('.page-label')!.textContent = route.mode === 'grid' ? 'Index' : 'Overview';
    document.title = `${route.mode === 'grid' ? 'Index' : 'Overview'} — BO DAVID`;
    const slug = route.slug;
    if (state.scroll !== undefined) scrollTo(0, state.scroll);
    else if (slug) main.querySelector<HTMLElement>(`[data-project="${CSS.escape(slug)}"]`)?.scrollIntoView({ block: 'start' });
    else scrollTo(0, 0);
    if (state.focus) document.getElementById(state.focus)?.focus({ preventScroll: true });
  } else if (route.kind === 'information') {
    clone('information');
    header.querySelector('.page-label')!.textContent = 'Information';
    document.title = 'Information — BO DAVID';
    scrollTo(0, state.scroll ?? 0);
  } else { location.assign('/404'); return; }
  const active = route.kind === 'archive' ? route.mode : 'information';
  header.querySelectorAll<HTMLAnchorElement>('[data-mode]').forEach(link => {
    if (link.dataset.mode === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  revealPhotos();
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
}

function navigate(url: string, state: PageState, sharedImage?: HTMLElement, preserveFocus = false, returnImage?: string) {
  saveScroll();
  transition?.skipTransition();
  if (sharedImage) sharedImage.style.viewTransitionName = sharedImage.id;
  history.pushState(state, '', url);
  route = parseRoute(new URL(location.href), projects);
  const update = () => {
    render(preserveFocus);
    if (returnImage) document.getElementById(returnImage)?.style.setProperty('view-transition-name', returnImage);
  };
  if ('startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    transition = document.startViewTransition(update);
    transition.finished.catch(() => {}).finally(() => {
      main.querySelectorAll<HTMLElement>('.archive-image').forEach(el => el.style.removeProperty('view-transition-name'));
    });
  } else update();
}
function changeImage(delta: number) {
  if (route.kind !== 'viewer') return;
  const project = projects.find(p => p.slug === (route as { slug: string }).slug)!;
  navigate(projectUrl(project.slug, adjacentIndex(route.index, delta, project.images.length)), { ...history.state, bo: true }, undefined, true);
}
function closeViewer() {
  if (route.kind !== 'viewer') return;
  const origin = (history.state as PageState).origin;
  const id = projects.find(p => p.slug === (route as { slug: string }).slug)!.images[route.index].id;
  navigate(origin?.url ?? '/?mode=grid', { bo: true, scroll: origin?.scroll, focus: origin?.focus }, undefined, false, `photo-${id}`);
}

document.addEventListener('click', event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target as HTMLElement;
  const hit = target.closest('.image-hit');
  if (hit) { changeImage(hit.classList.contains('next-image') ? 1 : -1); return; }
  const link = target.closest<HTMLAnchorElement>('a');
  if (!link || link.origin !== location.origin || link.hash || link.target || link.hasAttribute('download')) return;
  if (link.id === 'close-viewer') { event.preventDefault(); closeViewer(); return; }
  const next = parseRoute(new URL(link.href), projects);
  if (next.kind === 'missing') return;
  event.preventDefault();
  if (next.kind === 'viewer') {
    let origin = (history.state as PageState).origin;
    if (route.kind === 'archive') {
      const url = `/?mode=${route.mode}&slug=${next.slug}`;
      origin = { url, scroll: scrollY, focus: link.id };
      history.replaceState({ bo: true, scroll: scrollY, focus: link.id }, '', url);
    }
    navigate(link.pathname + link.search, { bo: true, origin }, link.classList.contains('archive-image') ? link : undefined);
  } else { navigate(link.pathname + link.search, { bo: true, scroll: 0 }); focusMain(); }
});
document.addEventListener('keydown', event => {
  if (route.kind !== 'viewer' || event.altKey || event.metaKey || event.ctrlKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); changeImage(event.key === 'ArrowRight' ? 1 : -1); }
  if (event.key === 'Escape') { event.preventDefault(); closeViewer(); }
});
let touch: { x: number; y: number } | undefined;
let swipedAt = 0;
main.addEventListener('touchstart', event => {
  if (route.kind === 'viewer' && event.touches.length === 1) touch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  else touch = undefined;
}, { passive: true });
main.addEventListener('touchend', event => {
  if (!touch) return;
  const dx = event.changedTouches[0].clientX - touch.x;
  const dy = event.changedTouches[0].clientY - touch.y;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) { changeImage(dx < 0 ? 1 : -1); swipedAt = Date.now(); }
  touch = undefined;
}, { passive: true });
main.addEventListener('touchcancel', () => touch = undefined, { passive: true });
main.addEventListener('click', event => { if (Date.now() - swipedAt < 450) { event.preventDefault(); event.stopPropagation(); } }, true);
addEventListener('popstate', () => { transition?.skipTransition(); render(); });
addEventListener('pagehide', saveScroll);
function hoverProject(target: EventTarget | null) {
  if (route.kind !== 'archive') return;
  const item = target instanceof Element ? target.closest<HTMLElement>('.archive-image') : null;
  const slug = item?.dataset.project;
  main.querySelectorAll<HTMLElement>('.archive-image').forEach(image => image.classList.toggle('dimmed', !!slug && image.dataset.project !== slug));
  header.querySelector('.page-label')!.textContent = slug ? projects.find(project => project.slug === slug)!.title : route.mode === 'grid' ? 'Index' : 'Overview';
}
main.addEventListener('pointerover', event => { if (event.pointerType === 'mouse') hoverProject(event.target); });
main.addEventListener('pointerleave', () => hoverProject(null));
main.addEventListener('focusin', event => hoverProject(event.target));
main.addEventListener('focusout', event => hoverProject(event.relatedTarget));
let scrollTimer: ReturnType<typeof setTimeout>;
addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(saveScroll, 120); }, { passive: true });
render();
