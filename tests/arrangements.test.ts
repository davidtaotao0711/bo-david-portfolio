import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangedProjects, photoKey } from '../src/lib/arrangements';
import { createProject, setArrangement, repository } from '../src/lib/github-model';
import type { Project, PortfolioImage } from '../src/data/projects';

const photo = (id: string): PortfolioImage => ({id,src:`/${id}.jpg`,width:200,height:300,alt:id});
const group = (id: string, images: PortfolioImage[], arrangement?: 'color'|'theme'): Project => ({id,slug:id,title:id,images,cover:images[0]?.id??'',year:'',location:'',description:'',arrangement});
test('each arrangement shows only its assigned projects without synthetic unsorted groups', () => {
  const a = photo('a'), b = photo('b'), c = photo('c');
  const source = [group('blue',[a,b]),group('green',[b]),group('japan',[a,c],'theme'),group('draft',[],'theme'),{...group('unassigned',[a,b,c,photo('private')]),github:{repository,key:'unassigned'}}];
  const before = JSON.stringify(source);
  const color = arrangedProjects(source,'color'), theme = arrangedProjects(source,'theme');
  assert.deepEqual(color.map(p=>p.slug),['blue','green']);
  assert.deepEqual(theme.map(p=>p.slug),['japan']);
  assert.deepEqual([...new Set(color.flatMap(p=>p.images.map(photoKey)))].sort(),['a','b']);
  assert.deepEqual(theme[0].images.map(p=>p.id),['a','c']);
  assert.equal(JSON.stringify(source),before);
  assert.deepEqual(arrangedProjects([source[4]],'theme'),[]);
});
test('theme classification supports creation, reassignment and rejects library or invalid updates', () => {
  const source: Project[] = [];
  const theme = createProject(source,'Japan','fallback','theme');
  assert.equal(theme.arrangement,'theme');
  setArrangement(source,theme.slug,'color');
  assert.equal(theme.arrangement,'color');
  assert.throws(()=>setArrangement(source,theme.slug,'invalid'));
  assert.throws(()=>setArrangement(source,'missing','theme'));
  source.push({...group('unassigned',[]),github:{repository,key:'unassigned'}});
  assert.throws(()=>setArrangement(source,'unassigned','theme'));
  assert.equal(createProject(source,'Unsorted by Theme','fallback').slug,'unsorted-by-theme-2');
});
