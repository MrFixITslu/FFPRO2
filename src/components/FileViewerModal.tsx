import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ProjectFile } from '../types';
import { 
  X, Download, ExternalLink, ZoomIn, ZoomOut, RotateCw, 
  Maximize2, Minimize2, Copy, Check, FileText, FileSpreadsheet, 
  FileImage, FileArchive, FileCode, File as FileIcon, Loader2, 
  AlertCircle, Table, Code, Eye, RefreshCw
} from 'lucide-react';
import { formatFileSize, getFileBlob, getInternalDoc, getFileFromHardDrive } from '../services/fileStorageService';

interface FileViewerModalProps {
  file: ProjectFile | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (file: ProjectFile) => void;
  onOpenInEditor?: (file: ProjectFile) => void;
  directoryHandle?: FileSystemDirectoryHandle | null;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  file,
  isOpen,
  onClose,
  onDownload,
  onOpenInEditor,
  directoryHandle
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [csvViewMode, setCsvViewMode] = useState<'table' | 'raw'>('table');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  const fileExt = useMemo(() => {
    if (!file?.name) return '';
    return file.name.split('.').pop()?.toLowerCase() || '';
  }, [file?.name]);

  const fileCategory = useMemo(() => {
    if (!file) return 'unknown';
    const ext = fileExt;
    const type = file.type || '';

    if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
      return 'image';
    }
    if (type === 'application/pdf' || ext === 'pdf') {
      return 'pdf';
    }
    if (ext === 'fdoc' || type === 'application/fire-doc') {
      return 'fdoc';
    }
    if (ext === 'fcel' || type === 'application/fire-cell') {
      return 'fcel';
    }
    if (['csv', 'tsv'].includes(ext) || type.includes('csv')) {
      return 'csv';
    }
    if (['json'].includes(ext) || type.includes('json')) {
      return 'json';
    }
    if (
      type.startsWith('text/') || 
      ['txt', 'md', 'markdown', 'log', 'html', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'sh', 'sql', 'xml', 'yaml', 'yml'].includes(ext)
    ) {
      return 'text';
    }
    if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) {
      return 'audio';
    }
    if (type.startsWith('video/') || ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv'].includes(ext)) {
      return 'video';
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return 'archive';
    }
    if (['xlsx', 'xls'].includes(ext)) {
      return 'excel';
    }
    if (['docx', 'doc'].includes(ext)) {
      return 'word';
    }
    return 'binary';
  }, [file, fileExt]);

  // Load content whenever the file changes
  useEffect(() => {
    if (!isOpen || !file) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      setTextContent(null);
      setError(null);
      setLoading(false);
      setZoom(1);
      setRotation(0);
      return;
    }

    let isCurrent = true;
    setLoading(true);
    setError(null);
    setZoom(1);
    setRotation(0);

    const loadData = async () => {
      try {
        let blob: Blob | null = null;
        let text: string | null = null;

        // Check if doc content is directly in internal store (.fdoc, .fcel, etc.)
        if (fileCategory === 'fdoc' || fileCategory === 'fcel') {
          text = await getInternalDoc(file.id);
        }

        // Try hard drive / filesystem if available
        if (!text && !blob && directoryHandle && file.storageType === 'filesystem') {
          try {
            blob = await getFileFromHardDrive(directoryHandle, file.storageRef);
          } catch (e) {
            console.warn('Could not read from filesystem, trying IDB/API fallback');
          }
        }

        // Try IndexedDB blob store
        if (!text && !blob) {
          blob = await getFileBlob(file.id);
        }

        // Try System database / API route
        if (!text && !blob && (file.systemFileId || file.storageType === 'database' || file.downloadUrl)) {
          const targetId = file.systemFileId || file.id;
          const res = await fetch(`/api/files/${encodeURIComponent(targetId)}`, {
            credentials: 'include'
          });
          if (res.ok) {
            blob = await res.blob();
          }
        }

        // Try text fallback from internal doc
        if (!text && !blob) {
          text = await getInternalDoc(file.id);
          if (text) {
            blob = new Blob([text], { type: file.type || 'text/plain' });
          }
        }

        if (!isCurrent) return;

        if (blob) {
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);

          // If it's a text-based category, extract text
          if (['text', 'csv', 'json', 'fdoc', 'fcel'].includes(fileCategory)) {
            const extractedText = await blob.text();
            if (isCurrent) setTextContent(extractedText);
          }
        } else if (text) {
          setTextContent(text);
          const url = URL.createObjectURL(new Blob([text], { type: file.type || 'text/plain' }));
          setBlobUrl(url);
        } else {
          // If no blob is retrieved but we have a download URL or server file ID, use direct URL
          if (file.downloadUrl) {
            setBlobUrl(file.downloadUrl);
          } else {
            setError('Could not retrieve file content from storage.');
          }
        }
      } catch (err: any) {
        console.error('Error loading file preview:', err);
        if (isCurrent) {
          setError(err.message || 'An error occurred while loading the file preview.');
        }
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isCurrent = false;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [isOpen, file?.id, file?.systemFileId, fileCategory]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !file) return null;

  const handleCopyText = async () => {
    if (!textContent) return;
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Clipboard copy failed:', err);
    }
  };

  const handleOpenInNewTab = () => {
    if (blobUrl) {
      window.open(blobUrl, '_blank');
    } else if (file.systemFileId || file.storageType === 'database') {
      window.open(`/api/files/${encodeURIComponent(file.systemFileId || file.id)}`, '_blank');
    }
  };

  // Parse CSV rows for table view
  const parsedCsv = useMemo(() => {
    if (fileCategory !== 'csv' || !textContent) return null;
    const lines = textContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return null;

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map(parseLine);
    return { headers, rows };
  }, [fileCategory, textContent]);

  // Pretty JSON formatted
  const formattedJson = useMemo(() => {
    if (fileCategory !== 'json' || !textContent) return null;
    try {
      const parsed = JSON.parse(textContent);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return textContent;
    }
  }, [fileCategory, textContent]);

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        ref={modalContainerRef}
        onClick={(e) => e.stopPropagation()}
        className={`bg-stone-900 border border-stone-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-stone-100 transition-all duration-300 ${
          isFullscreen 
            ? 'w-full h-full max-w-none max-h-none rounded-none' 
            : 'w-full max-w-5xl h-[88vh] max-h-[900px]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-stone-900 border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${
              fileCategory === 'image' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
              fileCategory === 'pdf' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
              fileCategory === 'csv' || fileCategory === 'excel' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              fileCategory === 'text' || fileCategory === 'json' || fileCategory === 'fdoc' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
              fileCategory === 'archive' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
              'bg-stone-800 text-stone-300 border border-stone-700'
            }`}>
              {fileCategory === 'image' && <FileImage className="w-5 h-5" />}
              {fileCategory === 'pdf' && <FileText className="w-5 h-5" />}
              {(fileCategory === 'csv' || fileCategory === 'excel' || fileCategory === 'fcel') && <FileSpreadsheet className="w-5 h-5" />}
              {(fileCategory === 'text' || fileCategory === 'json' || fileCategory === 'fdoc') && <FileCode className="w-5 h-5" />}
              {fileCategory === 'archive' && <FileArchive className="w-5 h-5" />}
              {['audio', 'video', 'word', 'binary', 'unknown'].includes(fileCategory) && <FileIcon className="w-5 h-5" />}
            </div>

            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate flex items-center gap-2">
                <span>{file.name.replace(/_/g, ' ')}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-stone-800 text-stone-300 border border-stone-700">
                  {fileExt || fileCategory}
                </span>
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                <span>{formatFileSize(file.size)}</span>
                <span>•</span>
                <span>{file.timestamp ? new Date(file.timestamp).toLocaleString() : 'Recent'}</span>
                <span>•</span>
                <span className="capitalize">{file.storageType === 'database' ? 'System Cloud DB' : file.storageType === 'indexeddb' ? 'Encrypted Vault' : 'Mirror Drive'}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions Header Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Editor Switch Button for Docs/Sheets */}
            {(fileCategory === 'fdoc' || fileCategory === 'fcel') && onOpenInEditor && (
              <button
                onClick={() => {
                  onClose();
                  onOpenInEditor(file);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Open in Full Editor</span>
              </button>
            )}

            {/* CSV View Switcher */}
            {fileCategory === 'csv' && parsedCsv && (
              <div className="flex items-center bg-stone-800 border border-stone-700 rounded-lg p-0.5">
                <button
                  onClick={() => setCsvViewMode('table')}
                  className={`px-2 py-1 text-xs font-semibold rounded flex items-center gap-1 transition ${
                    csvViewMode === 'table' ? 'bg-indigo-600 text-white shadow-sm' : 'text-stone-400 hover:text-white'
                  }`}
                  title="Table View"
                >
                  <Table className="w-3.5 h-3.5" /> Table
                </button>
                <button
                  onClick={() => setCsvViewMode('raw')}
                  className={`px-2 py-1 text-xs font-semibold rounded flex items-center gap-1 transition ${
                    csvViewMode === 'raw' ? 'bg-indigo-600 text-white shadow-sm' : 'text-stone-400 hover:text-white'
                  }`}
                  title="Raw Text View"
                >
                  <Code className="w-3.5 h-3.5" /> Raw
                </button>
              </div>
            )}

            {/* Image Controls */}
            {fileCategory === 'image' && !loading && !error && (
              <div className="hidden sm:flex items-center bg-stone-800 border border-stone-700 rounded-lg p-0.5">
                <button
                  onClick={() => setZoom(prev => Math.max(prev - 0.25, 0.25))}
                  className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-700 rounded transition"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 text-[10px] font-mono text-stone-400 min-w-[40px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom(prev => Math.min(prev + 0.25, 4))}
                  className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-700 rounded transition"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setRotation(prev => (prev + 90) % 360)}
                  className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-700 rounded transition ml-1"
                  title="Rotate 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { setZoom(1); setRotation(0); }}
                  className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-700 rounded transition"
                  title="Reset Zoom"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Open in New Window */}
            {(fileCategory === 'pdf' || fileCategory === 'image' || file.storageType === 'database') && (
              <button
                onClick={handleOpenInNewTab}
                className="p-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition"
                title="Open in new window / tab"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}

            {/* Copy Content (for text/code/csv/json) */}
            {textContent && (
              <button
                onClick={handleCopyText}
                className="p-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition flex items-center gap-1"
                title="Copy file text"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            )}

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(prev => !prev)}
              className="p-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition hidden sm:block"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Download Button */}
            <button
              onClick={() => onDownload(file)}
              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
              title="Download file to computer"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Download</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition ml-1"
              title="Close viewer (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div className="flex-1 overflow-auto bg-stone-950 p-3 sm:p-6 flex items-center justify-center relative select-text">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-stone-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs font-medium">Loading preview for {file.name}...</p>
            </div>
          )}

          {!loading && error && (
            <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-xl p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Preview Unavailable</h3>
                <p className="text-xs text-stone-400">{error}</p>
              </div>
              <button
                onClick={() => onDownload(file)}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-sm transition"
              >
                <Download className="w-4 h-4" /> Download File Instead
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Image Viewer */}
              {fileCategory === 'image' && blobUrl && (
                <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
                  <img
                    src={blobUrl}
                    alt={file.name}
                    style={{
                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                      transition: 'transform 0.15s ease-out'
                    }}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-all"
                  />
                </div>
              )}

              {/* PDF Viewer */}
              {fileCategory === 'pdf' && blobUrl && (
                <div className="w-full h-full flex flex-col rounded-xl overflow-hidden bg-stone-900 border border-stone-800">
                  <object
                    data={blobUrl}
                    type="application/pdf"
                    className="w-full h-full min-h-[550px] rounded-lg"
                  >
                    <div className="p-8 text-center space-y-4 m-auto">
                      <FileText className="w-12 h-12 text-rose-400 mx-auto" />
                      <div>
                        <h4 className="text-sm font-bold text-white">PDF Preview</h4>
                        <p className="text-xs text-stone-400 mt-1">Your browser requires direct window opening for PDF viewing.</p>
                      </div>
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={handleOpenInNewTab}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-500 transition flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-4 h-4" /> Open PDF in New Window
                        </button>
                        <button
                          onClick={() => onDownload(file)}
                          className="px-4 py-2 bg-stone-800 text-stone-200 rounded-lg text-xs font-bold hover:bg-stone-700 transition flex items-center gap-1.5"
                        >
                          <Download className="w-4 h-4" /> Download PDF
                        </button>
                      </div>
                    </div>
                  </object>
                </div>
              )}

              {/* CSV Table View */}
              {fileCategory === 'csv' && csvViewMode === 'table' && parsedCsv && (
                <div className="w-full h-full overflow-auto bg-stone-900 rounded-xl border border-stone-800 shadow-inner">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-stone-800/90 border-b border-stone-700 sticky top-0 backdrop-blur-sm z-10">
                        <th className="p-2.5 text-[10px] font-mono text-stone-500 border-r border-stone-700/60 w-12 text-center">#</th>
                        {parsedCsv.headers.map((header, idx) => (
                          <th key={idx} className="p-2.5 font-bold text-stone-200 text-xs border-r border-stone-700/60 whitespace-nowrap">
                            {header || `Col ${idx + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-800">
                      {parsedCsv.rows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="hover:bg-stone-800/50 transition">
                          <td className="p-2 text-[10px] font-mono text-stone-500 border-r border-stone-800 text-center bg-stone-900/50">
                            {rowIdx + 1}
                          </td>
                          {row.map((cell, cellIdx) => (
                            <td key={cellIdx} className="p-2 text-stone-300 font-mono text-xs border-r border-stone-800/60 whitespace-nowrap">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Text / Code / Raw CSV / JSON / Markdown Viewer */}
              {((['text', 'json', 'fdoc', 'fcel'].includes(fileCategory)) || (fileCategory === 'csv' && csvViewMode === 'raw')) && textContent && (
                <div className="w-full h-full flex flex-col bg-stone-900 rounded-xl border border-stone-800 overflow-hidden font-mono text-xs">
                  <div className="flex-1 overflow-auto p-4 select-text">
                    <pre className="text-stone-200 whitespace-pre-wrap leading-relaxed font-mono">
                      {fileCategory === 'json' ? formattedJson : textContent}
                    </pre>
                  </div>
                </div>
              )}

              {/* Audio Player */}
              {fileCategory === 'audio' && blobUrl && (
                <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-2xl p-8 text-center space-y-6">
                  <div className="w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto text-2xl">
                    <FileIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white truncate">{file.name}</h3>
                    <p className="text-xs text-stone-400 mt-1">Audio Recording</p>
                  </div>
                  <audio controls src={blobUrl} className="w-full" />
                </div>
              )}

              {/* Video Player */}
              {fileCategory === 'video' && blobUrl && (
                <div className="w-full h-full flex items-center justify-center">
                  <video controls src={blobUrl} className="max-w-full max-h-full rounded-xl shadow-2xl" />
                </div>
              )}

              {/* Office / Archive / Other Binary Files */}
              {['word', 'excel', 'archive', 'binary', 'unknown'].includes(fileCategory) && (
                <div className="max-w-lg w-full bg-stone-900 border border-stone-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
                  <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-inner ${
                    fileCategory === 'excel' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    fileCategory === 'word' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                    fileCategory === 'archive' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                    'bg-stone-800 text-stone-400 border border-stone-700'
                  }`}>
                    {fileCategory === 'excel' && <FileSpreadsheet className="w-10 h-10" />}
                    {fileCategory === 'word' && <FileText className="w-10 h-10" />}
                    {fileCategory === 'archive' && <FileArchive className="w-10 h-10" />}
                    {['binary', 'unknown'].includes(fileCategory) && <FileIcon className="w-10 h-10" />}
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white break-words">{file.name.replace(/_/g, ' ')}</h3>
                    <p className="text-xs text-stone-400">
                      {fileCategory === 'excel' ? 'Microsoft Excel Spreadsheet' :
                       fileCategory === 'word' ? 'Microsoft Word Document' :
                       fileCategory === 'archive' ? 'Compressed Archive File' :
                       'Binary Project Document'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-left bg-stone-950/70 p-3.5 rounded-xl border border-stone-800/80 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-stone-500 block">File Size</span>
                      <span className="text-stone-200 font-semibold">{formatFileSize(file.size)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-stone-500 block">File Type</span>
                      <span className="text-stone-200 font-semibold uppercase">{fileExt || 'Binary'}</span>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-stone-800">
                      <span className="text-[10px] uppercase font-bold text-stone-500 block">Storage Vault</span>
                      <span className="text-stone-200 font-semibold">
                        {file.storageType === 'database' ? 'System Database (Direct Cloud Synced)' :
                         file.storageType === 'indexeddb' ? 'Client-Side Encrypted Storage' : 'Hard Drive Mirror'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => onDownload(file)}
                      className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition active:scale-95"
                    >
                      <Download className="w-4 h-4" /> Download & Open File
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer / Status Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-stone-900 border-t border-stone-800 flex items-center justify-between text-[11px] text-stone-400 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Secure Document Vault
            </span>
            {textContent && (
              <span className="hidden sm:inline border-l border-stone-800 pl-3">
                {textContent.split(/\r?\n/).length} lines • {textContent.length} characters
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg text-xs font-semibold transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
