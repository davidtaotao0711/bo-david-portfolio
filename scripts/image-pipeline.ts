import sharp, { type Sharp } from 'sharp';
import { mkdir, readFile, stat, rename } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { PortfolioImage } from '../src/data/projects';
export type GeneratedAsset = { width: number; height: number; tiny: string; base: string; widths: number[] };
async function publish(image: Sharp, path: string) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await image.toFile(temp);
  await rename(temp, path);
}
export async function generateAsset(photo: PortfolioImage, root: string): Promise<GeneratedAsset> {
  const output = resolve(root, 'images/generated');
  await mkdir(output, { recursive: true });
  const widths = [320, 640, 960, 1440, 2000];
    const source = resolve(root, `.${photo.src}`);
    if (!source.startsWith(root + sep)) throw new Error(`Image must be inside public: ${photo.src}`);
    let buffer: Buffer;
    try { buffer = await readFile(source); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !photo.placeholderColor) throw error;
      buffer = await sharp({ create: { width: photo.width, height: photo.height, channels: 3, background: photo.placeholderColor } }).jpeg().toBuffer();
    }
    const hash = createHash('sha256').update(buffer).update('pipeline-v1').digest('hex').slice(0,12);
    const base = `/images/generated/${photo.id}-${hash}`;
    const metadata = await sharp(buffer).rotate().metadata();
    const swapped = [5,6,7,8].includes(metadata.orientation ?? 1);
    const width = (swapped ? metadata.height : metadata.width)!;
    const height = (swapped ? metadata.width : metadata.height)!;
    if (width !== photo.width || height !== photo.height) throw new Error(`Dimensions for ${photo.id} should be ${width} × ${height}`);
    const tiny = `data:image/webp;base64,${(await sharp(buffer).rotate().resize(20).blur().webp({ quality: 30 }).toBuffer()).toString('base64')}`;
    const missing = new Set((await Promise.all(widths.flatMap(size => ['webp', 'jpg'].map(async format => {
      const name = `${size}.${format}`;
      return await stat(resolve(root, `.${base}-${name}`)).then(file => file.size > 0).catch(() => false) ? null : name;
    })))).filter((name): name is string => name !== null));
    if (missing.size) {
      for (const size of widths) {
        const resized = sharp(buffer).rotate().resize({ width: size });
        await Promise.all([
          missing.has(`${size}.webp`) && publish(resized.clone().webp({ quality: 80 }), resolve(root, `.${base}-${size}.webp`)),
          missing.has(`${size}.jpg`) && publish(resized.clone().jpeg({ quality: 84, mozjpeg: true }), resolve(root, `.${base}-${size}.jpg`)),
        ]);
      }
      // All variants are written before the asset is published.
    }
  return { width, height, tiny, base, widths };
}
