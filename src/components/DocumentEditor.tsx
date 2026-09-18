import React, { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import {
  Undo,
  Redo,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Type,
  Image as ImageIcon,
  Table as TableIcon,
  Scissors,
  Save,
  Printer,
  X,
  ArrowLeft,
  ChevronDown,
  Sparkles,
  FileText,
  CheckCircle2,
  Highlighter,
  Palette,
  Minus,
  Plus,
  Quote,
  LayoutTemplate
} from 'lucide-react';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';
import { uploadFileToSystemDatabase } from '../services/fileStorageService';

interface Props {
  initialTitle: string;
  initialContent: string;
  onSave: (title: string, content: string) => Promise<void>;
  onClose: () => void;
  isVaultMounted: boolean;
  onMountVault?: () => void;
}

const FONT_FAMILIES = [
  { label: 'Inter (Modern Sans)', value: "'Inter', sans-serif" },
  { label: 'Arial (Clean Corporate)', value: "Arial, Helvetica, sans-serif" },
  { label: 'Merriweather (Editorial Serif)', value: "'Merriweather', Georgia, serif" },
  { label: 'Georgia (Classic Formal)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Playfair Display (Luxury Serif)', value: "'Playfair Display', serif" },
  { label: 'JetBrains Mono (Technical / Code)', value: "'JetBrains Mono', monospace" }
];

const FONT_SIZES = [
  { label: '10pt (Fine Print)', value: '1' },
  { label: '11pt (Body Small)', value: '2' },
  { label: '12pt (Body Regular)', value: '3' },
  { label: '14pt (Subheading)', value: '4' },
  { label: '18pt (Heading 2)', value: '5' },
  { label: '24pt (Heading 1)', value: '6' },
  { label: '32pt (Document Title)', value: '7' }
];

const COLOR_PRESETS = [
  { label: 'Charcoal Navy', value: '#0f2942' },
  { label: 'Executive Teal', value: '#0d9488' },
  { label: 'Slate Dark', value: '#1e293b' },
  { label: 'Royal Blue', value: '#2563eb' },
  { label: 'Crimson Red', value: '#b91c1c' },
  { label: 'Emerald Green', value: '#15803d' },
  { label: 'Gold Amber', value: '#b45309' },
  { label: 'Muted Gray', value: '#64748b' }
];

const HIGHLIGHT_PRESETS = [
  { label: 'Soft Yellow', value: '#fef08a' },
  { label: 'Mint Green', value: '#bbf7d0' },
  { label: 'Ice Cyan', value: '#a5f3fc' },
  { label: 'Warm Peach', value: '#fed7aa' },
  { label: 'Lavender', value: '#e9d5ff' },
  { label: 'None (Transparent)', value: 'transparent' }
];

const TEMPLATES = [
  {
    name: 'Executive Memorandum',
    description: 'Formal internal executive memo with memo header & action items',
    content: `
      <div style="border-bottom: 3px solid #0f2942; padding-bottom: 12px; margin-bottom: 24px;">
        <h1 style="color: #0f2942; margin: 0 0 8px 0; font-size: 26px;">MEMORANDUM</h1>
        <table style="width: 100%; border: none; font-size: 13px; margin: 0;">
          <tr><td style="width: 80px; font-weight: bold; border: none; padding: 4px 0; color: #64748b;">TO:</td><td style="border: none; padding: 4px 0; color: #0f172a;">Executive Board / Investment Committee</td></tr>
          <tr><td style="font-weight: bold; border: none; padding: 4px 0; color: #64748b;">FROM:</td><td style="border: none; padding: 4px 0; color: #0f172a;">Managing Director & Financial Controller</td></tr>
          <tr><td style="font-weight: bold; border: none; padding: 4px 0; color: #64748b;">DATE:</td><td style="border: none; padding: 4px 0; color: #0f172a;">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td></tr>
          <tr><td style="font-weight: bold; border: none; padding: 4px 0; color: #64748b;">SUBJECT:</td><td style="border: none; padding: 4px 0; font-weight: bold; color: #0f2942;">Commercial Operations Update & Capital Allocation Proposal</td></tr>
        </table>
      </div>
      <h2 style="color: #0d9488; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">1. Executive Summary</h2>
      <p>This memorandum summarizes the key commercial deliverables, unit margin performance, and forward capital requirements for the current operating cycle.</p>
      
      <div style="background: #f0fdfa; border-left: 4px solid #0d9488; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <strong style="color: #0f766e;">Key Takeaway:</strong> Operating cash flow remains resilient, and unit margins have achieved our 35% target markup milestone ahead of schedule.
      </div>

      <h2 style="color: #0d9488; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-top: 24px;">2. Strategic Action Items</h2>
      <ul>
        <li><strong>Supplier Contracts:</strong> Lock in tiered batch volume pricing for raw inputs.</li>
        <li><strong>Facility Setup:</strong> Conclude equipment commissioning and safety compliance verification.</li>
        <li><strong>Credit Facility:</strong> Submit verified multi-year financial statements to the lending panel.</li>
      </ul>
    `
  },
  {
    name: 'Project Status & Cost Variance Report',
    description: 'Track milestones, budget variance, and operational health',
    content: `
      <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0d9488; padding-bottom: 12px; margin-bottom: 20px;">
        <div>
          <span style="font-size: 10px; font-weight: 800; color: #0d9488; text-transform: uppercase; letter-spacing: 1.5px;">Performance Review</span>
          <h1 style="color: #0f2942; font-size: 24px; margin: 4px 0 0 0;">Project Health & Financial Variance Report</h1>
        </div>
        <div style="text-align: right; font-size: 11px; color: #64748b;">
          Status: <strong style="color: #15803d;">ON TRACK (GREEN)</strong><br/>
          As of: ${new Date().toLocaleDateString()}
        </div>
      </div>

      <h2 style="color: #0f2942; font-size: 16px;">I. Milestone Execution</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 12px 0 20px 0; font-size: 12px;">
        <thead>
          <tr style="background: #f1f5f9; color: #0f2942;">
            <th style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left;">Project Phase / Milestone</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">Target Date</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">Status</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">Completion %</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; font-weight: 600;">Phase 1: Procurement & Supply Chain Validation</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: center;">Month 1</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: center; color: #15803d; font-weight: bold;">Completed</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; font-weight: bold;">100%</td>
          </tr>
          <tr>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; font-weight: 600;">Phase 2: Commercial Pilot Production Run</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: center;">Month 2</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: center; color: #2563eb; font-weight: bold;">In Progress</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; font-weight: bold;">65%</td>
          </tr>
          <tr>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; font-weight: 600;">Phase 3: Market Launch & Regional Distribution</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: center;">Month 3</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: center; color: #64748b;">Scheduled</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right;">0%</td>
          </tr>
        </tbody>
      </table>
    `
  }
];

export const DocumentEditor: React.FC<Props> = ({
  initialTitle,
  initialContent,
  onSave,
  onClose,
  isVaultMounted
}) => {
  const dialogRef = useAccessibleDialog(onClose);
  const [title, setTitle] = useState(initialTitle ? initialTitle.replace(/_/g, ' ') : 'Commercial Document');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [selectedFont, setSelectedFont] = useState("'Inter', sans-serif");
  const [selectedSize, setSelectedSize] = useState('3');
  const [activeStates, setActiveStates] = useState<Record<string, boolean>>({});
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [pageMargin, setPageMargin] = useState<'normal' | 'compact' | 'wide'>('normal');
  const [runningHeader, setRunningHeader] = useState('CONFIDENTIAL • COMMERCIAL WORKING DRAFT');
  const [runningFooter, setRunningFooter] = useState('Prepared for Authorized Institutional Review');
  const [showRunningHeader, setShowRunningHeader] = useState(true);

  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = DOMPurify.sanitize(initialContent || '<p><br></p>');
      updateStats();
      document.execCommand('defaultParagraphSeparator', false, 'p');
    }
  }, []);

  const updateStats = () => {
    if (editorRef.current) {
      const text = editorRef.current.innerText || '';
      const words = text.trim().split(/\s+/).filter(w => w.length > 0);
      setWordCount(words.length);
      setCharCount(text.length);

      const currentBlock = (document.queryCommandValue('formatBlock') || '').toLowerCase();
      const currentFontSize = document.queryCommandValue('fontSize') || '3';
      setSelectedSize(currentFontSize);

      setActiveStates({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strike: document.queryCommandState('strikeThrough'),
        listUl: document.queryCommandState('insertUnorderedList'),
        listOl: document.queryCommandState('insertOrderedList'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight'),
        justifyFull: document.queryCommandState('justifyFull'),
        h1: currentBlock === 'h1' || currentBlock === '<h1>',
        h2: currentBlock === 'h2' || currentBlock === '<h2>',
        h3: currentBlock === 'h3' || currentBlock === '<h3>',
        p: currentBlock === 'p' || currentBlock === '<p>' || !currentBlock || currentBlock === 'div',
        blockquote: currentBlock === 'blockquote'
      });
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    if (html) {
      const sanitized = DOMPurify.sanitize(html, {
        ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'hr', 'blockquote'],
        ADD_ATTR: ['style', 'src', 'alt', 'width', 'height', 'align', 'colspan', 'rowspan']
      });
      document.execCommand('insertHTML', false, sanitized);
    } else if (text) {
      document.execCommand('insertText', false, text);
    }
    updateStats();
  };

  const execCommand = (e: React.MouseEvent | null, command: string, value: string = '') => {
    if (e) e.preventDefault();
    if (!editorRef.current) return;
    editorRef.current.focus();

    try {
      if (command === 'formatBlock' && value) {
        const finalValue = value.startsWith('<') ? value : `<${value}>`;
        document.execCommand(command, false, finalValue);
      } else {
        document.execCommand(command, false, value);
      }
    } catch (err) {
      console.warn('Command exec error:', command, err);
    }
    updateStats();
  };

  const handleFontFamilyChange = (font: string) => {
    setSelectedFont(font);
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('fontName', false, font);
    updateStats();
  };

  const handleFontSizeChange = (size: string) => {
    setSelectedSize(size);
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('fontSize', false, size);
    updateStats();
  };

  const stepFontSize = (delta: number) => {
    const current = parseInt(selectedSize, 10) || 3;
    const next = Math.max(1, Math.min(7, current + delta));
    handleFontSizeChange(next.toString());
  };

  const handleTextColor = (color: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('foreColor', false, color);
    setShowColorPicker(false);
    updateStats();
  };

  const handleHighlightColor = (color: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('hiliteColor', false, color);
    setShowHighlightPicker(false);
    updateStats();
  };

  const insertPageBreak = (e: React.MouseEvent) => {
    e.preventDefault();
    const pbHtml = `
      <div class="document-page-break no-print" contenteditable="false" style="margin: 2.5rem 0; border-top: 2px dashed #cbd5e1; position: relative; text-align: center; height: 0; pointer-events: none;">
        <span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #f8fafc; color: #64748b; font-size: 10px; font-weight: 800; padding: 2px 12px; border-radius: 9999px; border: 1px solid #cbd5e1; letter-spacing: 1.5px;">PAGE BREAK</span>
      </div>
      <div class="print-only-page-break" style="break-after: page; display: none;"></div>
      <p><br></p>
    `;
    document.execCommand('insertHTML', false, pbHtml);
    updateStats();
  };

  const insertTable = (rows = 3, cols = 3) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    let tableHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
        <thead>
          <tr style="background: #f1f5f9; color: #0f2942; font-weight: bold;">
    `;
    for (let c = 1; c <= cols; c++) {
      tableHtml += `<th style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left;">Header ${c}</th>`;
    }
    tableHtml += `</tr></thead><tbody>`;

    for (let r = 1; r <= rows; r++) {
      const isEven = r % 2 === 0;
      tableHtml += `<tr style="${isEven ? 'background: #f8fafc;' : ''}">`;
      for (let c = 1; c <= cols; c++) {
        tableHtml += `<td style="border: 1px solid #cbd5e1; padding: 8px 12px;">Data Row ${r}, Col ${c}</td>`;
      }
      tableHtml += `</tr>`;
    }
    tableHtml += `</tbody></table><p><br></p>`;

    document.execCommand('insertHTML', false, tableHtml);
    updateStats();
  };

  const insertCalloutBox = (type: 'note' | 'highlight' | 'warning') => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    let bg = '#f8fafc';
    let border = '#0f2942';
    let title = 'EXECUTIVE NOTE';
    let icon = '📌';

    if (type === 'highlight') {
      bg = '#f0fdfa';
      border = '#0d9488';
      title = 'STRATEGIC HIGHLIGHT';
      icon = '✨';
    } else if (type === 'warning') {
      bg = '#fffbeb';
      border = '#f59e0b';
      title = 'RISK / CONTINGENCY FACTOR';
      icon = '⚠️';
    }

    const html = `
      <div style="background: ${bg}; border-left: 4px solid ${border}; border-radius: 6px; padding: 14px 18px; margin: 18px 0;">
        <div style="font-size: 10px; font-weight: 800; color: ${border}; letter-spacing: 1px; margin-bottom: 4px;">${icon} ${title}</div>
        <div style="font-size: 13px; color: #1e293b; line-height: 1.6;">Insert critical executive takeaway or context here...</div>
      </div>
      <p><br></p>
    `;

    document.execCommand('insertHTML', false, html);
    updateStats();
  };

  const insertDivider = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('insertHorizontalRule', false);
    updateStats();
  };

  const handleImageInsert = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const savedSysFile = await uploadFileToSystemDatabase(file);
      if (savedSysFile && (savedSysFile.viewUrl || savedSysFile.downloadUrl)) {
        const url = savedSysFile.viewUrl || savedSysFile.downloadUrl;
        const imgTag = `<div style="text-align:center; margin:16px 0;"><img src="${url}" alt="${savedSysFile.fileName.replace(/[&<>"']/g, '_')}" style="max-width:100%; border-radius:8px; border:1px solid #e2e8f0; box-shadow:0 4px 12px rgba(0,0,0,0.08);" /><p style="font-size:11px; color:#64748b; margin-top:6px;"><em>Figure: ${savedSysFile.fileName}</em></p></div><p><br></p>`;
        document.execCommand('insertHTML', false, imgTag);
        if (fileInputRef.current) fileInputRef.current.value = '';
        updateStats();
        return;
      }
    } catch (uploadErr) {
      console.warn('System db upload fallback to dataUrl:', uploadErr);
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const imgTag = `<div style="text-align:center; margin:16px 0;"><img src="${dataUrl}" style="max-width:100%; border-radius:8px; border:1px solid #e2e8f0; box-shadow:0 4px 12px rgba(0,0,0,0.08);" /><p style="font-size:11px; color:#64748b; margin-top:6px;"><em>Uploaded Image Asset</em></p></div><p><br></p>`;
      document.execCommand('insertHTML', false, imgTag);
      if (fileInputRef.current) fileInputRef.current.value = '';
      updateStats();
    };
    reader.readAsDataURL(file);
  };

  const loadTemplate = (content: string) => {
    if (!editorRef.current) return;
    if (editorRef.current.innerText.trim().length > 10) {
      if (!confirm('Replace current editor content with this professional template?')) return;
    }
    editorRef.current.innerHTML = DOMPurify.sanitize(content);
    setShowTemplatesModal(false);
    updateStats();
  };

  const handleSave = async () => {
    if (!editorRef.current) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const content = DOMPurify.sanitize(editorRef.current.innerHTML);
      await onSave(title, content);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Document save failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const paddingClass = pageMargin === 'compact' ? 'p-8' : pageMargin === 'wide' ? 'p-24' : 'p-16';

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Document editor"
      tabIndex={-1}
      className="fixed inset-0 z-[250] bg-stone-300 flex flex-col items-center justify-start animate-in fade-in duration-200 overflow-hidden"
    >
      {/* Top Ribbon & Control Header */}
      <div className="w-full bg-white border-b border-stone-200 shadow-sm z-30 px-6 py-2 shrink-0 no-print">
        <div className="flex items-center justify-between mb-2">
          {/* Left: Back & Document Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              title="Back to Documents"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold transition border border-stone-200"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
            <div className="flex items-center gap-2 px-2.5 py-1 bg-teal-50 border border-teal-200 rounded-lg">
              <FileText size={16} className="text-teal-700" />
              <span className="text-[11px] font-extrabold text-teal-900 uppercase tracking-wider">Document Pro</span>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-transparent border-b border-transparent hover:border-stone-300 focus:border-teal-600 outline-none font-bold text-stone-800 text-sm w-72 px-1 py-0.5 transition-colors placeholder:text-stone-300"
              placeholder="Document Title..."
            />
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTemplatesModal(true)}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition border border-stone-200"
            >
              <LayoutTemplate size={14} />
              <span>Templates</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
            >
              <Printer size={14} />
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm ${
                isSaving ? 'bg-stone-200 text-stone-400' : 'bg-teal-700 hover:bg-teal-600 text-white'
              }`}
            >
              <Save size={14} />
              <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Secondary Ribbon: Rich Formatting Toolbar */}
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pt-2 border-t border-stone-150 text-xs">
          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-stone-200 shrink-0">
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'undo')}
              className="w-7 h-7 flex items-center justify-center hover:bg-stone-100 rounded text-stone-600"
              title="Undo"
            >
              <Undo size={14} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'redo')}
              className="w-7 h-7 flex items-center justify-center hover:bg-stone-100 rounded text-stone-600"
              title="Redo"
            >
              <Redo size={14} />
            </button>
          </div>

          {/* Font Family Dropdown */}
          <div className="flex items-center shrink-0">
            <select
              value={selectedFont}
              onChange={(e) => handleFontFamilyChange(e.target.value)}
              className="h-7 px-2 bg-stone-50 border border-stone-200 rounded text-xs font-medium text-stone-700 outline-none hover:bg-white focus:ring-1 focus:ring-teal-500"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Font Size & Steppers */}
          <div className="flex items-center gap-1 pr-2 border-r border-stone-200 shrink-0">
            <button
              type="button"
              onMouseDown={() => stepFontSize(-1)}
              className="w-6 h-7 flex items-center justify-center hover:bg-stone-100 rounded text-stone-600 border border-stone-200"
              title="Decrease Font Size"
            >
              <Minus size={12} />
            </button>
            <select
              value={selectedSize}
              onChange={(e) => handleFontSizeChange(e.target.value)}
              className="h-7 px-1.5 bg-stone-50 border border-stone-200 rounded text-xs font-medium text-stone-700 outline-none hover:bg-white"
            >
              {FONT_SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onMouseDown={() => stepFontSize(1)}
              className="w-6 h-7 flex items-center justify-center hover:bg-stone-100 rounded text-stone-600 border border-stone-200"
              title="Increase Font Size"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Text Styling: Bold, Italic, Underline, Strike */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-stone-200 shrink-0">
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'bold')}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                activeStates.bold ? 'bg-teal-700 text-white font-bold' : 'hover:bg-stone-100 text-stone-600'
              }`}
              title="Bold (Ctrl+B)"
            >
              <Bold size={14} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'italic')}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                activeStates.italic ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-600'
              }`}
              title="Italic (Ctrl+I)"
            >
              <Italic size={14} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'underline')}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                activeStates.underline ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-600'
              }`}
              title="Underline (Ctrl+U)"
            >
              <Underline size={14} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'strikeThrough')}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                activeStates.strike ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-600'
              }`}
              title="Strikethrough"
            >
              <Strikethrough size={14} />
            </button>
          </div>

          {/* Color & Highlight Pickers */}
          <div className="flex items-center gap-1 pr-2 border-r border-stone-200 shrink-0 relative">
            <button
              type="button"
              onClick={() => {
                setShowColorPicker(!showColorPicker);
                setShowHighlightPicker(false);
              }}
              className="flex items-center gap-1 px-1.5 h-7 hover:bg-stone-100 rounded text-stone-700 border border-stone-200"
              title="Text Color"
            >
              <Palette size={13} />
              <ChevronDown size={10} />
            </button>

            {showColorPicker && (
              <div className="absolute top-9 left-0 bg-white border border-stone-200 rounded-xl p-2.5 shadow-xl z-50 w-44 grid grid-cols-4 gap-1.5 animate-in fade-in zoom-in-95">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => handleTextColor(c.value)}
                    style={{ backgroundColor: c.value }}
                    className="w-8 h-8 rounded-lg border border-black/10 hover:scale-105 transition-transform"
                    title={c.label}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setShowHighlightPicker(!showHighlightPicker);
                setShowColorPicker(false);
              }}
              className="flex items-center gap-1 px-1.5 h-7 hover:bg-stone-100 rounded text-stone-700 border border-stone-200"
              title="Highlight Background"
            >
              <Highlighter size={13} />
              <ChevronDown size={10} />
            </button>

            {showHighlightPicker && (
              <div className="absolute top-9 left-12 bg-white border border-stone-200 rounded-xl p-2.5 shadow-xl z-50 w-44 grid grid-cols-3 gap-1.5 animate-in fade-in zoom-in-95">
                {HIGHLIGHT_PRESETS.map((h) => (
                  <button
                    key={h.value}
                    type="button"
                    onClick={() => handleHighlightColor(h.value)}
                    style={{ backgroundColor: h.value === 'transparent' ? '#f1f5f9' : h.value }}
                    className="h-8 rounded-lg border border-black/10 flex items-center justify-center text-[10px] font-bold text-stone-700 hover:scale-105 transition-transform"
                    title={h.label}
                  >
                    {h.value === 'transparent' ? 'None' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Heading Blocks: H1, H2, H3, P, Quote */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-stone-200 shrink-0">
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'formatBlock', 'h1')}
              className={`px-2 h-7 rounded text-xs font-bold transition-colors ${
                activeStates.h1 ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-700'
              }`}
              title="Heading 1"
            >
              H1
            </button>
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'formatBlock', 'h2')}
              className={`px-2 h-7 rounded text-xs font-bold transition-colors ${
                activeStates.h2 ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-700'
              }`}
              title="Heading 2"
            >
              H2
            </button>
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'formatBlock', 'h3')}
              className={`px-2 h-7 rounded text-xs font-bold transition-colors ${
                activeStates.h3 ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-700'
              }`}
              title="Heading 3"
            >
              H3
            </button>
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'formatBlock', 'p')}
              className={`px-2 h-7 rounded text-xs font-medium transition-colors ${
                activeStates.p ? 'bg-stone-200 text-stone-900 font-bold' : 'hover:bg-stone-100 text-stone-600'
              }`}
              title="Normal Paragraph"
            >
              ¶
            </button>
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'formatBlock', 'blockquote')}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                activeStates.blockquote ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-600'
              }`}
              title="Quote / Blockquote"
            >
              <Quote size={13} />
            </button>
          </div>

          {/* Alignment */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-stone-200 shrink-0">
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'justifyLeft')}
              className={`w-7 h-7 flex items-center justify-center rounded ${
                activeStates.justifyLeft ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-600'
              }`}
              title="Align Left"
            >
              <AlignLeft size={13} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'justifyCenter')}
              className={`w-7 h-7 flex items-center justify-center rounded ${
                activeStates.justifyCenter ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-600'
              }`}
              title="Align Center"
            >
              <AlignCenter size={13} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'justifyRight')}
              className={`w-7 h-7 flex items-center justify-center rounded ${
                activeStates.justifyRight ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-600'
              }`}
              title="Align Right"
            >
              <AlignRight size={13} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'justifyFull')}
              className={`w-7 h-7 flex items-center justify-center rounded ${
                activeStates.justifyFull ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-600'
              }`}
              title="Justify"
            >
              <AlignJustify size={13} />
            </button>
          </div>

          {/* Lists */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-stone-200 shrink-0">
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'insertUnorderedList')}
              className={`w-7 h-7 flex items-center justify-center rounded ${
                activeStates.listUl ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-600'
              }`}
              title="Bullet List"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => execCommand(e, 'insertOrderedList')}
              className={`w-7 h-7 flex items-center justify-center rounded ${
                activeStates.listOl ? 'bg-teal-700 text-white' : 'hover:bg-stone-100 text-stone-600'
              }`}
              title="Numbered List"
            >
              <ListOrdered size={14} />
            </button>
          </div>

          {/* Inserts: Table, Image, Callout, Divider, Page Break */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => insertTable(3, 3)}
              className="flex items-center gap-1 px-2 h-7 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded font-semibold text-stone-700"
              title="Insert 3x3 Table"
            >
              <TableIcon size={13} />
              <span>Table</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 h-7 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded font-semibold text-stone-700"
              title="Insert Image"
            >
              <ImageIcon size={13} />
              <span>Image</span>
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageInsert} />

            <button
              type="button"
              onClick={() => insertCalloutBox('highlight')}
              className="flex items-center gap-1 px-2 h-7 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded font-semibold text-teal-800"
              title="Insert Executive Callout"
            >
              <Sparkles size={13} />
              <span>Callout</span>
            </button>

            <button
              type="button"
              onClick={insertPageBreak}
              className="flex items-center gap-1 px-2 h-7 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded font-semibold text-stone-700"
              title="Insert Page Break"
            >
              <Scissors size={12} />
              <span>Page Break</span>
            </button>
          </div>
        </div>
      </div>

      {/* PAPER CANVAS CONTAINER */}
      <div className="flex-1 w-full overflow-y-auto custom-scrollbar flex flex-col items-center py-8 px-4 bg-stone-200 print:bg-white print:p-0 print:block">
        <div className="w-full max-w-[850px] relative shadow-xl print:shadow-none print:max-w-none bg-white rounded-t-lg">
          
          {/* Running Document Header (Visible & Editable) */}
          {showRunningHeader && (
            <div className="px-14 pt-6 pb-3 border-b border-stone-150 flex items-center justify-between text-[11px] text-stone-400 select-none">
              <input
                type="text"
                value={runningHeader}
                onChange={(e) => setRunningHeader(e.target.value)}
                className="bg-transparent border-none text-stone-400 focus:text-stone-700 font-semibold tracking-wider uppercase text-[10px] w-80 outline-none"
              />
              <span className="text-[10px] text-stone-400 font-medium">{title}</span>
            </div>
          )}

          {/* Editable Main Paper Canvas */}
          <div
            ref={editorRef}
            contentEditable
            onInput={updateStats}
            onKeyUp={updateStats}
            onMouseUp={updateStats}
            onPaste={handlePaste}
            className={`w-full min-h-[1050px] bg-white ${paddingClass} outline-none text-stone-800 prose prose-slate max-w-none prose-h1:text-3xl prose-h1:font-extrabold prose-h1:text-stone-900 prose-h2:text-xl prose-h2:font-bold prose-h2:text-teal-900 prose-p:text-[15px] prose-p:leading-relaxed prose-li:text-[15px] prose-table:text-[13px] print:p-0 print:min-h-0`}
            style={{ fontFamily: selectedFont }}
          />

          {/* Running Document Footer */}
          <div className="px-14 py-4 border-t border-stone-150 flex items-center justify-between text-[11px] text-stone-400 select-none no-print">
            <input
              type="text"
              value={runningFooter}
              onChange={(e) => setRunningFooter(e.target.value)}
              className="bg-transparent border-none text-stone-400 focus:text-stone-700 text-[10px] w-96 outline-none"
            />
            <span className="text-[10px] font-semibold text-stone-400">Standard 8.5" x 11" Paper Canvas</span>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="w-full bg-stone-900 text-stone-300 h-8 flex items-center justify-between px-6 text-xs font-medium z-40 shrink-0 no-print">
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-1.5 text-stone-400">
            <FileText size={13} className="text-teal-400" />
            <strong className="text-white">{wordCount.toLocaleString()}</strong> words
          </span>
          <span className="text-stone-500">•</span>
          <span className="text-stone-400">
            <strong className="text-white">{charCount.toLocaleString()}</strong> characters
          </span>
          <span className="text-stone-500">•</span>
          <span className="text-stone-400">
            ~{Math.max(1, Math.ceil(wordCount / 200))} min read
          </span>
        </div>

        <div className="flex items-center gap-5">
          {saveSuccess && (
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold animate-in fade-in">
              <CheckCircle2 size={14} />
              <span>SAVED TO PROJECT</span>
            </div>
          )}

          <div className="flex items-center gap-2 border-l border-stone-700 pl-4">
            <span className="text-stone-400">Margin:</span>
            <select
              value={pageMargin}
              onChange={(e) => setPageMargin(e.target.value as any)}
              className="bg-stone-800 text-stone-200 border border-stone-700 rounded px-1.5 py-0.5 text-[11px] outline-none"
            >
              <option value="compact">Compact (0.75 in)</option>
              <option value="normal">Normal (1.0 in)</option>
              <option value="wide">Wide (1.25 in)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Templates Modal */}
      {showTemplatesModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-2xl max-w-lg w-full space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LayoutTemplate size={20} className="text-teal-700" />
                <h3 className="font-bold text-base text-stone-900">Executive Document Templates</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplatesModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-400"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-stone-500">
              Instantly scaffold your document with professional styling, formatted tables, and structured business sections:
            </p>
            <div className="space-y-3">
              {TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.name}
                  onClick={() => loadTemplate(tmpl.content)}
                  className="p-4 border border-stone-200 hover:border-teal-500 bg-stone-50 hover:bg-teal-50/40 rounded-xl cursor-pointer transition-all space-y-1 group"
                >
                  <div className="font-bold text-stone-800 text-xs group-hover:text-teal-900 flex items-center justify-between">
                    <span>{tmpl.name}</span>
                    <span className="text-[10px] text-teal-700 font-extrabold uppercase tracking-wider">Load Template →</span>
                  </div>
                  <p className="text-[11px] text-stone-500">{tmpl.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentEditor;
