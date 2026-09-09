import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Project } from '../src/data/projects';
import { projectLayout, galleryRuns, saveProjectLayout, frameRatio, type LayoutSlot } from '../src/lib/gallery-layout';
import { EditorStore } from '../scripts/editor-store';
const fixture = ():Project => ({id:'album',slug:'album',title:'Album',year:'',location:'',description:'',cover:'p',images:[{id:'p',src:'/p.jpg',width:100,height:400,alt:'Portrait'},{id:'l',src:'/l.jpg',width:500,height:100,alt:'Landscape'}]});
const blank:LayoutSlot={kind:'blank',id:'blank-test',orientation:'portrait'};

test('standard frames crop extremes; runs keep different orientations on separate rows',()=>{
  const project=fixture();
  assert.equal(frameRatio(project.images[0]),'2/3'); assert.equal(frameRatio(project.images[1]),'3/2'); assert.equal(frameRatio({width:10,height:10}),'1/1');
  saveProjectLayout(project,[{kind:'photo',id:'p'},blank,{kind:'photo',id:'l'}]);
  const runs=galleryRuns(project);
  assert.deepEqual(runs.map(run=>[run.orientation,run.slots.length]),[['portrait',2],['landscape',1]]);
  assert.equal(project.images.length,2); assert.equal(project.cover,'p');
});
test('layout validation is atomic; reordering, deleting and adding photos retain usable blank slots',()=>{
  const project=fixture();
  saveProjectLayout(project,[{kind:'photo',id:'l'},blank,{kind:'photo',id:'p'}]);
  assert.deepEqual(project.images.map(photo=>photo.id),['l','p']);
  const before=JSON.stringify(project);
  for(const bad of [[blank],[{kind:'photo',id:'l'},{kind:'photo',id:'l'}],[{kind:'blank',id:'p',orientation:'portrait'},{kind:'photo',id:'l'}]]) assert.throws(()=>saveProjectLayout(project,bad));
  assert.equal(JSON.stringify(project),before);
  project.images.reverse();
  assert.deepEqual(projectLayout(project).map(slot=>slot.id),['p','blank-test','l']);
  project.images=project.images.filter(photo=>photo.id!=='l');
  assert.deepEqual(projectLayout(project).map(slot=>slot.id),['blank-test','p']);
  project.images.push({id:'new',src:'/new.jpg',width:10,height:20,alt:'New'});
  assert.deepEqual(projectLayout(project).map(slot=>slot.id),['blank-test','p','new']);
  project.github={repository:'source',key:'unassigned'};
  assert.throws(()=>saveProjectLayout(project,projectLayout(project)));
});
test('saved blank layout survives reopening and stale requests cannot replace it',async()=>{
  const root=await mkdtemp(join(tmpdir(),'bo-layout-')); await mkdir(join(root,'src/data'),{recursive:true});
  await writeFile(join(root,'src/data/projects.json'),JSON.stringify([fixture()]));
  await writeFile(join(root,'src/data/image-manifest.json'),'{}');
  const store=new EditorStore(root), initial=await store.snapshot();
  const layout:LayoutSlot[]=[{kind:'photo',id:'p'},blank,{kind:'photo',id:'l'}];
  const saved=await store.saveLayout(initial.revision,'album',layout);
  assert.deepEqual(saved.projects[0].layout,layout);
  await assert.rejects(store.saveLayout(initial.revision,'album',layout),/另一个窗口/);
  assert.deepEqual((await new EditorStore(root).snapshot()).projects[0].layout,layout);
  const removed=await store.saveLayout(saved.revision,'album',layout.filter(slot=>slot.kind==='photo'));
  assert.equal(removed.projects[0].images.length,2);
  assert.equal(removed.projects[0].layout?.some(slot=>slot.kind==='blank'),false);
});
