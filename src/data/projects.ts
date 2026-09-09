export interface PortfolioImage {
  id: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  placeholderColor?: string;
  github?: { repository: string; photoId: string; path: string; blob: string };
}

export interface Project {
  indexCard?: { order:number; before:('portrait'|'landscape')[]; after:('portrait'|'landscape')[] };
  layout?: import('../lib/gallery-layout').LayoutSlot[];
  arrangement?: 'color' | 'theme';
  id: string;
  slug: string;
  title: string;
  year: string;
  location: string;
  description: string;
  cover: string;
  images: PortfolioImage[];
  github?: { repository: string; key: string };
}

import projectData from './projects.json';
import { arrangedProjects } from '../lib/arrangements';
export const allProjects = projectData as Project[];
export const colorProjects = arrangedProjects(allProjects, 'color');
export const themeProjects = arrangedProjects(allProjects, 'theme');
// The editor keeps drafts and its library; public routes use the two curated views.
export const projects: Project[] = [...colorProjects, ...themeProjects];
