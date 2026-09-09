type Shot = { key: string; rect: DOMRect; image: HTMLImageElement; src: string; fit: string };

/** Replaces the layout immediately, then bridges visible photographs with temporary sprites. */
export function scatterReflow(root: HTMLElement, update: () => void): { finished: Promise<void>; cancel(): void } {
  const instant = () => { update(); return { finished: Promise.resolve(), cancel() {} }; };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !Element.prototype.animate) return instant();
  const width = innerWidth, height = innerHeight, cap = width < 700 ? 28 : 64;
  const capture = (): Shot[] => {
    const shots: Shot[] = [];
    root.querySelectorAll<HTMLElement>('.archive-image .photo').forEach(photo => {
      const image = photo.querySelector('img'), anchor = photo.closest<HTMLElement>('[data-photo]');
      if (!image || !anchor) return;
      const rect = photo.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width) return;
      const thumb = image.dataset.thumb || photo.dataset.thumb || anchor.dataset.thumb;
      const src = (image.complete && image.naturalWidth ? image.currentSrc : thumb) || image.currentSrc || image.src;
      if (src) shots.push({ key: anchor.dataset.photo!, rect, image, src, fit: getComputedStyle(image).objectFit });
    });
    const limit = cap;
    return shots.length <= limit ? shots : Array.from({ length: limit }, (_, i) => shots[Math.floor(i * shots.length / limit)]);
  };
  const before = capture();
  const visibility = root.style.getPropertyValue('visibility'), priority = root.style.getPropertyPriority('visibility');
  const inert = root.inert;
  const overlay = document.createElement('div');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;overflow:hidden;contain:strict;';
  const animations: Animation[] = [];
  let resolve!: () => void, done = false, timer: ReturnType<typeof setTimeout> | undefined;
  const finished = new Promise<void>(settle => { resolve = settle; });
  const cleanup = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    animations.forEach(animation => animation.cancel());
    overlay.remove();
    if (visibility) root.style.setProperty('visibility', visibility, priority);
    else root.style.removeProperty('visibility');
    root.inert = inert;
    resolve();
  };
  try {
    // All measurements occur before animation; no animation frame performs layout work.
    update();
    const after = capture();
    const destinations = new Map<string, Shot[]>();
    after.forEach(shot => destinations.set(shot.key, [...(destinations.get(shot.key) || []), shot]));
    const pairs: { from?: Shot; to?: Shot }[] = before.map(from => ({ from, to: destinations.get(from.key)?.shift() }));
    destinations.forEach(shots => shots.forEach(to => pairs.push({ to })));
    if (!pairs.length) { cleanup(); return { finished, cancel: cleanup }; }
    const hash = (key: string) => {
      let n = 2166136261;
      for (let i = 0; i < key.length; i++) n = Math.imul(n ^ key.charCodeAt(i), 16777619);
      return (n >>> 0) / 4294967296;
    };
    const visiblePairs = pairs.length <= cap ? pairs : Array.from({ length: cap }, (_, i) => pairs[Math.floor(i * pairs.length / cap)]);
    visiblePairs.forEach(({ from, to }, index) => {
      const shot = from || to!;
      const sprite = shot.image.cloneNode(false) as HTMLImageElement;
      sprite.removeAttribute('srcset'); sprite.removeAttribute('sizes'); sprite.removeAttribute('id');
      sprite.removeAttribute('class'); sprite.removeAttribute('loading');
      sprite.src = shot.src; sprite.alt = ''; sprite.draggable = false;
      const base = shot.rect, end = to?.rect || base;
      sprite.style.cssText = `position:absolute;left:0;top:0;width:${base.width}px;height:${base.height}px;max-width:none;max-height:none;margin:0;display:block;opacity:1;transform-origin:0 0;object-fit:${shot.fit};will-change:transform,opacity;`;
      const seed = `${shot.key}:${index}`;
      const tiny = 12 + hash(seed + 'size') * 6;
      const scale = tiny / Math.max(base.width, base.height);
      const x = 12 + hash(seed + 'x') * Math.max(0, width - tiny - 24);
      const y = 12 + hash(seed + 'y') * Math.max(0, height - tiny - 24);
      const transform = (left: number, top: number, sx: number, sy = sx) => `translate3d(${left}px,${top}px,0) scale(${sx},${sy})`;
      const small = transform(x, y, scale);
      const collapsed = transform(base.left + base.width / 2 - base.width * scale / 2, base.top + base.height / 2 - base.height * scale / 2, scale);
      overlay.append(sprite);
      animations.push(sprite.animate([
        { transform: from ? transform(base.left, base.top, 1) : small, opacity: from ? 1 : 0, offset: 0 },
        { transform: from ? collapsed : small, opacity: 1, offset: 0.23, easing: 'cubic-bezier(.22,.7,.2,1)' },
        { transform: small, opacity: 1, offset: 0.48 },
        { transform: small, opacity: 1, offset: 0.59, easing: 'cubic-bezier(.2,.75,.2,1)' },
        { transform: to ? transform(end.left, end.top, end.width / base.width, end.height / base.height) : small, opacity: to ? 1 : 0, offset: 1 },
      ], { duration: 1000, delay: index % 8 * 10, fill: 'both', easing: 'cubic-bezier(.22,.65,.3,1)' }));
    });
    document.body.append(overlay);
    root.style.setProperty('visibility', 'hidden', 'important');
    root.inert = true;
    // Timeout also settles cancellation and background-tab animation edge cases.
    timer = setTimeout(cleanup, 1180);
    void Promise.allSettled(animations.map(animation => animation.finished)).then(cleanup);
  } catch (error) {
    cleanup();
    throw error;
  }
  return { finished, cancel: cleanup };
}
