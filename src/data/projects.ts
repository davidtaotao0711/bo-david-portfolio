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
export const projects: Project[] = projectData;
