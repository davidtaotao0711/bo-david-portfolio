import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { EditorStore, reorder } from '../scripts/editor-store';
import { generateAsset } from '../scripts/image-pipeline';

test('reordering must preserve every photo exactly once', () => {
  const images = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
  assert.deepEqual(reorder(images, ['three', 'one', 'two']).map(i => i.id), ['three', 'one', 'two']);
  for (const ids of [['one', 'one', 'three'], ['one'], ['one', 'two', '../secret']]) assert.throws(() => reorder(images, ids));
});

test('upload, order, cover and placeholder removal persist with backups and conflict checks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bo-editor-test-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  const dummy = { id: 'demo-01', src: '/images/originals/demo-01.jpg', width: 160, height: 200, alt: 'Test color', placeholderColor: '#888888' };
  await writeFile(join(root, 'src/data/projects.json'), JSON.stringify([{ id: 'demo', slug: 'demo', title: 'Demo', year: '2026', location: 'Shanghai', description: '', cover: dummy.id, images: [dummy] }]));
  await writeFile(join(root, 'src/data/image-manifest.json'), '{}');
  const store = new EditorStore(root);
  const original = await store.snapshot();
  await assert.rejects(() => store.clearPlaceholders(original.revision, 'demo'), /先上传/);
  await assert.rejects(() => store.upload(original.revision, 'demo', Buffer.from('not an image'), 'bad.jpg'), /无法读取/);
  assert.equal((await store.snapshot()).revision, original.revision);
  const bytes = await sharp({ create: { width: 160, height: 200, channels: 3, background: '#446677' } }).jpeg().toBuffer();
  const uploaded = await store.upload(original.revision, 'demo', bytes, '../../test.jpg');
  assert.equal(uploaded.projects[0].images.length, 2);
  const real = uploaded.projects[0].images[1];
  assert.equal(real.width, 160); assert.equal(real.height, 200);
  assert.match(real.src, /^\/images\/originals\/demo\/demo-[a-f0-9-]+\.jpg$/);
  assert.ok((await readFile(join(root, 'public', real.src))).equals(bytes));
  const manifest = JSON.parse(await readFile(join(root, 'src/data/image-manifest.json'), 'utf8'));
  for (const width of [320,640,960,1440,2000]) for (const format of ['avif','webp','jpg']) {
    const asset = await sharp(join(root, 'public', `${manifest[real.id].base}-${width}.${format}`)).metadata();
    assert.equal(asset.width, width);
  }
  // A late interrupted encode may leave the JPEG marker but lose another variant.
  const interrupted = join(root, 'public', `${manifest[real.id].base}-2000.avif`);
  await unlink(interrupted);
  await generateAsset(real, join(root, 'public'));
  assert.equal((await sharp(interrupted).metadata()).width, 2000);
  await assert.rejects(() => store.saveOrder(original.revision, 'demo', [real.id, dummy.id], real.id), /另一个窗口/);
  const sorted = await store.saveOrder(uploaded.revision, 'demo', [real.id, dummy.id], real.id);
  assert.equal(sorted.projects[0].cover, real.id); assert.equal(sorted.projects[0].images[0].id, real.id);
  const cleared = await store.clearPlaceholders(sorted.revision, 'demo');
  assert.equal(cleared.projects[0].images.length, 1);
  assert.equal(cleared.projects[0].cover, real.id);
  assert.equal((await readdir(join(root, '.cache/editor-history'))).length, 3);
});
