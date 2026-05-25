import React, { useState } from 'react';
import { X, Key, Zap, ExternalLink, Lock, CheckCircle } from 'lucide-react';
import { setAiProvider } from '../services/aiService';

export interface AiSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a provider is saved — use to retry the original AI action. */
  onConfigured: () => void;
}

const AiSetupModal: React.FC<AiSetupModalProps> = ({ isOpen, onClose, onConfigured }) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiError, setGeminiError] = useState('');

  if (!isOpen) return null;

  const handleEnableGemini = () => {
    const trimmed = geminiKey.trim();
    if (!trimmed.startsWith('AIza') || trimmed.length < 20) {
      setGeminiError("That doesn't look like a valid Gemini key");
      return;
    }
    setGeminiError('');
    setAiProvider('gemini', trimmed);
    onConfigured();
    onClose();
  };

  const handleEnablePollinations = () => {
    setAiProvider('pollinations');
    onConfigured();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        style={{ backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Unlock AI Features</h2>
            <p className="text-slate-500 text-sm mt-1 max-w-lg">
              AI powers three features in this app: sitemap auditing, sub-page suggestions, and
              site reconstruction when crawling is blocked.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 ml-4 shrink-0 mt-0.5 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Provider cards */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* ── Gemini card ── */}
          <div className="border-2 border-blue-200 rounded-xl p-5 flex flex-col bg-blue-50/30">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Key size={16} className="text-blue-600" />
                </div>
                <span className="font-bold text-slate-800">Gemini</span>
              </div>
              <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                Free · Better quality
              </span>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Google's Gemini 1.5 Flash. Free tier gives you 1,500 requests/day with no credit
              card required.
            </p>

            {/* Steps */}
            <ol className="text-sm text-slate-600 space-y-2 mb-4 bg-white rounded-lg p-3 border border-blue-100">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">1.</span>
                <span>
                  Go to{' '}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline underline-offset-2 inline-flex items-center gap-0.5 hover:text-blue-800"
                  >
                    aistudio.google.com/apikey <ExternalLink size={11} />
                  </a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">2.</span>
                <span>Click "Create API key"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">3.</span>
                <span>Copy and paste it below</span>
              </li>
            </ol>

            <input
              type="text"
              value={geminiKey}
              onChange={(e) => {
                setGeminiKey(e.target.value);
                setGeminiError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleEnableGemini()}
              placeholder="Paste your Gemini API key (AIza...)"
              className={`w-full p-2.5 border rounded-lg text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                geminiError ? 'border-red-400 bg-red-50' : 'border-slate-300'
              }`}
            />
            {geminiError && <p className="text-xs text-red-600 mb-2">{geminiError}</p>}

            <button
              onClick={handleEnableGemini}
              className="mt-3 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle size={16} /> Enable Gemini
            </button>
          </div>

          {/* ── Pollinations card ── */}
          <div className="border-2 border-emerald-200 rounded-xl p-5 flex flex-col bg-emerald-50/30">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Zap size={16} className="text-emerald-600" />
                </div>
                <span className="font-bold text-slate-800">Pollinations</span>
              </div>
              <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">
                No key needed · Instant
              </span>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              A free public AI service. No account or API key required. Slightly lower quality
              than Gemini.
            </p>

            <div className="flex-1 flex flex-col justify-end">
              <div className="bg-white rounded-lg border border-emerald-100 p-3 mb-4 text-sm text-emerald-800 flex items-start gap-2">
                <Zap size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                <span>
                  No setup needed — click Enable and start using AI features instantly.
                </span>
              </div>
              <button
                onClick={handleEnablePollinations}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Zap size={16} /> Enable Pollinations
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1">
            <Lock size={11} />
            Your API key is stored in your browser only and never sent to our servers.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AiSetupModal;
