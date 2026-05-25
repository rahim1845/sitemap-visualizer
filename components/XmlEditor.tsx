import React from 'react';
import { X } from 'lucide-react';

interface XmlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onClose?: () => void;
}

const XmlEditor: React.FC<XmlEditorProps> = ({ value, onChange, onClose }) => {
  return (
    <div className="flex flex-col h-full">
      <div className="bg-slate-800 text-slate-300 px-4 py-2 text-sm font-semibold flex justify-between items-center rounded-t-lg select-none">
        <span className="flex items-center gap-2">
            XML Source
        </span>
        <div className="flex items-center gap-3">
            <span className="text-xs opacity-50 hidden sm:inline">Editable</span>
            {onClose && (
                <button 
                    onClick={onClose}
                    className="text-slate-400 hover:text-white transition-colors hover:bg-slate-700 rounded p-1"
                    title="Close XML Panel"
                >
                    <X size={16} />
                </button>
            )}
        </div>
      </div>
      <textarea
        className="flex-1 w-full p-4 bg-slate-900 text-emerald-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-b-lg font-mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
};

export default XmlEditor;