import { SitemapUrl, SitemapNode } from '../types';

export const DEFAULT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2023-10-01</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <summary>Main landing page with core value propositions</summary>
    <section>Hero Banner</section>
    <section>Features Grid</section>
    <section>Testimonials</section>
  </url>
  <url>
    <loc>https://example.com/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
    <summary>Company history, mission, and team details</summary>
    <section>Our Mission</section>
    <section>Leadership Team</section>
  </url>
  <url>
    <loc>https://example.com/services</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
    <summary>Overview of product offerings and services</summary>
  </url>
</urlset>`;

// Helper to safely get text content from an element or its descendants (ignoring namespaces)
const getTagContent = (parent: Element, tagName: string): string | undefined => {
    // Try standard selector
    let el = parent.getElementsByTagName(tagName)[0];
    if (el) return el.textContent || undefined;
    
    // Try namespaced selector
    for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (child.tagName.includes(tagName) || child.localName === tagName) {
            return child.textContent || undefined;
        }
    }
    return undefined;
};

// Helper to get all values for a repeated tag
const getRepeatedTagContent = (parent: Element, tagName: string): string[] => {
    const results: string[] = [];
    const elements = parent.getElementsByTagName(tagName);
    for (let i = 0; i < elements.length; i++) {
        if (elements[i].textContent) results.push(elements[i].textContent!);
    }
    // Fallback for namespaced children if getElementsByTagName fails in some parsers
    if (results.length === 0) {
        for (let i = 0; i < parent.children.length; i++) {
            const child = parent.children[i];
            if ((child.tagName.includes(tagName) || child.localName === tagName) && child.textContent) {
                results.push(child.textContent);
            }
        }
    }
    return results;
};

export const parseSitemapXML = (xml: string): SitemapUrl[] => {
  let urls: SitemapUrl[] = [];
  
  // Method 1: DOM Parser (Preferred)
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, "text/xml");
    
    const parserError = xmlDoc.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
        console.warn("DOM Parser reported error, attempting partial parse or regex fallback");
    }

    // 1. Look for standard <url> tags
    const urlElements = xmlDoc.getElementsByTagName("url");
    for (let i = 0; i < urlElements.length; i++) {
      const node = urlElements[i];
      const loc = getTagContent(node, "loc");
      if (loc) {
        urls.push({
          loc: loc.trim(),
          lastmod: getTagContent(node, "lastmod"),
          changefreq: getTagContent(node, "changefreq") as any,
          priority: getTagContent(node, "priority"),
          summary: getTagContent(node, "summary"),
          sections: getRepeatedTagContent(node, "section")
        });
      }
    }

    // 2. Look for <sitemap> tags (Sitemap Index)
    if (urls.length === 0) {
        const sitemapElements = xmlDoc.getElementsByTagName("sitemap");
        for (let i = 0; i < sitemapElements.length; i++) {
            const node = sitemapElements[i];
            const loc = getTagContent(node, "loc");
            if (loc) {
                urls.push({
                    loc: loc.trim(),
                    lastmod: getTagContent(node, "lastmod"),
                    changefreq: 'monthly',
                    priority: '0.5',
                    summary: 'Sitemap Index File'
                });
            }
        }
    }
  } catch (e) {
    console.warn("DOM Parsing failed completely:", e);
  }

  // Method 2: Regex Fallback
  if (urls.length === 0) {
    console.log("Using Regex Fallback for Sitemap parsing");
    const locRegex = /<loc>(.*?)<\/loc>/g;
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
        if (match[1]) {
            urls.push({
                loc: match[1].trim(),
                priority: '0.5',
                changefreq: 'monthly',
                summary: ''
            });
        }
    }
  }

  if (urls.length === 0) {
    throw new Error("No URLs found. Ensure valid Sitemap XML.");
  }

  return urls;
};

export const generateSitemapXML = (urls: SitemapUrl[]): string => {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  urls.forEach(u => {
    xml += `  <url>\n`;
    xml += `    <loc>${u.loc}</loc>\n`;
    if (u.lastmod) xml += `    <lastmod>${u.lastmod}</lastmod>\n`;
    if (u.changefreq) xml += `    <changefreq>${u.changefreq}</changefreq>\n`;
    if (u.priority) xml += `    <priority>${u.priority}</priority>\n`;
    if (u.summary) xml += `    <summary>${u.summary}</summary>\n`;
    // Add sections
    if (u.sections && u.sections.length > 0) {
        u.sections.forEach(s => {
            xml += `    <section>${s}</section>\n`;
        });
    }
    xml += `  </url>\n`;
  });
  xml += `</urlset>`;
  return xml;
};

export const buildHierarchy = (urls: SitemapUrl[]): SitemapNode => {
  if (urls.length === 0) return { name: 'Empty', fullUrl: '', data: { loc: '' }, children: [] };

  const sortedUrls = [...urls].sort((a, b) => {
    if (a.loc.length !== b.loc.length) return a.loc.length - b.loc.length;
    return a.loc.localeCompare(b.loc);
  });
  
  let rootUrlStr = sortedUrls[0].loc;
  try {
      const u = new URL(rootUrlStr);
      rootUrlStr = u.origin;
  } catch(e) { }

  const root: SitemapNode = {
    name: rootUrlStr.replace(/^https?:\/\//, ''),
    fullUrl: rootUrlStr.endsWith('/') ? rootUrlStr : rootUrlStr + '/',
    data: { loc: rootUrlStr },
    children: [],
    type: 'page'
  };

  const getOrCreateNode = (parentNode: SitemapNode, segment: string, fullPathSoFar: string): SitemapNode => {
      if (!parentNode.children) parentNode.children = [];
      let child = parentNode.children.find(c => c.name === segment && c.type !== 'section'); // Only look for pages
      if (!child) {
          child = {
              name: segment,
              fullUrl: fullPathSoFar,
              data: { loc: fullPathSoFar }, 
              children: [],
              type: 'page'
          };
          parentNode.children.push(child);
      }
      return child;
  };

  sortedUrls.forEach(urlItem => {
    try {
        const u = new URL(urlItem.loc);
        
        // Root Match
        if (urlItem.loc === root.fullUrl || urlItem.loc + '/' === root.fullUrl || root.fullUrl.includes(urlItem.loc)) {
            root.data = urlItem;
        } else {
            // Child match
            let path = u.pathname;
            if (urlItem.loc.startsWith(root.fullUrl)) {
                 path = urlItem.loc.substring(root.fullUrl.length);
            } else if (u.origin === new URL(root.fullUrl).origin) {
                 path = u.pathname;
            } else {
                 path = u.hostname + u.pathname;
            }

            path = path.replace(/^\/|\/$/g, '');
            
            if (!path) {
                root.data = urlItem;
            } else {
                const parts = path.split('/');
                let currentNode = root;
                let currentPath = root.fullUrl;

                parts.forEach((part, index) => {
                    currentPath = currentPath.endsWith('/') ? currentPath + part : currentPath + '/' + part;
                    const isLast = index === parts.length - 1;
                    const node = getOrCreateNode(currentNode, part, currentPath);
                    
                    if (isLast) {
                        node.data = urlItem;
                        node.fullUrl = urlItem.loc;
                    }
                    currentNode = node;
                });
            }
        }
    } catch (e) {
        // Fallback for weird URLs
        if (!root.children) root.children = [];
        root.children.push({
            name: urlItem.loc,
            fullUrl: urlItem.loc,
            data: urlItem,
            children: [],
            type: 'page'
        });
    }
  });

  return root;
};