export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: string;
  summary?: string; // Information Architecture description
  sections?: string[]; // Internal page sections (e.g., #hero, #features)
}

export interface SitemapNode {
  name: string;
  fullUrl: string;
  data: SitemapUrl;
  children?: SitemapNode[];
  type?: 'page' | 'section'; // Distinguish between actual pages and internal sections
}

export interface ProcessingState {
  isProcessing: boolean;
  error: string | null;
}