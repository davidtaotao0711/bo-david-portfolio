import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { groupsFromData, mergeGroup, repository, GitHubSync } from '../scripts/github-sync';
import { EditorStore } from '../scripts/editor-store';
import type { Project, PortfolioImage } from '../src/data/projects';
import { addFromUnassigned } from '../src/lib/github-model';

const photo = (id: string, blob = 'original'): PortfolioImage => ({ id, src: `/images/${blob}.jpg`, width: 100, height: 200, alt: id, github: { repository, photoId: id, path: `/images/${id}.jpg`, blob } });
const group = { key: 'series:test', title: 'Remote title', year: '2026', description: '', cover: 'b', photos: [] };
test('sync is idempotent and preserves local order, cover, metadata and removed remote photos', () => {
  const projects: Project[] = [];
  assert.deepEqual(mergeGroup(projects, group, [photo('a'), photo('b')]), { added: 2, updated: 0 });
  assert.equal(projects[0].cover, 'b');
  projects[0].images.reverse(); projects[0].cover = 'a'; projects[0].title = 'Local title';
  const before = JSON.stringify(projects);
  assert.deepEqual(mergeGroup(projects, group, [photo('a'), photo('b')]), { added: 0, updated: 0 });
  assert.equal(JSON.stringify(projects), before);
  assert.deepEqual(mergeGroup(projects, group, [photo('a', 'changed'), photo('c')]), { added: 1, updated: 1 });
  assert.deepEqual(projects[0].images.map(p => p.id), ['b', 'a', 'c']);
  assert.equal(projects[0].cover, 'a'); assert.equal(projects[0].title, 'Local title');
  assert.equal(projects[0].images[1].src, '/images/changed.jpg');
});
test('all synchronized photos enter the Unassigned library regardless of remote series', () => {
  const groups = groupsFromData([{ id: 'a', image: '/images/a.jpg', series: 'one' }, { id: 'b', image: '/images/b.jpg', series: '' }], [{ slug: 'one', title: 'One', coverImage: '/images/b.jpg' }]);
  assert.deepEqual(groups.map(g => g.photos.map(p => p.id)), [['a', 'b']]);
  assert.equal(groups[0].key, 'unassigned');
  assert.throws(() => groupsFromData([{ id: 'a', image: 'x' }, { id: 'a', image: 'y' }], []));
});

test('library additions preserve originals and covers, skip duplicates, reject invalid IDs and follow source updates', () => {
  const projects: Project[] = [];
  const libraryGroup = { ...group, key: 'unassigned', title: 'Unassigned' };
  mergeGroup(projects, libraryGroup, [photo('a'), photo('b')]);
  const target: Project = {id:'target',slug:'target',title:'Target',year:'',location:'',description:'',cover:'local',images:[photo('local')]};
  projects.push(target);
  addFromUnassigned(projects, 'target', ['b', 'a']);
  addFromUnassigned(projects, 'target', ['a']);
  assert.deepEqual(target.images.map(p => p.id), ['local', 'b', 'a']);
  assert.equal(target.cover, 'local');
  assert.deepEqual(projects[0].images.map(p => p.id), ['a','b']);
  assert.notEqual(target.images[2], projects[0].images[0]);
  const before = JSON.stringify(projects);
  assert.throws(() => addFromUnassigned(projects, 'target', ['b', 'missing']));
  assert.equal(JSON.stringify(projects), before);
  mergeGroup(projects, libraryGroup, [photo('a', 'updated'), photo('b')]);
  assert.equal(target.images[2].src, '/images/updated.jpg');
  assert.equal(target.cover, 'local');
});
test('failed sync actions never publish partial projects; a stale revision cannot start sync', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bo-sync-test-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/projects.json'), '[]');
  await writeFile(join(root, 'src/data/image-manifest.json'), '{}');
  const store = new EditorStore(root); const before = await store.snapshot();
  await assert.rejects(store.mutate(before.revision, projects => { mergeGroup(projects, group, [photo('a')]); throw new Error('network interrupted'); }), /network interrupted/);
  assert.deepEqual(await store.snapshot(), before);
  const sync = new GitHubSync(root, store);
  await assert.rejects(sync.start('stale'), /刷新/); assert.equal(sync.status.state, 'idle');
  const after = await store.mutate(before.revision, () => {}); assert.equal(after.revision, before.revision);
});
