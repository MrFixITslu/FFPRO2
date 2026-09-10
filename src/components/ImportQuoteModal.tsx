import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Trash2,
  Plus,
  Loader2,
  X,
  ShieldCheck,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { BudgetEvent, ExtractedQuoteItem, SupplierQuoteData, ProductionItem, ProjectFile } from '../types';
import { uploadFileToSystemDatabase } from '../services/fileStorageService';

interface ImportQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedEvent: BudgetEvent;
  currentUser: string;
  onConfirmImport: (
    itemsToCosting: ProductionItem[],
    savedFileDoc: ProjectFile,
    quoteRecord: SupplierQuoteData,
    replaceExisting: boolean
  ) => void;
}

export const ImportQuoteModal: React.FC<ImportQuoteModalProps> = ({
  isOpen,
  onClose,
  selectedEvent,
  currentUser,
  onConfirmImport
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState<string>('');
  const [useTextMode, setUseTextMode] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  
  // Ollama status check
  const [ollamaStatus, setOllamaStatus] = useState<{ connected: boolean; model?: string; checking: boolean }>({
    connected: false,
    checking: true
  });

  // Review step state
  const [isReviewing, setIsReviewing] = useState<boolean>(false);
  const [quoteData, setQuoteData] = useState<SupplierQuoteData | null>(null);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check Ollama status on mount
  useEffect(() => {
    if (!isOpen) return;
    checkOllama();
  }, [isOpen]);

  const checkOllama = async () => {
    setOllamaStatus(prev => ({ ...prev, checking: true }));
    try {
      const res = await fetch('/api/ai/ollama/status');
      if (res.ok) {
        const data = await res.json();
        setOllamaStatus({
          connected: Boolean(data.connected),
          model: data.model || 'Local Model',
          checking: false
        });
      } else {
        setOllamaStatus({ connected: false, checking: false });
      }
    } catch {
      setOllamaStatus({ connected: false, checking: false });
    }
  };

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      setExtractionError(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setExtractionError(null);
    }
  };

  const handleStartExtraction = async () => {
    if (!file && (!pastedText || pastedText.trim().length === 0)) {
      setExtractionError('Please select a supplier quote file (PDF) or paste the quote text.');
      return;
    }

    setIsExtracting(true);
    setExtractionError(null);

    try {
      let res: Response;

      if (file) {
        const formData = new FormData();
        formData.append('quoteFile', file);
        formData.append('projectId', selectedEvent.id);

        res = await fetch('/api/ai/ollama/extract-quote', {
          method: 'POST',
          body: formData
        });
      } else {
        res = await fetch('/api/ai/ollama/extract-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteText: pastedText,
            fileName: 'Pasted_Quote_Text.txt',
            projectId: selectedEvent.id
          })
        });
      }

      const result = await res.json();

      if (!res.ok || !result.ok || !result.extracted) {
        throw new Error(result.error || 'Failed to extract quote information via Ollama.');
      }

      const extracted = result.extracted;
      const newQuoteData: SupplierQuoteData = {
        id: 'quote_' + Date.now(),
        supplier: extracted.supplier || 'Supplier',
        quoteNumber: extracted.quoteNumber || '',
        quoteDate: extracted.quoteDate || new Date().toISOString().split('T')[0],
        currency: extracted.currency || 'USD',
        items: extracted.items || [],
        discounts: extracted.discounts || 0,
        shippingCosts: extracted.shippingCosts || 0,
        subtotal: extracted.subtotal || 0,
        total: extracted.total || 0,
        commercialTerms: extracted.commercialTerms || '',
        importedAt: new Date().toISOString()
      };

      setQuoteData(newQuoteData);
      setIsReviewing(true);
    } catch (err: any) {
      console.error('Quote extraction failed:', err);
      setExtractionError(err.message || 'Ollama extraction failed. Verify Ollama is running.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Handlers for reviewing & editing extracted data
  const handleItemChange = (index: number, field: keyof ExtractedQuoteItem, value: any) => {
    if (!quoteData) return;
    const updatedItems = [...quoteData.items];
    const item = { ...updatedItems[index], [field]: value };
    
    // Auto-calculate line total
    if (field === 'quantity' || field === 'unitCost' || field === 'discount') {
      const qty = field === 'quantity' ? parseFloat(value) || 0 : item.quantity;
      const unitCost = field === 'unitCost' ? parseFloat(value) || 0 : item.unitCost;
      const discount = field === 'discount' ? parseFloat(value) || 0 : (item.discount || 0);
      item.lineTotal = Math.max(0, qty * unitCost - discount);
    }

    updatedItems[index] = item;
    const subtotal = updatedItems.reduce((s, it) => s + (it.lineTotal || 0), 0);
    const total = subtotal + (quoteData.shippingCosts || 0) - (quoteData.discounts || 0);

    setQuoteData({
      ...quoteData,
      items: updatedItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    });
  };

  const handleRemoveItem = (index: number) => {
    if (!quoteData) return;
    const updatedItems = quoteData.items.filter((_, i) => i !== index);
    const subtotal = updatedItems.reduce((s, it) => s + (it.lineTotal || 0), 0);
    const total = subtotal + (quoteData.shippingCosts || 0) - (quoteData.discounts || 0);

    setQuoteData({
      ...quoteData,
      items: updatedItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    });
  };

  const handleAddItem = () => {
    if (!quoteData) return;
    const newItem: ExtractedQuoteItem = {
      item: 'New Quoted Component',
      description: '',
      quantity: 1,
      unitCost: 0,
      discount: 0,
      shippingCost: 0,
      lineTotal: 0
    };
    setQuoteData({
      ...quoteData,
      items: [...quoteData.items, newItem]
    });
  };

  // Final confirmation: save original quote to documents & populate costing
  const handleConfirm = async () => {
    if (!quoteData) return;
    setIsSaving(true);

    try {
      // 1. Prepare meaningful file name: e.g. "Netronic Laser Tag - Quote 25-08-2026.pdf"
      const supplierClean = (quoteData.supplier || 'Supplier').replace(/[/\\?%*:|"<>]/g, '-').trim();
      const quoteRefClean = (quoteData.quoteNumber || quoteData.quoteDate || 'Quote').replace(/[/\\?%*:|"<>]/g, '-').trim();
      const originalExt = file?.name?.split('.').pop() || 'pdf';
      const meaningfulFileName = `${supplierClean} - Quote ${quoteRefClean}.${originalExt}`;

      let uploadedFileRecord: ProjectFile;

      // 2. Save original uploaded file or text to Project Documents
      if (file) {
        const sysFile = await uploadFileToSystemDatabase(file, selectedEvent.id, meaningfulFileName);
        uploadedFileRecord = {
          id: sysFile.id,
          name: sysFile.fileName,
          type: sysFile.fileType || 'application/pdf',
          size: sysFile.fileSize,
          timestamp: new Date().toISOString(),
          storageRef: `db/${sysFile.id}`,
          storageType: 'database',
          systemFileId: sysFile.id,
          downloadUrl: sysFile.downloadUrl,
          viewUrl: sysFile.viewUrl,
          version: 1,
          lastModifiedBy: currentUser
        };
      } else {
        // Create a text blob document for pasted quote
        const textBlob = new Blob([pastedText], { type: 'text/plain;charset=utf-8' });
        const sysFile = await uploadFileToSystemDatabase(textBlob, selectedEvent.id, `${supplierClean} - Quote ${quoteRefClean}.txt`);
        uploadedFileRecord = {
          id: sysFile.id,
          name: sysFile.fileName,
          type: 'text/plain',
          size: sysFile.fileSize,
          timestamp: new Date().toISOString(),
          storageRef: `db/${sysFile.id}`,
          storageType: 'database',
          systemFileId: sysFile.id,
          downloadUrl: sysFile.downloadUrl,
          viewUrl: sysFile.viewUrl,
          version: 1,
          lastModifiedBy: currentUser
        };
      }

      // 3. Convert quoted items into Interactive Sale Price Costing ProductionItems
      const costingItems: ProductionItem[] = quoteData.items.map((it, idx) => ({
        id: `cost_${Date.now()}_${idx}`,
        name: it.item,
        description: it.description || '',
        quantity: it.quantity || 1,
        unitCost: it.unitCost || 0,
        discount: it.discount || 0,
        shippingCost: it.shippingCost || 0,
        // The cost field in productionItems is the total cost for this line item
        cost: it.lineTotal || (it.quantity * it.unitCost - (it.discount || 0)),
        supplier: quoteData.supplier,
        sourceQuoteId: quoteData.id
      }));

      // If there are separate shipping/freight costs quoted, include as an allocated cost item
      if (quoteData.shippingCosts && quoteData.shippingCosts > 0) {
        costingItems.push({
          id: `cost_ship_${Date.now()}`,
          name: `Freight & Shipping (${quoteData.supplier})`,
          description: `Supplier delivery charges for quote ${quoteData.quoteNumber || ''}`,
          quantity: 1,
          unitCost: quoteData.shippingCosts,
          cost: quoteData.shippingCosts,
          supplier: quoteData.supplier,
          sourceQuoteId: quoteData.id
        });
      }

      const finalQuoteRecord: SupplierQuoteData = {
        ...quoteData,
        savedFileId: uploadedFileRecord.id,
        savedFileName: uploadedFileRecord.name
      };

      onConfirmImport(costingItems, uploadedFileRecord, finalQuoteRecord, replaceExisting);
      onClose();
    } catch (err: any) {
      console.error('Failed to commit imported quote:', err);
      setExtractionError(`Failed to save quote: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-stone-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-stone-150 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                Import Supplier Quote
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                  Local Ollama AI
                </span>
              </h3>
              <p className="text-xs text-stone-500">
                Extract supplier costs directly into Interactive Sale Price Costing and archive the quote to Documents.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-stone-200 text-stone-400 hover:text-stone-700 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Ollama Status Bar */}
        <div className="px-5 py-2.5 bg-stone-100/70 border-b border-stone-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${ollamaStatus.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="font-medium text-stone-600">
              {ollamaStatus.checking
                ? 'Connecting to local Ollama...'
                : ollamaStatus.connected
                ? `Local Ollama Active (${ollamaStatus.model})`
                : 'Ollama Offline or Unreachable (ensure "ollama serve" is running)'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={checkOllama}
              className="text-[11px] text-stone-500 hover:text-stone-800 font-semibold flex items-center gap-1"
            >
              <RefreshCw size={11} className={ollamaStatus.checking ? 'animate-spin' : ''} />
              Check Status
            </button>
            <span className="text-stone-300">|</span>
            <span className="text-[10px] text-stone-500 flex items-center gap-1">
              <ShieldCheck size={12} className="text-emerald-600" />
              Strict: Cost extraction only
            </span>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {extractionError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-600" />
              <div className="space-y-1">
                <p className="font-bold">Extraction Issue</p>
                <p className="text-rose-600">{extractionError}</p>
              </div>
            </div>
          )}

          {!isReviewing ? (
            /* STEP 1: Upload & Input Screen */
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Select Supplier Quote Document
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setUseTextMode(false)}
                    className={`px-2.5 py-1 rounded font-semibold transition-all ${
                      !useTextMode ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    Upload File (PDF)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseTextMode(true)}
                    className={`px-2.5 py-1 rounded font-semibold transition-all ${
                      useTextMode ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    Paste Text
                  </button>
                </div>
              </div>

              {!useTextMode ? (
                /* File Dropzone */
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    file
                      ? 'border-emerald-500 bg-emerald-50/30'
                      : 'border-stone-300 hover:border-emerald-500 hover:bg-stone-50/50'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".pdf,.txt,.csv,.doc,.docx"
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-600">
                      {file ? <CheckCircle size={24} className="text-emerald-600" /> : <Upload size={24} />}
                    </div>
                    {file ? (
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-stone-900">{file.name}</p>
                        <p className="text-xs text-stone-500">{(file.size / 1024).toFixed(1)} KB • Click to choose a different file</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-stone-800">
                          Drop supplier quote PDF here, or <span className="text-emerald-600 underline">browse files</span>
                        </p>
                        <p className="text-xs text-stone-400">
                          Supports official vendor quotes, proforma invoices, and equipment price sheets
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Text Input */
                <div className="space-y-2">
                  <textarea
                    rows={6}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste the raw text of the supplier quote here (items, quantities, unit prices, supplier details)..."
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                  />
                  <p className="text-[11px] text-stone-400 italic">
                    Tip: If your PDF has unselectable text or scanned tables, you can paste its text content directly.
                  </p>
                </div>
              )}

              {/* Extraction Rules Guidance */}
              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200/80 text-xs text-stone-600 space-y-2">
                <div className="font-bold text-stone-800 flex items-center gap-1.5 text-xs">
                  <ShieldCheck size={15} className="text-emerald-600" />
                  Controlled AI Extraction Rules
                </div>
                <ul className="list-disc list-inside text-[11px] text-stone-500 space-y-1 pl-1">
                  <li>Ollama will strictly extract the <strong>supplier, quote number, date, items, unit costs, and commercial terms</strong>.</li>
                  <li>Extracted values are treated as <strong>production costs (COGS)</strong>, never automated sale prices.</li>
                  <li>The original document is automatically preserved unmodified in <strong>Project → Documents</strong>.</li>
                  <li>You will review and verify all extracted items before anything is saved.</li>
                </ul>
              </div>
            </div>
          ) : (
            /* STEP 2: Review Screen (Requirement 4) */
            quoteData && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-stone-150">
                  <div>
                    <h4 className="text-sm font-bold text-stone-900">Review Extracted Quote Data</h4>
                    <p className="text-xs text-stone-500">
                      Verify supplier details and item costs. You can edit any field or remove items before import.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsReviewing(false)}
                    className="text-xs font-semibold text-stone-500 hover:text-stone-800 underline"
                  >
                    Re-upload / Back
                  </button>
                </div>

                {/* Quote Header Information */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200 text-xs">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400 block mb-1">Supplier</label>
                    <input
                      type="text"
                      value={quoteData.supplier}
                      onChange={(e) => setQuoteData({ ...quoteData, supplier: e.target.value })}
                      className="w-full px-2 py-1 bg-white border border-stone-200 rounded font-semibold text-stone-800 focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400 block mb-1">Quote / Ref #</label>
                    <input
                      type="text"
                      value={quoteData.quoteNumber}
                      onChange={(e) => setQuoteData({ ...quoteData, quoteNumber: e.target.value })}
                      className="w-full px-2 py-1 bg-white border border-stone-200 rounded font-semibold text-stone-800 focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400 block mb-1">Quote Date</label>
                    <input
                      type="text"
                      value={quoteData.quoteDate}
                      onChange={(e) => setQuoteData({ ...quoteData, quoteDate: e.target.value })}
                      className="w-full px-2 py-1 bg-white border border-stone-200 rounded font-semibold text-stone-800 focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400 block mb-1">Currency</label>
                    <input
                      type="text"
                      value={quoteData.currency}
                      onChange={(e) => setQuoteData({ ...quoteData, currency: e.target.value.toUpperCase() })}
                      className="w-full px-2 py-1 bg-white border border-stone-200 rounded font-semibold text-stone-800 focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-4 mt-1">
                    <label className="text-[10px] font-bold uppercase text-stone-400 block mb-1">Commercial Terms / Validity</label>
                    <input
                      type="text"
                      value={quoteData.commercialTerms || ''}
                      onChange={(e) => setQuoteData({ ...quoteData, commercialTerms: e.target.value })}
                      placeholder="e.g. 50% deposit, validity 30 days, FOB port"
                      className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-stone-700 focus:ring-1 focus:ring-emerald-500 outline-none text-xs"
                    />
                  </div>
                </div>

                {/* Items Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-600">
                      Quoted Line Items ({quoteData.items.length})
                    </label>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      <Plus size={14} /> Add Item
                    </button>
                  </div>

                  <div className="border border-stone-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200 text-stone-400 font-bold uppercase tracking-wider text-[9px]">
                          <th className="py-2.5 px-3">Item Name</th>
                          <th className="py-2.5 px-3">Description / Specs</th>
                          <th className="py-2.5 px-2 w-16 text-right">Qty</th>
                          <th className="py-2.5 px-2 w-24 text-right">Unit Cost</th>
                          <th className="py-2.5 px-2 w-20 text-right">Discount</th>
                          <th className="py-2.5 px-3 w-24 text-right">Line Total</th>
                          <th className="py-2.5 px-2 w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-150">
                        {quoteData.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-stone-50/50">
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={item.item}
                                onChange={(e) => handleItemChange(idx, 'item', e.target.value)}
                                className="w-full px-1.5 py-1 bg-white border border-stone-200 rounded text-stone-800 font-semibold focus:ring-1 focus:ring-emerald-500 outline-none"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={item.description || ''}
                                onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                                placeholder="Specs / details"
                                className="w-full px-1.5 py-1 bg-white border border-stone-200 rounded text-stone-600 focus:ring-1 focus:ring-emerald-500 outline-none"
                              />
                            </td>
                            <td className="py-2 px-2 text-right">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                className="w-full px-1.5 py-1 bg-white border border-stone-200 rounded text-stone-800 text-right focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                              />
                            </td>
                            <td className="py-2 px-2 text-right">
                              <div className="relative">
                                <span className="absolute left-1.5 top-1 text-stone-400 text-[10px]">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.unitCost}
                                  onChange={(e) => handleItemChange(idx, 'unitCost', e.target.value)}
                                  className="w-full pl-4 pr-1.5 py-1 bg-white border border-stone-200 rounded text-stone-800 text-right focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                                />
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.discount || 0}
                                onChange={(e) => handleItemChange(idx, 'discount', e.target.value)}
                                className="w-full px-1.5 py-1 bg-white border border-stone-200 rounded text-stone-600 text-right focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-stone-900">
                              ${(item.lineTotal || 0).toFixed(2)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="text-stone-400 hover:text-rose-600 transition-colors p-1"
                                title="Remove line item"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Additional Costs & Total Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200">
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400 block mb-1">
                        Shipping / Freight Costs ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={quoteData.shippingCosts || 0}
                        onChange={(e) => {
                          const shipping = parseFloat(e.target.value) || 0;
                          setQuoteData({
                            ...quoteData,
                            shippingCosts: shipping,
                            total: (quoteData.subtotal || 0) + shipping - (quoteData.discounts || 0)
                          });
                        }}
                        className="w-full px-2 py-1 bg-white border border-stone-200 rounded font-mono text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400 block mb-1">
                        Overall Quote Discount ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={quoteData.discounts || 0}
                        onChange={(e) => {
                          const disc = parseFloat(e.target.value) || 0;
                          setQuoteData({
                            ...quoteData,
                            discounts: disc,
                            total: (quoteData.subtotal || 0) + (quoteData.shippingCosts || 0) - disc
                          });
                        }}
                        className="w-full px-2 py-1 bg-white border border-stone-200 rounded font-mono text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col justify-end space-y-2 font-mono text-xs border-t sm:border-t-0 sm:border-l border-stone-200 sm:pl-4 pt-2 sm:pt-0">
                    <div className="flex justify-between text-stone-500">
                      <span>Items Subtotal:</span>
                      <span>${(quoteData.subtotal || 0).toFixed(2)}</span>
                    </div>
                    {(quoteData.shippingCosts || 0) > 0 && (
                      <div className="flex justify-between text-stone-500">
                        <span>Shipping / Freight:</span>
                        <span>+${(quoteData.shippingCosts || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {(quoteData.discounts || 0) > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Discounts:</span>
                        <span>-${(quoteData.discounts || 0).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold text-stone-900 pt-2 border-t border-stone-200">
                      <span>Total Quoted Cost:</span>
                      <span className="text-emerald-700">${(quoteData.total || 0).toFixed(2)} {quoteData.currency}</span>
                    </div>
                  </div>
                </div>

                {/* Import Destination Options */}
                <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200/80 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-emerald-950">Interactive Costing Target</p>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      Items will be populated into the raw materials table of Interactive Sale Price Costing.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-stone-700">
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={(e) => setReplaceExisting(e.target.checked)}
                      className="w-3.5 h-3.5 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500"
                    />
                    <span className="text-xs">Replace existing materials</span>
                  </label>
                </div>
              </div>
            )
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-stone-150 bg-stone-50/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isExtracting || isSaving}
            className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition-colors"
          >
            Cancel
          </button>

          {!isReviewing ? (
            <button
              type="button"
              onClick={handleStartExtraction}
              disabled={isExtracting || (!file && !pastedText.trim())}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExtracting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Extracting Quote Data with Ollama...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Extract Quote Data
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSaving || !quoteData || quoteData.items.length === 0}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Saving Document & Populating Costing...
                </>
              ) : (
                <>
                  <CheckCircle size={15} />
                  Confirm & Populate Costing
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
