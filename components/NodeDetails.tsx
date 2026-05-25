import React, { useState, useEffect, useMemo } from 'react';
import { SitemapUrl, SitemapNode } from '../types';
import { suggestRelatedPages } from '../services/aiService';
import { AiProvider } from '../services/aiService';
import { Sparkles, Trash2, Plus, RefreshCw, X, AlignLeft, Hash, Info, CheckCircle, Lock } from 'lucide-react';

interface NodeDetailsProps {
  node: SitemapNode | null;
  onUpdate: (oldUrl: string, newData: SitemapUrl) => void;
  onDelete: (url: string) => void;
  onAddChild: (parentUrl: string, name: string) => void;
  allUrls: string[];
  onClose: () => void;
  aiProvider: AiProvider | null;
  onRequestAiSetup: () => void;
}

const NodeDetails: React.FC<NodeDetailsProps> = ({
  node, onUpdate, onDelete, onAddChild, allUrls, onClose, aiProvider, onRequestAiSetup,
}) => {
  const [formData, setFormData] = useState<SitemapUrl>({ loc: '', summary: '', sections: [] });
  const [newChildName, setNewChildName] = useState('');
  const [newSectionName, setNewSectionName] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    if (node) {
      setFormData({
        ...node.data,
        summary: node.data.summary || '',
        sections: node.data.sections || [],
      });
      setSuggestions([]);
      setNewChildName('');
      setNewSectionName('');
      setSaveState('idle');
    }
  }, [node]);

  const hasChanges = useMemo(() => {
    if (!node) return false;
    return (
      (formData.loc ?? '') !== (node.data.loc ?? '') ||
      (formData.summary ?? '') !== (node.data.summary ?? '') ||
      (formData.priority ?? '') !== (node.data.priority ?? '') ||
      (formData.changefreq ?? '') !== (node.data.changefreq ?? '') ||
      JSON.stringify(formData.sections ?? []) !== JSON.stringify(node.data.sections ?? [])
    );
  }, [formData, node]);

  if (!node) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    onUpdate(node.fullUrl, formData);
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 1500);
  };

  const handleClose = () => {
    if (hasChanges) {
      if (window.confirm('You have unsaved changes. Discard them?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleGetSuggestions = async () => {
    setLoadingSuggestions(true);
    const results = await suggestRelatedPages(node.fullUrl, allUrls);
    setSuggestions(results);
    setLoadingSuggestions(false);
  };

  const applySuggestion = (slug: string) => {
    setNewChildName(slug);
  };

  const addSection = () => {
    if (newSectionName.trim()) {
      const newSections = [...(formData.sections || []), newSectionName.trim()];
      setFormData(prev => ({ ...prev, sections: newSections }));
      setNewSectionName('');
    }
  };

  const removeSection = (index: number) => {
    const newSections = [...(formData.sections || [])];
    newSections.splice(index, 1);
    setFormData(prev => ({ ...prev, sections: newSections }));
  };

  const isSectionNode = node.type === 'section';

  return (
    <div className="h-full bg-white border-l border-slate-200 p-6 shadow-xl flex flex-col w-80 md:w-96 overflow-y-auto z-20 absolute right-0 top-0 bottom-0">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center">
          {isSectionNode ? <Hash size={20} className="mr-2 text-amber-500" /> : null}
          {isSectionNode ? 'Edit Section' : 'Edit Page'}
          {hasChanges && (
            <span className="ml-2 w-2 h-2 rounded-full bg-amber-400 inline-block" title="Unsaved changes" />
          )}
        </h2>
        <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 mb-8">
        {!isSectionNode && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">URL Location</label>
            <input
              type="text"
              name="loc"
              value={formData.loc}
              onChange={handleChange}
              className="w-full p-2 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}

        {isSectionNode && (
          <div className="bg-amber-50 p-3 rounded border border-amber-200 text-sm text-amber-800 mb-2">
            This is a visual section within the parent page. It represents content, not a separate URL.
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center">
            <AlignLeft size={12} className="mr-1" /> {isSectionNode ? 'Section Description' : 'Page Summary'}
          </label>
          <textarea
            name="summary"
            value={formData.summary}
            onChange={handleChange}
            rows={3}
            placeholder={isSectionNode ? "Describe this section..." : "Briefly describe page content..."}
            className="w-full p-2 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none resize-none"
          />
        </div>

        {!isSectionNode && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                SEO Priority
                <span title="Search engine crawl priority hint (0.0 = lowest, 1.0 = highest). Does not affect rankings directly." className="text-slate-400 cursor-help">
                  <Info size={11} />
                </span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                name="priority"
                value={formData.priority || ''}
                onChange={handleChange}
                placeholder="0.0–1.0"
                className="w-full p-2 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Frequency</label>
              <select
                name="changefreq"
                value={formData.changefreq || ''}
                onChange={handleChange}
                className="w-full p-2 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">None</option>
                <option value="always">Always</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="never">Never</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex space-x-2 pt-2">
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex-1 py-2 rounded text-sm font-medium transition-all flex items-center justify-center gap-2
              ${!hasChanges
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : saveState === 'saved'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          >
            {saveState === 'saved'
              ? <><CheckCircle size={16} /> Saved</>
              : isSectionNode ? 'Update Section' : 'Update Page'
            }
          </button>
          <button onClick={() => onDelete(node.fullUrl)} className="px-3 py-2 border border-red-200 text-red-600 rounded hover:bg-red-50" title="Delete">
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <hr className="border-slate-100 mb-6" />

      {/* Internal Sections Manager (Only for Pages) */}
      {!isSectionNode && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Hash size={16} className="text-amber-500" />
            Internal Sections
            <span
              title="Sections represent content blocks within a page (e.g. Hero, FAQ, Pricing). They appear as child nodes in the visual tree but are NOT separate URLs — they help document page structure for IA planning."
              className="text-slate-400 hover:text-slate-600 cursor-help"
            >
              <Info size={14} />
            </span>
          </h3>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-3">
            <ul className="space-y-2 mb-3">
              {formData.sections && formData.sections.map((sec, idx) => (
                <li key={idx} className="flex justify-between items-center text-sm bg-white p-2 rounded shadow-sm">
                  <span className="truncate">{sec}</span>
                  <button onClick={() => removeSection(idx)} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                </li>
              ))}
              {(!formData.sections || formData.sections.length === 0) && (
                <li className="text-xs text-slate-400 italic text-center py-2">No sections defined</li>
              )}
            </ul>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="New section (e.g. FAQ)"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                className="flex-1 p-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-amber-500"
                onKeyDown={(e) => e.key === 'Enter' && addSection()}
              />
              <button onClick={addSection} disabled={!newSectionName} className="text-amber-600 font-medium text-xs px-2 hover:bg-amber-100 rounded disabled:opacity-50">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Child Pages Manager */}
      {!isSectionNode && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center">
            <Plus size={16} className="mr-2" /> Add Child Page
          </h3>
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="e.g., features"
              value={newChildName}
              onChange={(e) => setNewChildName(e.target.value)}
              className="flex-1 p-2 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              disabled={!newChildName}
              onClick={() => {
                onAddChild(node.fullUrl, newChildName);
                setNewChildName('');
              }}
              className="bg-slate-800 text-white px-3 rounded text-sm hover:bg-slate-900 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {!isSectionNode && (
        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-indigo-800 flex items-center">
              <Sparkles size={16} className="mr-2 text-indigo-500" /> AI Suggestions
            </h3>
          </div>

          {suggestions.length === 0 && !loadingSuggestions && (
            <button
              onClick={aiProvider ? handleGetSuggestions : onRequestAiSetup}
              className={`w-full py-2 bg-white border rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                aiProvider
                  ? 'text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                  : 'text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {!aiProvider && <Lock size={14} />}
              {aiProvider ? 'Suggest Sub-pages' : 'Unlock AI to suggest pages'}
            </button>
          )}

          {loadingSuggestions && (
            <div className="flex justify-center py-4">
              <RefreshCw className="animate-spin text-indigo-500" size={20} />
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-indigo-600 mb-2">Click to fill add form:</p>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => applySuggestion(s)}
                  className="block w-full text-left px-3 py-2 bg-white rounded border border-indigo-100 text-sm text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default NodeDetails;
