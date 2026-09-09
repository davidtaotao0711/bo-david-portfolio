import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, adjacentIndex, neighborIndices } from '../src/lib/state';
import type { Project } from '../src/data/projects';
const projects: Project[] = [{
  id:'xinjiang',slug:'xinjiang',title:'Route test fixture',year:'',location:'',description:'',cover:'test-0',
  images:Array.from({length:12}, (_,index)=>({id:`test-${index}`,src:`/test-${index}.jpg`,width:10,height:20,alt:`Test ${index}`})),
}];
const parse = (path: string) => parseRoute(new URL(path, 'http://localhost'), projects);

test('deep links recover the exact project and zero-based image', () => {
  assert.deepEqual(parse('/xinjiang?s=7'), { kind: 'viewer', slug: 'xinjiang', index: 7 });
  assert.deepEqual(parse('/xinjiang/?s=0'), { kind: 'viewer', slug: 'xinjiang', index: 0 });
});
test('invalid indices are normalized and never yield a missing image', () => {
  for (const index of ['-1', 'NaN', '1.5', 'Infinity', '999999999999999999999']) {
    assert.deepEqual(parse(`/xinjiang?s=${index}`), { kind: 'viewer', slug: 'xinjiang', index: 0 });
  }
  assert.deepEqual(parse('/xinjiang?s=999'), { kind: 'viewer', slug: 'xinjiang', index: 11 });
});
test('archive context is distinct from an open project', () => {
  assert.deepEqual(parse('/?mode=overview&slug=xinjiang'), { kind: 'archive', mode: 'overview', slug: 'xinjiang' });
  assert.deepEqual(parse('/?mode=invalid'), { kind: 'archive', mode: 'grid', slug: undefined });
  assert.deepEqual(parse('/unknown?s=0'), { kind: 'missing' });
  assert.deepEqual(parse('/information'), { kind: 'information' });
});
test('wrap-around includes only the current image and immediate neighbors', () => {
  assert.deepEqual(neighborIndices(0, 12), [11, 0, 1]);
  assert.deepEqual(neighborIndices(11, 12), [10, 11, 0]);
  assert.deepEqual(neighborIndices(0, 1), [0]);
  assert.deepEqual(neighborIndices(1, 2), [0, 1]);
  assert.equal(adjacentIndex(5, 1, 6), 0);
  assert.equal(adjacentIndex(0, -1, 6), 5);
});
