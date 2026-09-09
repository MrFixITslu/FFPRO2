import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Image as ImageIcon, 
  RefreshCw, 
  Trash2, 
  X, 
  Check, 
  Sliders, 
  Cpu, 
  AlertCircle,
  Eye,
  ArrowRight
} from 'lucide-react';
import { BudgetEvent } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  event: BudgetEvent;
  onSaveCoverImage: (event: BudgetEvent, imageUrl: string | undefined) => void;
}

const STYLE_PRESETS = [
  { id: 'modern-abstract', label: 'Modern Abstract', desc: 'Deep indigo & violet gradients with soft geometry' },
  { id: 'fintech-growth', label: 'Fintech Growth', desc: 'Obsidian & emerald geometric financial vectors' },
  { id: 'startup-cyber', label: 'Startup Cyber', desc: 'Neon cobalt & magenta circuit mesh contours' },
  { id: 'trip-horizon', label: 'Trip Horizon', desc: 'Twilight indigo & warm amber landscape waves' },
  { id: 'architectural-blueprint', label: 'Architectural Blueprint', desc: 'Navy & sky-blue precision drafting grid' },
  { id: 'cosmic-gradient', label: 'Cosmic Gradient', desc: 'Deep space purple with glowing stellar nodes' }
];

export const ProjectCardCoverModal: React.FC<Props> = ({
  isOpen,
  onClose,
  event,
  onSaveCoverImage
}) => {
  const [selectedStyle, setSelectedStyle] = useState('modern-abstract');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | undefined>(event.coverImage);
  const [generationMeta, setGenerationMeta] = useState<{
    provider?: string;
    model?: string;
    note?: string;
    ollamaOnline?: boolean;
  } | null>(null);

  const [ollamaStatus, setOllamaStatus] = useState<{
    online: boolean;
    model?: string;
    baseURL?: string;
  } | null>(null);

  // Check Ollama health when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setPreviewImage(event.coverImage);
    setGenerationMeta(null);

    let cancelled = false;
    fetch('/api/ai/ollama/status')
      .then(res => res.json())
      .then(data => {
        if (!cancelled) {
          setOllamaStatus({
            online: !!data.online,
            model: data.model || data.effectiveModel,
            baseURL: data.baseURL
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOllamaStatus({
            online: false,
            baseURL: 'http://localhost:11434'
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, event.coverImage]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationMeta(null);

    try {
      const response = await fetch('/api/ai/ollama/generate-card-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectName: event.name,
          eventType: event.eventType || 'event',
          tasks: (event.tasks || []).map(t => t.title),
          notes: (event.notes || []).map(n => n.title).join(', '),
          style: selectedStyle,
          customPrompt: customPrompt.trim() || undefined
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.imageUrl) {
        setPreviewImage(data.imageUrl);
        setGenerationMeta({
          provider: data.provider,
          model: data.model,
          note: data.note,
          ollamaOnline: data.ollamaOnline
        });
      }
    } catch (err: any) {
      console.error('Failed to generate image via Ollama:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    onSaveCoverImage(event, previewImage);
    onClose();
  };

  const handleRemove = () => {
    setPreviewImage(undefined);
    onSaveCoverImage(event, undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black text-stone-900 flex items-center gap-2">
                <span>Ollama Card Image Generator</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-700">AI Background</span>
              </h3>
              <p className="text-[11px] text-stone-500 font-medium truncate max-w-sm">
                Styling background for &ldquo;{event.name}&rdquo;
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Ollama Status banner */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs">
            <div className="flex items-center gap-2">
              <Cpu size={15} className="text-stone-500" />
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-stone-700">Ollama Engine:</span>
                {ollamaStatus ? (
                  ollamaStatus.online ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Online ({ollamaStatus.model || 'llama3.2'})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                      <AlertCircle size={10} />
                      Offline (vector generator active)
                    </span>
                  )
                ) : (
                  <span className="text-stone-400">Connecting...</span>
                )}
              </div>
            </div>
            <span className="text-[10px] text-stone-400">
              {ollamaStatus?.baseURL || 'http://localhost:11434'}
            </span>
          </div>

          {/* Interactive Live Card Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1">
                <Eye size={12} /> Live Card Text Overlay Preview
              </label>
              {previewImage && (
                <span className="text-[10px] text-emerald-600 font-bold">Image ready</span>
              )}
            </div>

            {/* Mocked Project Card with Image Background & Overlay */}
            <div className="p-6 rounded-xl border border-stone-800 shadow-md relative overflow-hidden group min-h-[160px] flex flex-col justify-between">
              {/* Background Image */}
              {previewImage ? (
                <div className="absolute inset-0 z-0 overflow-hidden">
                  <img 
                    src={previewImage} 
                    alt="Card Preview" 
                    className="w-full h-full object-cover transition-transform duration-500"
                  />
                  {/* High contrast dark gradient overlay ensuring clear text visibility */}
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/95 via-stone-900/80 to-stone-900/50 backdrop-blur-[0.5px]"></div>
                </div>
              ) : (
                <div className="absolute inset-0 z-0 bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center">
                  <span className="text-xs text-stone-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon size={14} /> No Cover Image Set
                  </span>
                </div>
              )}

              {/* Foreground content with high contrast overlay text */}
              <div className="relative z-10 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={`font-black text-lg truncate drop-shadow-sm ${previewImage ? 'text-white' : 'text-stone-800'}`}>
                    {event.name}
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                    previewImage 
                      ? 'bg-white/20 text-white border border-white/20 backdrop-blur-md' 
                      : 'bg-stone-200 text-stone-700'
                  }`}>
                    {event.eventType || 'Framework'}
                  </span>
                </div>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${previewImage ? 'text-stone-300' : 'text-stone-400'}`}>
                  Updated: {new Date(event.lastUpdated).toLocaleDateString()}
                </p>
              </div>

              <div className="relative z-10 flex items-center gap-2 mt-4 flex-wrap">
                <span className={`px-2.5 py-1 rounded text-[8px] font-extrabold uppercase tracking-wider border backdrop-blur-md ${
                  previewImage 
                    ? 'bg-white/15 border-white/25 text-white' 
                    : 'bg-indigo-50 border-indigo-100 text-indigo-600'
                }`}>
                  {(event.files || []).length} Assets
                </span>
                <span className={`px-2.5 py-1 rounded text-[8px] font-extrabold uppercase tracking-wider border backdrop-blur-md ${
                  previewImage 
                    ? 'bg-white/15 border-white/25 text-white' 
                    : 'bg-stone-50 border-stone-200 text-stone-600'
                }`}>
                  {(event.tasks || []).length} Phases
                </span>
              </div>
            </div>

            {generationMeta?.note && (
              <p className="mt-2 text-[10px] text-stone-500 italic bg-stone-50 p-2 rounded-lg border border-stone-200">
                {generationMeta.note}
              </p>
            )}
          </div>

          {/* Style Presets */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2 flex items-center gap-1.5">
              <Sliders size={12} /> Select Visual Style
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STYLE_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedStyle(preset.id)}
                  className={`p-2.5 text-left rounded-xl border transition flex flex-col justify-between ${
                    selectedStyle === preset.id
                      ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-500'
                      : 'border-stone-200 hover:border-stone-300 bg-white hover:bg-stone-50'
                  }`}
                >
                  <span className="text-xs font-bold text-stone-900">{preset.label}</span>
                  <span className="text-[9px] text-stone-500 mt-1 line-clamp-2 leading-snug">{preset.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt (optional) */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">
              Custom Prompt or Direction (Optional)
            </label>
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g. Minimalist Japanese neon skyline, high-contrast dark curves..."
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-medium placeholder:text-stone-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-stone-100 bg-stone-50/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {event.coverImage && (
              <button
                type="button"
                onClick={handleRemove}
                className="px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 font-bold text-xs transition flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                <span>Remove Cover</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleGenerate}
              className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={13} className="animate-spin text-indigo-400" />
                  <span>Generating with Ollama...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} className="text-indigo-400" />
                  <span>{previewImage ? 'Regenerate' : 'Generate with Ollama'}</span>
                </>
              )}
            </button>

            {previewImage && previewImage !== event.coverImage && (
              <button
                type="button"
                onClick={handleApply}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>Apply to Card</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCardCoverModal;
