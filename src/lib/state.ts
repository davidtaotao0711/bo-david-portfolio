import type { Project } from '../data/projects';
export type Mode = 'grid' | 'overview';
export type Route = { kind: 'archive'; mode: Mode; slug?: string } | { kind: 'information' } | { kind: 'viewer'; slug: string; index: number } | { kind: 'missing' };
export type ReturnContext = { url: string; scroll: number; focus?: string };
export type PageState = { bo: true; scroll?: number; focus?: string; origin?: ReturnContext };

export function parseRoute(url: URL, projects: Project[]): Route {
  const path = url.pathname.replace(/^\/+|\/+$/g, '');
  if (path === 'information') return { kind: 'information' };
  if (!path) return { kind: 'archive', mode: url.searchParams.get('mode') === 'overview' ? 'overview' : 'grid', slug: url.searchParams.get('slug') || undefined };
  const project = projects.find(p => p.slug === path);
  if (!project) return { kind: 'missing' };
  const raw = url.searchParams.get('s') ?? '0';
  const index = /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Math.min(Number(raw), project.images.length - 1) : 0;
  return { kind: 'viewer', slug: project.slug, index };
}
export function projectUrl(slug: string, index = 0) { return `/${slug}?s=${index}`; }
export function adjacentIndex(index: number, delta: number, length: number) { return (index + delta + length) % length; }
export function neighborIndices(index: number, length: number) {
  return [...new Set([adjacentIndex(index, -1, length), index, adjacentIndex(index, 1, length)])];
}
