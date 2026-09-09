export function normalizeBase(base = '/') {
  const value = `/${base}`.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  return value === '/' ? '' : value;
}

export function withBase(path: string, base = '/') {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const prefix = normalizeBase(base);
  if (!prefix || path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) return path;
  return `${prefix}${path}`;
}

export function stripBase(pathname: string, base = '/') {
  const prefix = normalizeBase(base);
  if (!prefix) return pathname;
  if (pathname === prefix || pathname === `${prefix}/`) return '/';
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
}
