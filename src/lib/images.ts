import manifestData from '../data/image-manifest.json';
import type { PortfolioImage } from '../data/projects';
import { withBase } from './base-path';
import { cloudImages } from './cloud-photos';
export type ImageAsset = { width: number; height: number; tiny: string; base: string; widths: number[]; cloud?: PortfolioImage['cloud'] };
const manifest = manifestData as Record<string, ImageAsset>;
export function asset(image: PortfolioImage): ImageAsset {
  if (!image.cloud) return manifest[image.id];
  return { width: image.width, height: image.height, tiny: image.cloud.placeholder || '', base: image.src,
    widths: image.cloud.variants.map(variant => variant.width), cloud: image.cloud };
}
export function imageUrl(image: ImageAsset, width: number, format: string, base = '/') {
  if (image.cloud) return `${cloudImages}${image.cloud.variants.find(variant => variant.width >= width)?.src ?? image.base}`;
  return withBase(`${image.base}-${width}.${format}`, base);
}
export function srcset(image: ImageAsset, format: string, thumbnail = false, base = '/') {
  if (image.cloud) {
    const variants = image.cloud.variants;
    const small = variants.filter(variant => variant.width <= 640);
    return (thumbnail && small.length ? small : variants).map(variant => `${cloudImages}${variant.src} ${variant.width}w`).join(', ');
  }
  return image.widths.filter(w => !thumbnail || w <= 640).map(w => `${imageUrl(image, w, format, base)} ${w}w`).join(', ');
}
export const overviewSizes = (image: Pick<PortfolioImage, 'width' | 'height'>) => image.width > image.height
  ? '(max-width: 600px) calc((90vw - 27px) / 2), (max-width: 1000px) calc((97vw - 52px) / 4), calc((97vw - 78px) / 6)'
  : '(max-width: 600px) calc((90vw - 39px) / 3), (max-width: 1000px) calc((97vw - 78px) / 6), calc((97vw - 117px) / 9)';
export const indexSizes = '(max-width: 600px) calc((90vw - 24px) / 2), (max-width: 1000px) 31vw, 19vw';
