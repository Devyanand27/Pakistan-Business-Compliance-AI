import { useEffect, useState } from 'react';
import { FileText, Search, X } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface SearchCommandModalProps {
  open: boolean;
  onClose: () => void;
  onSelectDocument: (documentId: number, chunkId: number, pageNumber: number) => void;
}

export function SearchCommandModal({ open, onClose, onSelectDocument }: SearchCommandModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      setLoading(true);
      apiRequest<{ chunks: any[] }>(`/api/documents/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => setResults(res.chunks || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 px-4 pt-20"
      role="dialog"
      aria-modal="true"
      aria-label="Quick Regulatory Search"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SECP forms, FBR NTN/STRN, SRB SST-03, or statutory sections..."
            className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {!query.trim() && (
            <p className="px-4 py-8 text-center text-xs text-slate-500">
              Type keywords like "Single Member Company nominee", "Form 9", "IRIS Form 181", or "SST-03".
            </p>
          )}
          {loading && <p className="px-4 py-6 text-center text-xs text-slate-500">Searching official passages...</p>}
          {!loading && query.trim() && results.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-slate-500">No matching passages in indexed official sources.</p>
          )}
          {results.map((item) => (
            <button
              key={item.chunk_id}
              type="button"
              onClick={() => {
                onSelectDocument(item.document_id, item.chunk_id, item.page_number);
                onClose();
              }}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70"
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.document_title}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums">
                    Page {item.page_number}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-teal-700 dark:text-teal-400">
                  {item.authority_name} · {item.section_title}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                  {item.chunk_text}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
