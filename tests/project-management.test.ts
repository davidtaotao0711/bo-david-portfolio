import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { EditorStore } from '../scripts/editor-store';
import { createProject, deleteProject, removePhotos, repository } from '../src/lib/github-model';
import type { Project } from '../src/data/projects';

test('project lifecycle persists with photo preservation, backups and stale-write protection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bo-project-test-'));
  await mkdir(join(root, 'src/data'), {recursive:true});
  const photo = {id:'library-photo',src:'/images/photo.jpg',width:10,height:20,alt:'Library photo'};
  await writeFile(join(root, 'src/data/projects.json'), JSON.stringify([{id:'unassigned',slug:'unassigned',title:'Unassigned',year:'',location:'',description:'',cover:photo.id,images:[photo],github:{repository,key:'unassigned'}}]));
  await writeFile(join(root, 'src/data/image-manifest.json'), '{}');
  const store = new EditorStore(root);
  const before = await store.snapshot();
  await assert.rejects(store.createProject(before.revision, '  '));
  const created = await store.createProject(before.revision, 'My Project');
  const draft = created.projects.find(p=>p.title==='My Project')!;
  assert.equal(draft.cover, ''); assert.deepEqual(draft.images, []);
  await assert.rejects(store.deleteProject(before.revision, draft.slug), /另一个窗口/);
  const populated = await store.addFromLibrary(created.revision, draft.slug, [photo.id]);
  assert.equal(populated.projects.find(p=>p.slug===draft.slug)!.cover, photo.id);
  const deleted = await store.deleteProject(populated.revision, draft.slug);
  assert.equal(deleted.projects.length, 1); assert.equal(deleted.projects[0].images.length, 1);
  await assert.rejects(store.deleteProject(deleted.revision, 'unassigned'), /不能删除/);
  assert.deepEqual(await new EditorStore(root).snapshot(), deleted);
  assert.equal((await readdir(join(root, '.cache/editor-history'))).length, 3);

  const newDraft = await store.createProject(deleted.revision, 'Upload');
  const bytes = await sharp({create:{width:10,height:20,channels:3,background:'#446677'}}).jpeg().toBuffer();
  const uploaded = await store.upload(newDraft.revision, 'upload', bytes, 'test.jpg');
  const uploadedProject = uploaded.projects.find(p=>p.slug==='upload')!;
  assert.equal(uploadedProject.cover, uploadedProject.images[0].id);
  const preserved = await store.deleteProject(uploaded.revision, 'upload');
  assert.equal(preserved.projects[0].images.length, 2);
});

test('names support Chinese and collisions; deleting the last ordinary project keeps a library', () => {
  const projects: Project[] = [];
  assert.throws(()=>createProject(projects, 'Unassigned', 'project-test'));
  const chinese = createProject(projects, '夏日散步', 'project-test');
  assert.equal(chinese.title, '夏日散步'); assert.equal(chinese.slug, 'project-test');
  assert.equal(createProject(projects, 'Editor', 'unused').slug, 'editor-2');
  assert.equal(createProject(projects, 'Editor', 'unused').slug, 'editor-3');
  deleteProject(projects, chinese.slug); deleteProject(projects, 'editor-2'); deleteProject(projects, 'editor-3');
  assert.equal(projects.length, 1); assert.equal(projects[0].github?.key, 'unassigned');
  assert.deepEqual(projects[0].images, []);
});

test('removing photos updates covers, supports empty drafts and preserves other uses', () => {
  const a = {id:'a',src:'/a.jpg',width:10,height:20,alt:'A'};
  const b = {...a,id:'b',src:'/b.jpg',alt:'B'};
  const base: Project = {id:'album',slug:'album',title:'Album',year:'',location:'',description:'',cover:'a',images:[a,b]};
  const projects: Project[] = [structuredClone(base), {...structuredClone(base),id:'other',slug:'other'}];
  const before = JSON.stringify(projects);
  assert.throws(()=>removePhotos(projects,'album',['a','missing']));
  assert.equal(JSON.stringify(projects),before);
  removePhotos(projects,'album',['a']);
  assert.equal(projects[0].cover,'b'); assert.equal(projects[0].images.length,1);
  const library = projects.find(p=>p.github?.key==='unassigned')!;
  assert.deepEqual(library.images.map(p=>p.id),['a']);
  removePhotos(projects,'album',['b']);
  assert.equal(projects[0].cover,''); assert.equal(projects[0].images.length,0);
  assert.equal(library.images.length,2);
  removePhotos(projects,library.slug,['a']);
  assert.deepEqual(library.images.map(p=>p.id),['b']);
  assert.equal(projects[1].images.length,2);
  const placeholder = {...a,id:'color',placeholderColor:'#888888'};
  projects[0].images=[placeholder]; projects[0].cover='color';
  deleteProject(projects,'album');
  assert.equal(library.images.some(p=>p.placeholderColor),false);
});
