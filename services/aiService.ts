/**
 * aiService.ts — Dual-provider AI service (Gemini BYOK + Pollinations no-key)
 * Provider state is persisted in localStorage; never sent to any server.
 */
import { SitemapUrl } from '../types';

export type AiProvider = 'gemini' | 'pollinations';

const PROVIDER_KEY = 'sitemap_ai_provider';
const GEMINI_KEY_STORAGE = 'sitemap_gemini_key';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const POLLINATIONS_API_URL = 'https://text.pollinations.ai/';

// ─── Provider state helpers ───────────────────────────────────────────────────

export function getAiProvider(): AiProvider | null {
  return (localStorage.getItem(PROVIDER_KEY) as AiProvider) || null;
}

export function getGeminiKey(): string | null {
  return localStorage.getItem(GEMINI_KEY_STORAGE);
}

export function setAiProvider(provider: AiProvider, geminiKey?: string): void {
  localStorage.setItem(PROVIDER_KEY, provider);
  if (provider === 'gemini' && geminiKey) {
    localStorage.setItem(GEMINI_KEY_STORAGE, geminiKey);
  }
}

export function clearAiProvider(): void {
  localStorage.removeItem(PROVIDER_KEY);
  localStorage.removeItem(GEMINI_KEY_STORAGE);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function ensureConfigured(): void {
  if (!getAiProvider()) throw new Error('AI_NOT_CONFIGURED');
}

async function callGemini(prompt: string, responseSchema?: object): Promise<string> {
  const key = getGeminiKey();
  if (!key) throw new Error('AI_NOT_CONFIGURED');

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (responseSchema) {
    body.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema,
    };
  }

  const res = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callPollinations(prompt: string): Promise<string> {
  const res = await fetch(`${POLLINATIONS_API_URL}${encodeURIComponent(prompt)}`);
  if (!res.ok) throw new Error(`Pollinations API error: ${res.status}`);
  return res.text();
}

// ─── Exported AI functions ────────────────────────────────────────────────────

export const analyzeSitemapStructure = async (urls: SitemapUrl[]): Promise<string> => {
  ensureConfigured();
  const provider = getAiProvider();
  const urlList = urls
    .map(u => `${u.loc} (Sections: ${u.sections?.join(', ') || 'None'})`)
    .join('\n');
  const prompt = `Analyze this sitemap structure (Information Architecture) for SEO and UX. Identify missing important sections, depth issues, or logic flaws. Keep it concise (max 3 bullet points).\n\nSitemap:\n${urlList}`;

  try {
    return provider === 'gemini'
      ? await callGemini(prompt)
      : await callPollinations(prompt);
  } catch (err: unknown) {
    const e = err as Error;
    if (e.message === 'AI_NOT_CONFIGURED') throw err;
    console.error('AI analyze error:', e);
    return 'Could not analyze sitemap. Check your AI provider settings.';
  }
};

export const suggestRelatedPages = async (
  currentUrl: string,
  allUrls: string[],
): Promise<string[]> => {
  ensureConfigured();
  const provider = getAiProvider();
  const base = `Based on current URL: "${currentUrl}" (existing URLs: ${allUrls.slice(0, 20).join(', ')}), suggest 3 child page paths beneficial for SEO/User flow. Return only relative paths (e.g. "pricing").`;

  try {
    if (provider === 'gemini') {
      const result = await callGemini(base, {
        type: 'ARRAY',
        items: { type: 'STRING' },
      });
      const parsed: unknown = JSON.parse(result);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } else {
      const prompt = `${base} Respond with a JSON array of strings only, no markdown, no explanation.`;
      const text = await callPollinations(prompt);
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed: unknown = JSON.parse(match[0]);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    }
  } catch (err: unknown) {
    const e = err as Error;
    if (e.message === 'AI_NOT_CONFIGURED') throw err;
    return [];
  }
};

export const scanWebsiteWithAI = async (domain: string): Promise<SitemapUrl[]> => {
  ensureConfigured();
  const provider = getAiProvider();

  let cleanDomain = domain.trim();
  if (!/^https?:\/\//i.test(cleanDomain)) cleanDomain = 'https://' + cleanDomain;

  const basePrompt = `Task: Reconstruct a complete XML sitemap for the website: ${cleanDomain}.

Context: You are an advanced SEO & UX Crawler. The direct crawler was blocked. Reconstruct the site structure based on standard industry patterns.

Instructions:
1. Create a deep hierarchical structure (Home -> Category -> Sub-page).
2. START with the homepage.
3. INCLUDE major sections (About, Services, Resources, Blog, Contact, etc.).
4. For major pages include a 'sections' array listing 3-5 key internal visual sections (e.g. "Hero", "Features Grid", "FAQ").
5. For EACH URL provide a 'summary' field describing the content.

Output Format: Strictly a JSON array. Each item must have: loc (full URL string), lastmod (YYYY-MM-DD string), changefreq (one of: always/hourly/daily/weekly/monthly/yearly/never), priority (string 0.0-1.0), summary (string), sections (string array).`;

  if (provider === 'gemini') {
    const result = await callGemini(basePrompt, {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          loc: { type: 'STRING', description: 'Full absolute URL' },
          lastmod: { type: 'STRING', description: 'YYYY-MM-DD' },
          changefreq: {
            type: 'STRING',
            enum: ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'],
          },
          priority: { type: 'STRING', description: '0.0 to 1.0' },
          summary: { type: 'STRING', description: 'Content description' },
          sections: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Internal page sections',
          },
        },
        required: ['loc', 'priority', 'changefreq', 'summary'],
      },
    });
    return JSON.parse(result) as SitemapUrl[];
  } else {
    const prompt = `${basePrompt}\n\nRespond with ONLY a valid JSON array. Start your response with [ and end with ]. No markdown code blocks, no explanation.`;
    const text = await callPollinations(prompt);
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Failed to parse AI response as JSON array');
    return JSON.parse(match[0]) as SitemapUrl[];
  }
};
