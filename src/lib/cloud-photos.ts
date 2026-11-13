import type { PortfolioImage } from '../data/projects';

export const cloudEditor = 'https://bophotography.work';
export const cloudImages = 'https://img.bophotography.work';
const hashPattern = /^[a-f0-9]{64}$/;
const pathPattern = /^\/images\/(?:[\w.-]+\/)*[\w.-]+\.(?:jpe?g|png|webp)$/i;
const validPath = (value: unknown): value is string => typeof value === 'string' && pathPattern.test(value)
  && !value.split('/').some(part => part === '.' || part === '..');

export type CloudPhoto = { hash: string; image: string; entry: {
  width: number; height: number; variants: { width: number; src: string }[]; placeholder?: string;
} };

export function toCloudPhoto(value: unknown): PortfolioImage {
  const { hash, image, entry } = (value ?? {}) as CloudPhoto;
  const { width, height, variants, placeholder } = entry ?? {};
  if (typeof hash !== 'string' || !hashPattern.test(hash) || !validPath(image) || !Number.isInteger(width)
    || !Number.isInteger(height) || width < 1 || height < 1 || Math.max(width, height) > 2000
    || !Array.isArray(variants) || variants.length > 12 || variants.some(item => !item || !validPath(item.src)
      || !Number.isInteger(item.width) || item.width < 1 || item.width > width)) {
    throw new Error('云端图库返回了无效的照片。');
  }
  const safePlaceholder = /^data:image\/webp;base64,[a-z\d+/=]+$/i.test(placeholder ?? '') && placeholder!.length < 4096 ? placeholder : '';
  return { id: `cloud-${hash}`, src: image, width, height, alt: image.split('/').at(-1)!,
    cloud: { variants: variants.map(({ width, src }) => ({ width, src })).sort((a, b) => a.width - b.width), placeholder: safePlaceholder } };
}

export function cloudThumbnail(photo: PortfolioImage) {
  if (!photo.cloud) return '';
  return `${cloudImages}${photo.cloud.variants.find(item => item.width >= 320)?.src ?? photo.src}`;
}
