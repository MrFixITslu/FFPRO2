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
  ArrowRight,
  Palette,
  Shuffle,
  Sun,
  Flame,
  Waves,
  Zap,
  Gem,
  Compass
} from 'lucide-react';
import { BudgetEvent } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  event: BudgetEvent;
  onSaveCoverImage: (event: BudgetEvent, imageUrl: string | undefined) => void;
}

const STYLE_PRESETS = [
  { 
    id: 'tropical-sunset', 
    label: 'Tropical Sunset', 
    desc: 'Vibrant sunset orange, hot pink & sunburst horizon',
    badge: 'Vivid Sunset',
    colors: ['#f97316', '#ec4899', '#fbbf24', '#06b6d4'],
    icon: Sun
  },
  { 
    id: 'caribbean-azure', 
    label: 'Caribbean Azure', 
    desc: 'Sunlit turquoise, deep azure & golden island beams',
    badge: 'Island Ocean',
    colors: ['#06b6d4', '#14b8a6', '#38bdf8', '#fbbf24'],
    icon: Waves
  },
  { 
    id: 'cyber-synthwave', 
    label: 'Cyber Synthwave', 
    desc: 'Electric neon mint, hot magenta & glowing laser grid',
    badge: 'Neon Glow',
    colors: ['#00f5d4', '#f72585', '#7209b7', '#4cc9f0'],
    icon: Zap
  },
  { 
    id: 'emerald-growth', 
    label: 'Emerald Prosperity', 
    desc: 'Luminous jade, mint aura & financial waveforms',
    badge: 'Wealth & Tech',
    colors: ['#10b981', '#34d399', '#06b6d4', '#facc15'],
    icon: Flame
  },
  { 
    id: 'cosmic-prism', 
    label: 'Cosmic Prism', 
    desc: 'Starlight violet, rose quartz & glowing crystal mesh',
    badge: 'Prismatic',
    colors: ['#c084fc', '#f43f5e', '#38bdf8', '#e879f9'],
    icon: Gem
  },
  { 
    id: 'golden-amber', 
    label: 'Royal Gold & Amber', 
    desc: 'Radiant 24k gold, deep amber & ruby geometric glare',
    badge: 'Luxury Gold',
    colors: ['#f59e0b', '#fbbf24', '#ef4444', '#ea580c'],
    icon: Sparkles
  },
  { 
    id: 'modern-abstract', 
    label: 'Electric Aurora', 
    desc: 'Deep indigo, vibrant purple & vivid cyan light ribbons',
    badge: 'Aurora Flow',
    colors: ['#6366f1', '#a855f7', '#06b6d4', '#f43f5e'],
    icon: Compass
  },
  { 
    id: 'architectural-blueprint', 
    label: 'Neon Blueprint', 
    desc: 'Laser cyan, indigo vector matrix & drafting arcs',
    badge: 'Precision Grid',
    colors: ['#38bdf8', '#818cf8', '#22d3ee', '#f472b6'],
    icon: Sliders
  }
];

const SUGGESTED_DIRECTIONS = [
  'Vibrant tropical island sunrise with glowing sun disc',
  'Futuristic neon skyline with high-contrast glowing curves',
  'Rich emerald and gold geometric growth ribbons',
  'Radiant Caribbean ocean waves and coral hues',
  'Prismatic crystal constellations with stardust particles',
  'Warm golden hour horizon with vivid amber flares'
];

export const ProjectCardCoverModal: React.FC<Props> = ({
  isOpen,
  onClose,
  event,
  onSaveCoverImage
}) => {
  // Default style intelligently based on event type
  const defaultStyle = event.eventType === 'trip' 
    ? 'tropical-sunset' 
    : event.eventType === 'startup' 
    ? 'cyber-synthwave' 
    : 'modern-abstract';

  const [selectedStyle, setSelectedStyle] = useState(defaultStyle);
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
    setSelectedStyle(
      event.eventType === 'trip' 
        ? 'tropical-sunset' 
        : event.eventType === 'startup' 
        ? 'cyber-synthwave' 
        : 'modern-abstract'
    );

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
  }, [isOpen, event.coverImage, event.eventType]);

  if (!isOpen) return null;

  const handleGenerate = async (overrideStyle?: string, overridePrompt?: string) => {
    setIsGenerating(true);
    setGenerationMeta(null);

    const styleToUse = overrideStyle || selectedStyle;
    const promptToUse = overridePrompt !== undefined ? overridePrompt : customPrompt;

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
          style: styleToUse,
          customPrompt: promptToUse.trim() || undefined
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

  const handleShuffleStyle = () => {
    const randomPreset = STYLE_PRESETS[Math.floor(Math.random() * STYLE_PRESETS.length)];
    setSelectedStyle(randomPreset.id);
    handleGenerate(randomPreset.id);
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
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black text-stone-900 flex items-center gap-2">
                <span>Vibrant Project Card Cover Generator</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Colorful AI Art
                </span>
              </h3>
              <p className="text-[11px] text-stone-500 font-medium truncate max-w-md">
                Generate high-saturation, modern atmospheric vector backgrounds for <strong className="text-stone-800">{event.name}</strong>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* Engine Status banner */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs">
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-indigo-600" />
              <span className="font-bold text-stone-700">Art Generator Engine:</span>
              {ollamaStatus ? (
                ollamaStatus.online ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Ollama Online ({ollamaStatus.model || 'local'})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    High-Res Vector Engine Active
                  </span>
                )
              ) : (
                <span className="text-stone-400 text-xs">Connecting...</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleShuffleStyle}
              disabled={isGenerating}
              className="px-2.5 py-1 bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition shadow-2xs cursor-pointer"
            >
              <Shuffle size={12} className="text-amber-500" />
              <span>🎲 Shuffle Art & Colors</span>
            </button>
          </div>

          {/* Interactive Live Card Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1">
                <Eye size={12} /> Live Card Text Overlay Preview
              </label>
              {previewImage && (
                <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                  <Check size={12} /> Color Artwork Ready
                </span>
              )}
            </div>

            {/* Mocked Project Card with Image Background & Overlay */}
            <div className="p-6 rounded-2xl border border-stone-800 shadow-md relative overflow-hidden group min-h-[170px] flex flex-col justify-between">
              {/* Background Image */}
              {previewImage ? (
                <div className="absolute inset-0 z-0 overflow-hidden">
                  <img 
                    src={previewImage} 
                    alt="Card Preview" 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {/* High contrast dark gradient overlay ensuring clear text visibility */}
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/95 via-stone-900/60 to-transparent"></div>
                </div>
              ) : (
                <div className="absolute inset-0 z-0 bg-gradient-to-br from-stone-900 to-indigo-950 flex items-center justify-center">
                  <span className="text-xs text-stone-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon size={14} /> Click 'Generate' below to create artwork
                  </span>
                </div>
              )}

              {/* Foreground content with high contrast overlay text */}
              <div className="relative z-10 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-xl truncate drop-shadow-md text-white">
                    {event.name}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-white/20 text-white border border-white/25 backdrop-blur-md">
                    {event.eventType === 'trip' ? 'Vacation Plan' : event.eventType === 'startup' ? 'Startup Suite' : 'Event Framework'}
                  </span>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-200 drop-shadow-sm">
                  Updated: {new Date(event.lastUpdated).toLocaleDateString()}
                </p>
              </div>

              <div className="relative z-10 flex items-center gap-2 mt-4 flex-wrap">
                <span className="px-2.5 py-1 rounded text-[8px] font-extrabold uppercase tracking-wider border backdrop-blur-md bg-white/20 border-white/30 text-white shadow-xs">
                  {(event.files || []).length} Assets
                </span>
                <span className="px-2.5 py-1 rounded text-[8px] font-extrabold uppercase tracking-wider border backdrop-blur-md bg-white/20 border-white/30 text-white shadow-xs">
                  {(event.tasks || []).length} Phases
                </span>
              </div>
            </div>

            {generationMeta?.note && (
              <p className="mt-2 text-[10px] text-stone-500 italic bg-stone-50 p-2.5 rounded-lg border border-stone-200">
                {generationMeta.note}
              </p>
            )}
          </div>

          {/* Style Presets with Vivid Color Swatches */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <Palette size={12} className="text-amber-500" /> Select Vibrant Color Theme ({STYLE_PRESETS.length})
              </label>
              <span className="text-[10px] text-stone-400 font-medium">Click to select & preview</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {STYLE_PRESETS.map(preset => {
                const IconComponent = preset.icon;
                const isSelected = selectedStyle === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSelectedStyle(preset.id);
                      handleGenerate(preset.id);
                    }}
                    className={`p-3 text-left rounded-xl border transition flex flex-col justify-between cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500 shadow-xs'
                        : 'border-stone-200 hover:border-stone-300 bg-white hover:bg-stone-50/90'
                    }`}
                  >
                    <div>
                      {/* Color dots */}
                      <div className="flex items-center gap-1 mb-2">
                        {preset.colors.map((c, i) => (
                          <span 
                            key={i} 
                            className="w-3.5 h-3.5 rounded-full shadow-2xs border border-white/30" 
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <IconComponent size={13} className={isSelected ? 'text-indigo-600' : 'text-stone-500'} />
                        <span className="text-xs font-bold text-stone-900 leading-tight">{preset.label}</span>
                      </div>
                    </div>
                    <span className="text-[9px] text-stone-500 mt-1.5 line-clamp-2 leading-snug">{preset.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Prompt Ideas & Custom Prompt */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">
              Custom Prompt or Creative Direction (Optional)
            </label>
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g. Vibrant tropical coral sunset, glowing cyan geometric wave lines..."
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-medium placeholder:text-stone-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition"
            />
            
            {/* Suggested Directions */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[9px] text-stone-400 font-bold uppercase mr-1">Try:</span>
              {SUGGESTED_DIRECTIONS.map((dir, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setCustomPrompt(dir);
                    handleGenerate(undefined, dir);
                  }}
                  className="px-2 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-600 text-[10px] rounded font-medium transition cursor-pointer border border-stone-200/60"
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-stone-100 bg-stone-50/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {event.coverImage && (
              <button
                type="button"
                onClick={handleRemove}
                className="px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
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
              onClick={() => handleGenerate()}
              className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={13} className="animate-spin text-amber-400" />
                  <span>Generating Artwork...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} className="text-amber-400" />
                  <span>{previewImage ? 'Regenerate Art' : 'Generate Artwork'}</span>
                </>
              )}
            </button>

            {previewImage && (
              <button
                type="button"
                onClick={handleApply}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
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
