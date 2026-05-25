import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SitemapUrl, SitemapNode } from './types';
import { DEFAULT_XML, parseSitemapXML, generateSitemapXML, buildHierarchy } from './services/xmlService';
import {
  analyzeSitemapStructure,
  scanWebsiteWithAI,
  getAiProvider,
  clearAiProvider,
  AiProvider,
} from './services/aiService';
import VisualEditor from './components/VisualEditor';
import XmlEditor from './components/XmlEditor';
import NodeDetails from './components/NodeDetails';
import AiSetupModal from './components/AiSetupModal';
import {
  Network, Upload, Download, Sparkles, AlertTriangle, Globe, Loader2,
  CheckCircle, XCircle, X, Bot, Search, FileCode, Trash2, Lock,
} from 'lucide-react';

type NotificationType = 'success' | 'error' | 'loading' | 'info' | 'undo';

interface Notification {
  type: NotificationType;
  message: string;
  details?: string;
  onUndo?: () => void;
}

function App() {
  const [xmlContent, setXmlContent] = useState<string>(DEFAULT_XML);
  const [sitemapItems, setSitemapItems] = useState<SitemapUrl[]>([]);
  const [selectedNode, setSelectedNode] = useState<SitemapNode | null>(null);
  const [viewMode, setViewMode] = useState<'both' | 'visual' | 'code'>('both');

  // Validation error
  const [xmlError, setXmlError] = useState<string | null>(null);

  // AI analysis state
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // URL fetch state
  const [urlInput, setUrlInput] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [crawlerStatus, setCrawlerStatus] = useState<string>('');

  // Global notification
  const [notification, setNotification] = useState<Notification | null>(null);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pending delete (for undo toast)
  const [pendingDelete, setPendingDelete] = useState<{
    url: string;
    snapshot: SitemapUrl[];
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  // Crawl failure import hint
  const [showImportHint, setShowImportHint] = useState(false);

  // AI-reconstructed label
  const [isAiGenerated, setIsAiGenerated] = useState(false);

  // AI provider state (mirrors localStorage, drives lock icons + pill)
  const [aiProvider, setAiProviderState] = useState<AiProvider | null>(() => getAiProvider());
  const [showAiSetup, setShowAiSetup] = useState(false);
  const [showProviderMenu, setShowProviderMenu] = useState(false);

  // Pending action to retry after AI is configured
  const pendingAiAction = useRef<(() => Promise<void>) | null>(null);

  // ─── withAi wrapper ──────────────────────────────────────────────────────────
  const withAi = async (fn: () => Promise<void>): Promise<void> => {
    if (!getAiProvider()) {
      pendingAiAction.current = fn;
      setShowAiSetup(true);
      return;
    }
    try {
      await fn();
    } catch (err: unknown) {
      if ((err as Error)?.message === 'AI_NOT_CONFIGURED') {
        pendingAiAction.current = fn;
        setShowAiSetup(true);
      } else {
        throw err;
      }
    }
  };

  const handleAiConfigured = async () => {
    setAiProviderState(getAiProvider());
    const action = pendingAiAction.current;
    pendingAiAction.current = null;
    if (action) await action();
  };

  // ─── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const items = parseSitemapXML(DEFAULT_XML);
      setSitemapItems(items);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // ─── XML / items helpers ─────────────────────────────────────────────────────
  const handleXmlChange = useCallback((newXml: string) => {
    setXmlContent(newXml);
    setIsAiGenerated(false);
    try {
      const items = parseSitemapXML(newXml);
      setSitemapItems(items);
      setXmlError(null);
    } catch (e) {
      setXmlError('Invalid XML: ' + (e as Error).message);
    }
  }, []);

  const updateItems = (newItems: SitemapUrl[]) => {
    setSitemapItems(newItems);
    const newXml = generateSitemapXML(newItems);
    setXmlContent(newXml);
  };

  // ─── Node handlers ───────────────────────────────────────────────────────────
  const handleNodeUpdate = (oldUrl: string, newData: SitemapUrl) => {
    const newItems = sitemapItems.map(item => (item.loc === oldUrl ? newData : item));
    updateItems(newItems);
    if (selectedNode && selectedNode.fullUrl === oldUrl) {
      setSelectedNode(prev =>
        prev ? { ...prev, data: newData, name: newData.loc, fullUrl: newData.loc } : null,
      );
    }
  };

  const handleNodeDelete = (url: string) => {
    // Commit any existing pending delete first
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer);
      setPendingDelete(null);
    }

    const snapshot = [...sitemapItems];
    const deletedItem = sitemapItems.find(i => i.loc === url);
    const label = deletedItem?.loc.split('/').filter(Boolean).pop() || url;

    // Optimistic removal
    updateItems(sitemapItems.filter(item => item.loc !== url));
    setSelectedNode(null);

    const timer = setTimeout(() => {
      setPendingDelete(null);
      setNotification(null);
    }, 5000);

    setPendingDelete({ url, snapshot, timer });

    showNotification('undo', `"${label}" deleted`, undefined, () => {
      clearTimeout(timer);
      updateItems(snapshot);
      setPendingDelete(null);
    });
  };

  const handleAddChild = (parentUrl: string, name: string) => {
    const parent = parentUrl.endsWith('/') ? parentUrl : parentUrl + '/';
    const newUrl = parent + name;
    if (sitemapItems.some(item => item.loc === newUrl)) {
      showNotification('error', 'URL already exists!');
      return;
    }
    const newItem: SitemapUrl = { loc: newUrl, priority: '0.5', changefreq: 'monthly', summary: 'New page' };
    updateItems([...sitemapItems, newItem]);
    showNotification('success', 'Child page added successfully');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleXmlChange(content);
      setShowImportHint(false);
      setIsAiGenerated(false);
      showNotification('success', 'File imported successfully');
    };
    reader.readAsText(file);
  };

  // ─── Notifications ───────────────────────────────────────────────────────────
  const showNotification = (
    type: NotificationType,
    message: string,
    details?: string,
    onUndo?: () => void,
  ) => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = null;
    }
    setNotification({ type, message, details, onUndo });
    if (type === 'success') {
      notificationTimerRef.current = setTimeout(() => {
        setNotification(null);
        notificationTimerRef.current = null;
      }, 4000);
    } else if (type === 'info') {
      notificationTimerRef.current = setTimeout(() => {
        setNotification(null);
        notificationTimerRef.current = null;
      }, 6000);
    }
    // 'undo' toasts are dismissed by the timer in handleNodeDelete
  };

  // ─── CORS proxy crawler ──────────────────────────────────────────────────────
  const fetchWithProxies = async (targetUrl: string): Promise<string> => {
    const proxies = [
      (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    ];
    let lastError: unknown = null;
    for (const proxyGen of proxies) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(proxyGen(targetUrl), { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const text = await response.text();
        if (
          text.toLowerCase().includes('cloudflare') ||
          text.includes('<!doctype html') ||
          text.includes('<html')
        ) {
          if (targetUrl.endsWith('robots.txt') && !text.includes('User-agent'))
            throw new Error('Blocked or Invalid robots.txt');
          if (targetUrl.endsWith('.xml') && text.includes('<html'))
            throw new Error('Blocked or HTML received');
        }
        return text;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('All proxies failed');
  };

  // ─── Smart crawl ─────────────────────────────────────────────────────────────
  const handleSmartCrawl = async () => {
    if (!urlInput) return;
    setIsFetching(true);
    setXmlError(null);
    setCrawlerStatus('Initializing crawler...');

    showNotification('info', 'Fetching via CORS proxy — your domain is sent to a third-party relay.');

    let domain = urlInput.trim();
    if (!/^https?:\/\//i.test(domain)) domain = 'https://' + domain;
    domain = domain.replace(/\/$/, '');

    try {
      let sitemapUrl = '';

      setCrawlerStatus('Checking robots.txt for sitemap...');
      try {
        const robotsTxt = await fetchWithProxies(`${domain}/robots.txt`);
        const match = robotsTxt.match(/Sitemap:\s*(https?:\/\/[^\s]+)/i);
        if (match?.[1]) {
          sitemapUrl = match[1];
          setCrawlerStatus(`Found sitemap in robots.txt: ${sitemapUrl}`);
        }
      } catch (e) {
        console.warn('Could not fetch robots.txt', e);
      }

      if (!sitemapUrl) {
        setCrawlerStatus('Checking standard sitemap locations...');
        sitemapUrl = `${domain}/sitemap.xml`;
      }

      setCrawlerStatus(`Crawling ${sitemapUrl}...`);
      try {
        const xml = await fetchWithProxies(sitemapUrl);
        parseSitemapXML(xml); // validate
        handleXmlChange(xml);
        setShowImportHint(false);
        setIsAiGenerated(false);
        showNotification('success', 'Crawl Successful', 'Loaded sitemap structure.');
      } catch (e) {
        console.error('Direct crawl failed', e);
        throw new Error('Direct access blocked or sitemap missing.');
      }
    } catch (_e) {
      // Fallback to AI crawler
      setCrawlerStatus('Direct access blocked. Starting AI Crawler...');
      const capturedDomain = domain;
      try {
        await withAi(async () => {
          showNotification('info', 'Direct Crawl Blocked', 'Switching to AI Reconstruction Engine...');
          const generatedUrls = await scanWebsiteWithAI(capturedDomain);
          updateItems(generatedUrls);
          setIsAiGenerated(true);
          setShowImportHint(false);
          showNotification('success', 'AI Reconstruction Complete', 'Sitemap generated from public data.');
        });
      } catch (aiError: unknown) {
        const msg = (aiError as Error)?.message ?? 'Unknown error';
        showNotification('error', 'Crawl Failed', 'Could not crawl or reconstruct site.');
        setXmlError(msg);
        setShowImportHint(true);
      }
    } finally {
      setIsFetching(false);
      setCrawlerStatus('');
      setUrlInput('');
    }
  };

  // ─── Export ───────────────────────────────────────────────────────────────────
  const handleDownload = () => {
    const blob = new Blob([xmlContent], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sitemap.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('success', 'Sitemap downloaded');
  };

  // ─── AI Audit ─────────────────────────────────────────────────────────────────
  const runAnalysis = async () => {
    await withAi(async () => {
      setAnalyzing(true);
      showNotification('loading', 'AI is auditing structure...');
      try {
        const result = await analyzeSitemapStructure(sitemapItems);
        setAiAnalysis(result);
        showNotification('info', 'AI Audit complete', result.substring(0, 150) + '…');
      } finally {
        setAnalyzing(false);
      }
    });
  };

  const hierarchy = useMemo(() => buildHierarchy(sitemapItems), [sitemapItems]);

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900 relative">

      {/* ── Global notification toast ── */}
      {notification && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
          <div className={`shadow-2xl rounded-lg border p-4 flex items-start gap-3
            ${notification.type === 'error'   ? 'bg-red-50 border-red-200 text-red-900' :
              notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
              notification.type === 'loading' ? 'bg-blue-50 border-blue-200 text-blue-900' :
              notification.type === 'info'    ? 'bg-amber-50 border-amber-200 text-amber-900' :
              'bg-slate-800 text-white border-slate-700'}`}>

            <div className="mt-0.5 shrink-0">
              {notification.type === 'error'   && <XCircle size={20} className="text-red-500" />}
              {notification.type === 'success' && <CheckCircle size={20} className="text-emerald-500" />}
              {notification.type === 'loading' && <Loader2 size={20} className="animate-spin text-blue-500" />}
              {notification.type === 'info'    && <Bot size={20} className="text-amber-600" />}
              {notification.type === 'undo'    && <Trash2 size={20} className="text-slate-300" />}
            </div>

            <div className="flex-1">
              <h4 className="font-semibold text-sm">{notification.message}</h4>
              {notification.details && <p className="text-xs opacity-90 mt-1">{notification.details}</p>}
            </div>

            {notification.onUndo && (
              <button
                onClick={() => { notification.onUndo?.(); setNotification(null); }}
                className="ml-2 px-3 py-1 text-xs font-semibold bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors shrink-0"
              >
                Undo
              </button>
            )}

            <button onClick={() => setNotification(null)} className="opacity-60 hover:opacity-100 transition-opacity shrink-0">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap gap-4 justify-between items-center shadow-sm z-30">
        <div className="flex items-center space-x-3 mr-4">
          <div className="bg-blue-600 p-2 rounded-lg text-white shadow-blue-200 shadow-md">
            <Network size={24} />
          </div>
          <div className="hidden md:block">
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Sitemap Visualizer</h1>
          </div>
        </div>

        {/* Smart Crawler Input */}
        <div className="flex-1 max-w-xl group relative">
          <div className={`flex items-center bg-slate-50 border rounded-md overflow-hidden transition-all duration-300 ${
            isFetching
              ? 'ring-2 ring-blue-100 border-blue-400'
              : 'border-slate-300 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent'
          }`}>
            <div className="pl-3 text-slate-400 group-focus-within:text-blue-500 transition-colors">
              <Globe size={18} />
            </div>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Enter domain to crawl (e.g. apple.com)..."
              disabled={isFetching}
              onKeyDown={(e) => e.key === 'Enter' && handleSmartCrawl()}
              className="flex-1 bg-transparent border-none text-sm px-3 py-2.5 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSmartCrawl}
              disabled={isFetching || !urlInput}
              className={`px-4 py-2.5 text-sm font-medium border-l transition-all flex items-center gap-2 justify-center min-w-[120px]
                ${isFetching
                  ? 'bg-blue-50 text-blue-700 border-blue-200 cursor-wait'
                  : !urlInput
                    ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                }`}
            >
              {isFetching ? (
                <><Loader2 size={16} className="animate-spin" /><span>{crawlerStatus.includes('AI') ? 'Generating' : 'Crawling'}</span></>
              ) : (
                <><Search size={16} /><span>Start Crawl</span></>
              )}
            </button>
          </div>
          {isFetching && (
            <div className="absolute mt-1 ml-1">
              <span className="text-xs text-blue-600 font-medium flex items-center animate-pulse">
                <Loader2 size={10} className="animate-spin mr-1.5" />
                {crawlerStatus}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2 md:space-x-3">
          {/* View mode */}
          <div className="hidden lg:flex bg-slate-100 rounded-lg p-1">
            {(['code', 'both', 'visual'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                  viewMode === mode ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {mode === 'both' ? 'Split' : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {/* AI provider pill */}
          {aiProvider && (
            <div className="relative">
              <button
                onClick={() => setShowProviderMenu(p => !p)}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full hover:bg-emerald-100 transition-colors whitespace-nowrap"
              >
                <CheckCircle size={12} />
                {aiProvider === 'gemini' ? 'Gemini' : 'Pollinations'} ✓
              </button>
              {showProviderMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-slate-200 w-44 py-1 z-50">
                  <button
                    onClick={() => { setShowProviderMenu(false); setShowAiSetup(true); }}
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Switch provider
                  </button>
                  <button
                    onClick={() => { clearAiProvider(); setAiProviderState(null); setShowProviderMenu(false); }}
                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          <label
            className="cursor-pointer flex items-center p-2 md:px-3 md:py-2 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700 transition-colors"
            title="Import XML File"
          >
            <Upload size={18} />
            <span className="hidden md:inline ml-2 text-sm font-medium">Import</span>
            <input type="file" accept=".xml" className="hidden" onChange={handleFileUpload} />
          </label>

          <button
            onClick={handleDownload}
            className="flex items-center p-2 md:px-3 md:py-2 bg-slate-900 text-white rounded hover:bg-slate-800 transition-colors"
            title="Export XML"
          >
            <Download size={18} />
            <span className="hidden md:inline ml-2 text-sm font-medium">Export</span>
          </button>
        </div>
      </header>

      {/* ── Crawl failure recovery banner ── */}
      {showImportHint && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-sm text-amber-800">
          <span className="flex items-center gap-2">
            <AlertTriangle size={15} />
            Crawl blocked. Import your sitemap XML file manually, or try a different domain.
          </span>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer flex items-center gap-1.5 font-medium underline underline-offset-2 hover:text-amber-900">
              <Upload size={14} /> Import XML
              <input
                type="file"
                accept=".xml"
                className="hidden"
                onChange={(e) => { handleFileUpload(e); setShowImportHint(false); }}
              />
            </label>
            <button onClick={() => setShowImportHint(false)} className="opacity-60 hover:opacity-100">
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 flex overflow-hidden relative">
        <div className={`flex-1 flex p-4 gap-4 overflow-hidden transition-all duration-300 ${viewMode === 'both' ? 'flex-row' : 'flex-col'}`}>

          {/* Code panel */}
          {(viewMode === 'code' || viewMode === 'both') && (
            <div className={`${viewMode === 'both' ? 'w-1/3' : 'w-full h-full'} flex flex-col min-w-[300px]`}>
              <XmlEditor value={xmlContent} onChange={handleXmlChange} onClose={() => setViewMode('visual')} />
            </div>
          )}

          {/* Visual panel */}
          {(viewMode === 'visual' || viewMode === 'both') && (
            <div className="flex-1 flex flex-col min-w-0 bg-white rounded-lg shadow-sm border border-slate-200 h-full relative">
              <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-lg">
                <span className="text-sm font-semibold text-slate-700 flex items-center flex-wrap gap-2">
                  {viewMode === 'visual' && (
                    <button
                      onClick={() => setViewMode('both')}
                      className="mr-1 p-1.5 bg-slate-100 text-slate-600 rounded-md hover:bg-blue-50 hover:text-blue-600 transition-colors border border-slate-200"
                      title="Show XML Code"
                    >
                      <FileCode size={16} />
                    </button>
                  )}
                  <Network size={16} className="text-slate-400" />
                  Visual Flow
                  <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {sitemapItems.length} nodes
                  </span>
                  {isAiGenerated && (
                    <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                      <AlertTriangle size={11} />
                      AI-reconstructed — verify before use
                    </span>
                  )}
                </span>

                <div className="flex items-center space-x-2">
                  {aiAnalysis && (
                    <div
                      className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-100 max-w-xs truncate cursor-help"
                      title={aiAnalysis}
                    >
                      Analysis Ready
                    </div>
                  )}
                  <button
                    onClick={runAnalysis}
                    disabled={analyzing}
                    className="flex items-center space-x-1 text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded hover:bg-indigo-100 transition-colors border border-indigo-200"
                  >
                    {!aiProvider
                      ? <Lock size={14} />
                      : <Sparkles size={14} className={analyzing ? 'animate-spin' : ''} />
                    }
                    <span>{analyzing ? 'Analyzing...' : 'AI Audit'}</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden relative bg-slate-50/50">
                <VisualEditor
                  data={hierarchy}
                  onSelectNode={setSelectedNode}
                  selectedUrl={selectedNode?.fullUrl || null}
                />
              </div>

              {/* XML error banner — inside visual panel, no global overlay conflict */}
              {xmlError && (
                <div className="border-t border-red-200 bg-red-50 text-red-700 p-3 flex items-start gap-2 text-sm">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
                  <span className="flex-1">{xmlError}</span>
                  <button onClick={() => setXmlError(null)}><X size={14} /></button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Side panel */}
        {selectedNode && (
          <NodeDetails
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onUpdate={handleNodeUpdate}
            onDelete={handleNodeDelete}
            onAddChild={handleAddChild}
            allUrls={sitemapItems.map(i => i.loc)}
            aiProvider={aiProvider}
            onRequestAiSetup={() => setShowAiSetup(true)}
          />
        )}
      </main>

      {/* ── AI Setup Modal ── */}
      <AiSetupModal
        isOpen={showAiSetup}
        onClose={() => setShowAiSetup(false)}
        onConfigured={handleAiConfigured}
      />
    </div>
  );
}

export default App;
