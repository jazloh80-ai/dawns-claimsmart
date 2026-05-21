'use client';

import { useState, useCallback, useRef } from 'react';

interface Receipt {
  id: string;
  filename: string;
  status: 'processing' | 'done' | 'error';
  date: string;
  merchant: string;
  category: string;
  amount: string;
  currency: string;
  error?: string;
}

const CATEGORIES = [
  'Food & Dining',
  'Travel',
  'Accommodation',
  'Office Supplies',
  'Entertainment',
  'Healthcare',
  'Transportation',
  'Other',
];

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function StatusDot({ status }: { status: Receipt['status'] }) {
  if (status === 'processing') {
    return (
      <div className="w-4 h-4 rounded-full border-2 border-zinc-600 border-t-white animate-spin flex-shrink-0" />
    );
  }
  if (status === 'done') {
    return (
      <div className="w-4 h-4 rounded-full bg-emerald-500 flex-shrink-0 flex items-center justify-center">
        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-4 h-4 rounded-full bg-red-500 flex-shrink-0 flex items-center justify-center">
      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  );
}

function EditableCell({
  value,
  onChange,
  type = 'text',
  className = '',
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
  maxLength?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={maxLength}
      className={`bg-zinc-900 border border-zinc-700/60 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400/20 transition-colors w-full ${className}`}
    />
  );
}

export default function HomePage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    const id = crypto.randomUUID();

    setReceipts((prev) => [
      ...prev,
      {
        id,
        filename: file.name,
        status: 'processing',
        date: '',
        merchant: '',
        category: '',
        amount: '',
        currency: '',
      },
    ]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/extract', { method: 'POST', body: formData });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Extraction failed' }));
        throw new Error(error ?? 'Extraction failed');
      }

      const data = await res.json();

      setReceipts((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: 'done',
                date: data.date ?? '',
                merchant: data.merchant ?? '',
                category: CATEGORIES.includes(data.category) ? data.category : 'Other',
                amount: String(data.amount ?? ''),
                currency: data.currency ?? '',
              }
            : r
        )
      );
    } catch (err) {
      setReceipts((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' }
            : r
        )
      );
    }
  }, []);

  const handleFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter((f) => ACCEPTED_TYPES.includes(f.type));
      files.forEach(processFile);
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const update = (id: string, field: keyof Receipt, value: string) => {
    setReceipts((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const remove = (id: string) => {
    setReceipts((prev) => prev.filter((r) => r.id !== id));
  };

  const handleExport = async () => {
    const ready = receipts.filter((r) => r.status === 'done');
    if (ready.length === 0) return;
    setIsExporting(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipts: ready.map((r) => ({
            filename: r.filename,
            date: r.date,
            merchant: r.merchant,
            category: r.category,
            amount: parseFloat(r.amount) || 0,
            currency: r.currency,
          })),
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expense-claims-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const doneCount = receipts.filter((r) => r.status === 'done').length;
  const processingCount = receipts.filter((r) => r.status === 'processing').length;
  const total = receipts
    .filter((r) => r.status === 'done')
    .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-zinc-800/80 px-6 py-4 sticky top-0 bg-black/90 backdrop-blur-sm z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg flex-shrink-0 object-cover" />
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-white">Dawn&apos;s ClaimSmart</h1>
              <p className="text-xs text-zinc-500 hidden sm:block">AI-powered expense extraction</p>
            </div>
          </div>

          {doneCount > 0 && (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-4 text-xs text-zinc-500 mr-2">
                <span>{doneCount} claim{doneCount !== 1 ? 's' : ''}</span>
                {total > 0 && <span className="text-zinc-400 font-medium">{total.toFixed(2)} total</span>}
              </div>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-2 px-3 py-1.5 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {isExporting ? 'Exporting…' : 'Export Excel'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Upload zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-white bg-zinc-900/60 scale-[1.01]'
              : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-950/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 flex items-center justify-center">
              <svg className="w-7 h-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-zinc-200 font-medium text-base">
                {isDragging ? 'Drop your receipts here' : 'Upload receipt photos'}
              </p>
              <p className="text-zinc-500 text-sm">
                Drag &amp; drop or click to browse &mdash; JPG, PNG, GIF, WEBP supported
              </p>
            </div>
            {processingCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <div className="w-3 h-3 rounded-full border border-zinc-500 border-t-white animate-spin" />
                Extracting {processingCount} receipt{processingCount !== 1 ? 's' : ''}…
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        {receipts.length > 0 && (
          <div className="rounded-2xl border border-zinc-800/80 overflow-hidden">
            {/* Table header info */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/40">
              <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setReceipts([])}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Clear all
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/60 bg-zinc-950/60">
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider w-[180px]">File</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider w-[140px]">Date</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider w-[160px]">Merchant</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider w-[160px]">Category</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider w-[110px]">Amount</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider w-[80px]">Currency</th>
                    <th className="px-4 py-3 w-[48px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((receipt, i) => (
                    <tr
                      key={receipt.id}
                      className={`border-b border-zinc-800/40 last:border-0 transition-colors ${
                        i % 2 === 0 ? 'bg-black/40' : 'bg-zinc-950/20'
                      }`}
                    >
                      {/* File + status */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <StatusDot status={receipt.status} />
                          <span className="text-zinc-400 text-xs truncate max-w-[120px]" title={receipt.filename}>
                            {receipt.filename}
                          </span>
                        </div>
                      </td>

                      {/* Editable cells or loading/error states */}
                      {receipt.status === 'processing' ? (
                        <td colSpan={5} className="px-4 py-2.5">
                          <div className="flex gap-2">
                            {[120, 140, 120, 90, 60].map((w, j) => (
                              <div
                                key={j}
                                className="h-7 bg-zinc-800/60 rounded animate-pulse"
                                style={{ width: w }}
                              />
                            ))}
                          </div>
                        </td>
                      ) : receipt.status === 'error' ? (
                        <td colSpan={5} className="px-4 py-2.5">
                          <span className="text-red-400 text-xs">{receipt.error ?? 'Failed to extract'}</span>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-2.5">
                            <EditableCell
                              type="date"
                              value={receipt.date}
                              onChange={(v) => update(receipt.id, 'date', v)}
                              className="w-[120px]"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <EditableCell
                              value={receipt.merchant}
                              onChange={(v) => update(receipt.id, 'merchant', v)}
                              className="w-[140px]"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={receipt.category}
                              onChange={(e) => update(receipt.id, 'category', e.target.value)}
                              className="bg-zinc-900 border border-zinc-700/60 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400/20 transition-colors w-full"
                            >
                              <option value="">— select —</option>
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2.5">
                            <EditableCell
                              type="number"
                              value={receipt.amount}
                              onChange={(v) => update(receipt.id, 'amount', v)}
                              className="w-[90px]"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="text"
                              value={receipt.currency}
                              onChange={(e) => update(receipt.id, 'currency', e.target.value.toUpperCase().slice(0, 3))}
                              maxLength={3}
                              className="bg-zinc-900 border border-zinc-700/60 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400/20 transition-colors uppercase w-[60px] text-center font-mono tracking-wider"
                            />
                          </td>
                        </>
                      )}

                      {/* Delete */}
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => remove(receipt.id)}
                          className="text-zinc-600 hover:text-red-400 transition-colors p-1 rounded"
                          aria-label="Remove"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Footer totals */}
                {doneCount > 0 && (
                  <tfoot>
                    <tr className="border-t border-zinc-800/60 bg-zinc-950/60">
                      <td colSpan={4} className="px-4 py-3 text-xs text-zinc-500 text-right font-medium">
                        Total ({doneCount} claim{doneCount !== 1 ? 's' : ''})
                      </td>
                      <td className="px-4 py-3 text-sm text-white font-semibold">
                        {total.toFixed(2)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {receipts.length === 0 && (
          <p className="text-center text-zinc-700 text-sm py-4">
            Upload receipt photos above — Claude will extract the details automatically.
          </p>
        )}
      </main>
    </div>
  );
}
