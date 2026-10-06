
import React, { useState, useRef } from 'react';
import { parseInputToTransaction, parseStatementToTransactions } from '../services/geminiService';
import { AIAnalysisResult } from '../types';

interface Props {
  onSuccess: (data: AIAnalysisResult) => void;
  onBulkSuccess: (data: AIAnalysisResult[]) => void;
  onLoading: (isLoading: boolean) => void;
  onManualEntry?: () => void;
}

const MagicInput: React.FC<Props> = ({ onSuccess, onBulkSuccess, onLoading, onManualEntry }) => {
  const [input, setInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [notice, setNotice] = useState<{ type: 'info' | 'warning' | 'error'; text: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleMagicSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;

    onLoading(true);
    const result = await parseInputToTransaction(input);
    if (result) {
      onSuccess(result);
      setInput('');
    }
    onLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    if (fileList.length > 10) {
      setNotice({ type: 'error', text: 'Import up to 10 files at a time.' });
      e.target.value = '';
      return;
    }

    setNotice(null);
    onLoading(true);
    try {
      const flattenedResults: AIAnalysisResult[] = [];
      const warnings: string[] = [];

      for (const file of fileList) {
        if (file.size > 10 * 1024 * 1024) {
          warnings.push(`${file.name}: skipped because it is larger than 10 MiB.`);
          continue;
        }

        const lowerName = file.name.toLowerCase();
        if (file.type === 'application/pdf' || lowerName.endsWith('.pdf') || lowerName.endsWith('.csv')) {
          try {
            const statement = await parseStatementToTransactions(file);
            flattenedResults.push(...statement.items);
            warnings.push(...statement.warnings.map(warning => `${file.name}: ${warning}`));
          } catch (error: any) {
            warnings.push(`${file.name}: ${error?.message || 'statement parsing failed'}`);
            if (Array.isArray(error?.warnings)) warnings.push(...error.warnings.map((warning: string) => `${file.name}: ${warning}`));
          }
          continue;
        }

        if (!file.type.startsWith('image/')) {
          warnings.push(`${file.name}: unsupported import type.`);
          continue;
        }

        const resultRaw = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        });
        if (!resultRaw) {
          warnings.push(`${file.name}: could not be read.`);
          continue;
        }
        const base64 = resultRaw.split(',')[1];
        const result = await parseInputToTransaction({ data: base64, mimeType: file.type }, true);
        if (result) flattenedResults.push(result);
        else warnings.push(`${file.name}: no reliable transaction could be extracted.`);
      }

      if (flattenedResults.length > 0) onBulkSuccess(flattenedResults);
      if (warnings.length > 0) {
        setNotice({
          type: flattenedResults.length > 0 ? 'warning' : 'error',
          text: warnings.slice(0, 4).join(' ')
        });
      } else if (flattenedResults.length > 0) {
        setNotice({ type: 'info', text: `${flattenedResults.length} item(s) added to the review queue. Nothing has been posted yet.` });
      }
    } finally {
      onLoading(false);
      e.target.value = '';
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const resultRaw = reader.result;
          if (typeof resultRaw !== 'string') {
            onLoading(false);
            return;
          }
          const base64 = resultRaw.split(',')[1];
          onLoading(true);
          const result = await parseInputToTransaction({ data: base64, mimeType: 'audio/webm' }, true);
          if (result) onSuccess(result);
          onLoading(false);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied", err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  return (
    <div className="relative group">
      <form onSubmit={handleMagicSubmit} className="flex items-center gap-2 p-1.5 bg-white border-2 border-stone-200 rounded-2xl focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100 transition shadow-sm">
        <div className="flex-1 flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full bg-transparent px-3 py-2 text-stone-800 outline-none placeholder:text-stone-400 font-medium"
            placeholder="Describe a transaction, or upload a receipt / PDF / CSV statement…"
          />
        </div>
        
        <div className="flex items-center gap-1 pr-1">
          {onManualEntry && (
            <button
              type="button"
              onClick={onManualEntry}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-indigo-50 text-indigo-500 transition"
              title="Manual Form Entry"
            >
              <i className="fas fa-edit"></i>
            </button>
          )}

          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${isRecording ? 'bg-red-100 text-red-600 animate-pulse' : 'hover:bg-stone-100 text-stone-500'}`}
            title="Voice Record"
          >
            <i className={`fas ${isRecording ? 'fa-stop' : 'fa-microphone'}`}></i>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-stone-100 text-stone-500 transition"
            title="Upload receipts or PDF/CSV statements for review"
          >
            <i className="fas fa-images"></i>
          </button>

          <button
            type="submit"
            disabled={!input.trim()}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50 disabled:bg-stone-400 shadow-md shadow-indigo-200"
          >
            <i className="fas fa-magic"></i>
          </button>
        </div>
      </form>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept="image/*,application/pdf,.csv"
        multiple
      />

      <div className="absolute -bottom-6 left-3 text-[10px] text-stone-400 flex gap-4 uppercase font-black tracking-wider">
        <span>Review-first import</span>
        <i className="fas fa-shield-check text-emerald-500"></i>
      </div>

      {notice && (
        <div className={`mt-8 rounded-xl border px-3 py-2 text-[11px] font-semibold ${
          notice.type === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : notice.type === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          {notice.text}
        </div>
      )}
    </div>
  );
};

export default MagicInput;
