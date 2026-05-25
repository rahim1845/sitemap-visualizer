# Sitemap Visualizer & Editor

A browser-based sitemap visualizer and editor with optional AI features.

![Sitemap Visualizer](https://img.shields.io/badge/built_with-Vite_%2B_React_19-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Visual D3 tree** — interactive, zoomable tree view of your sitemap hierarchy (horizontal & vertical layouts)
- **Live XML editor** — edit raw sitemap XML with real-time sync to the visual tree
- **Smart crawl** — paste a domain URL to auto-fetch its `sitemap.xml` via CORS proxy
- **Export** — download as PNG, PDF, or copy image to clipboard; export edited XML
- **AI Audit** — analyze your Information Architecture for SEO and UX issues
- **AI Sub-page suggestions** — get child page recommendations for any node
- **AI site reconstruction** — when direct crawl is blocked, reconstruct site structure using AI
- **Internal Sections** — document content blocks within a page (Hero, FAQ, etc.) as visual children

## Using AI Features

AI features are optional and require no server — everything runs in your browser.

Click any AI button (sparkle icon or "AI Audit") to open the provider selector:

| Provider | Setup | Quality |
|---|---|---|
| **Gemini 2.5 Flash** | Free API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — 1,500 req/day, no credit card | Better |
| **Pollinations** | No key needed — click Enable and start immediately | Good |

> **Privacy:** Your API key is stored in your browser only (`localStorage`) and is never sent to any server other than the AI provider you choose directly.

## Local Development

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
# Production build
npm run build

# Preview production build locally
npm run preview
```

## Deployment

The app is a pure static SPA — no server or environment variables needed.

**Deploy to Vercel:**
1. Push this repo to GitHub
2. Import the repository at [vercel.com](https://vercel.com)
3. Vercel auto-detects Vite — accept the defaults (build: `npm run build`, output: `dist`)
4. Click Deploy — done

Live URL: _add after deployment_

## Tech Stack

- [Vite 6](https://vitejs.dev/) + [React 19](https://react.dev/) + TypeScript
- [D3 v7](https://d3js.org/) — tree layout and SVG rendering
- [Lucide React](https://lucide.dev/) — icons
- [html-to-image](https://github.com/bubkoo/html-to-image) + [jsPDF](https://github.com/parallax/jsPDF) — export
- Tailwind CSS (CDN)
