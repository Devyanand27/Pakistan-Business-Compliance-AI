import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { apiRequest } from '../lib/api';
import { t } from '../lib/i18n';
import { Authority, DocumentRecord, Language } from '../types/compliance';

interface DocumentLibraryViewProps {
  language: Language;
  onOpenDocument: (documentId: number, chunkId?: number, pageNumber?: number) => void;
}

export function DocumentLibraryView({ language, onOpenDocument }: DocumentLibraryViewProps) {
  const { notify } = useToast();
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [passageResults, setPassageResults] = useState<any[]>([]);
  const [searchMode, setSearchMode] = useState<'library' | 'passages'>('library');
  const [query, setQuery] = useState('');
  const [authorityFilter, setAuthorityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Summarizer state
  const [summarizing, setSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<{ source: any; summary: any } | null>(null);
  const [uploadSummaryFile, setUploadSummaryFile] = useState<File | null>(null);

  useEffect(() => {
    apiRequest<{ authorities: Authority[] }>('/api/documents/authorities')
      .then((res) => setAuthorities(res.authorities || []))
      .catch(() => {});
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      if (searchMode === 'passages' && query.trim()) {
        const qs = new URLSearchParams({ q: query.trim() });
        if (authorityFilter) qs.set('authority', authorityFilter);
        const res = await apiRequest<{ chunks: any[] }>(`/api/documents/search?${qs.toString()}`);
        setPassageResults(res.chunks || []);
      } else {
        const qs = new URLSearchParams({ page: String(page), limit: '10' });
        if (query.trim()) qs.set('q', query.trim());
        if (authorityFilter) qs.set('authority', authorityFilter);
        if (statusFilter) qs.set('status', statusFilter);
        const res = await apiRequest<{ documents: DocumentRecord[]; pagination: any }>(
          `/api/documents?${qs.toString()}`
        );
        setDocuments(res.documents || []);
        setTotalPages(res.pagination?.totalPages || 1);
      }
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadDocuments, 220);
    return () => clearTimeout(timer);
  }, [query, authorityFilter, statusFilter, page, searchMode]);

  const handleSummarizeOfficial = async (docId: number) => {
    setSummarizing(true);
    try {
      const res = await apiRequest<{ source: any; summary: any }>('/api/documents/summarize', {
        method: 'POST',
        body: JSON.stringify({ document_id: docId, language }),
      });
      setSummaryResult(res);
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSummarizing(false);
    }
  };

  const handleSummarizeUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadSummaryFile) return;
    setSummarizing(true);
    try {
      const form = new FormData();
      form.append('file', uploadSummaryFile);
      form.append('language', language);
      const res = await apiRequest<{ source: any; summary: any }>('/api/documents/summarize', {
        method: 'POST',
        body: form,
      });
      setSummaryResult(res);
      setUploadSummaryFile(null);
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Official Document Library &amp; Summarizer
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Browse verified SECP, FBR, and SRB documents, inspect historical superseded notices, or generate plain-language summaries.
          </p>
        </div>

        <form onSubmit={handleSummarizeUpload} className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <Upload className="h-3.5 w-3.5" />
            <span>{uploadSummaryFile ? uploadSummaryFile.name : 'Upload Document to Summarize'}</span>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.html,.htm,.csv"
              className="hidden"
              onChange={(e) => setUploadSummaryFile(e.target.files?.[0] || null)}
            />
          </label>
          {uploadSummaryFile && (
            <button
              type="submit"
              disabled={summarizing}
              className="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {summarizing ? 'Summarizing...' : 'Summarize Upload'}
            </button>
          )}
        </form>
      </div>

      {/* Search & Mode Switch */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative w-full min-w-0 flex-1 sm:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={
              searchMode === 'library'
                ? 'Search document titles, numbers, or contents...'
                : 'Search exact statutory passages (e.g. Form 9 deadline, SMC nominee)...'
            }
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-medium dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSearchMode('library')}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              searchMode === 'library' ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Documents
          </button>
          <button
            type="button"
            onClick={() => setSearchMode('passages')}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              searchMode === 'passages' ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Passage Search
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Filter Sidebar */}
        <aside className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-3 h-fit">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Issuing Authority</h3>
            <div className="mt-2.5 space-y-1">
              <button
                type="button"
                onClick={() => { setAuthorityFilter(''); setPage(1); }}
                className={`block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium ${
                  authorityFilter === ''
                    ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                All Official Authorities
              </button>
              {authorities.map((a) => (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => { setAuthorityFilter(a.code); setPage(1); }}
                  className={`block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium ${
                    authorityFilter === a.code
                      ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300'
                      : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  {a.code} — {a.name}
                </button>
              ))}
            </div>
          </div>

          {searchMode === 'library' && (
            <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Document Status</h3>
              <div className="mt-2.5 space-y-1">
                {[
                  { id: '', label: 'All Indexed Records' },
                  { id: 'published', label: 'Current / Published' },
                  { id: 'superseded', label: 'Superseded / Historical' },
                  { id: 'conflict_review', label: 'Flagged for Review' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => { setStatusFilter(st.id); setPage(1); }}
                    className={`block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium ${
                      statusFilter === st.id
                        ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300'
                        : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Results List */}
        <div className="space-y-4 lg:col-span-9">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
              ))}
            </div>
          ) : searchMode === 'passages' ? (
            passageResults.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                {query.trim() ? 'No matching statutory passages found.' : 'Enter keywords above to search indexed chunks.'}
              </div>
            ) : (
              passageResults.map((chunk) => (
                <div key={chunk.chunk_id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-teal-700 dark:text-teal-400">
                      {chunk.authority_name} · {chunk.section_title}
                    </span>
                    <span className="font-mono tabular-nums">Page {chunk.page_number} · Score {chunk.score}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenDocument(chunk.document_id, chunk.chunk_id, chunk.page_number)}
                    className="mt-1.5 text-left text-sm font-semibold text-slate-900 hover:text-teal-700 dark:text-slate-100"
                  >
                    {chunk.document_title}
                  </button>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {chunk.chunk_text}
                  </p>
                </div>
              ))
            )
          ) : documents.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              No official documents match these filters.
            </div>
          ) : (
            <>
              {documents.map((doc) => (
                <div key={doc.id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-teal-700 dark:text-teal-400">
                        {doc.authority_code || 'OFFICIAL'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{doc.document_type}</span>
                      {doc.document_number && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{doc.document_number}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">v{doc.version}</span>
                    </div>

                    <span
                      className={`font-medium ${
                        Boolean(doc.is_superseded)
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {Boolean(doc.is_superseded) ? 'Superseded / Historical' : 'Current Official'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenDocument(doc.id)}
                    className="mt-2 text-left text-base font-semibold text-slate-900 hover:text-teal-700 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {doc.title}
                  </button>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      Publication: {doc.publication_date || t(language, 'dateNotStated')}
                    </span>
                    <span>
                      Effective: {doc.effective_date || t(language, 'dateNotStated')}
                    </span>
                    <span className="tabular-nums">
                      {doc.page_count} pages · {doc.chunk_count || 0} indexed sections
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => onOpenDocument(doc.id)}
                      className="inline-flex items-center gap-1.5 font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Read Full Text
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSummarizeOfficial(doc.id)}
                      disabled={summarizing}
                      className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-teal-700 dark:text-slate-300"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Plain-Language Summary
                    </button>
                    {doc.source_url && !doc.source_url.startsWith('uploaded://') && (
                      <a
                        href={doc.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 dark:text-slate-400"
                      >
                        Official Source
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40 dark:border-slate-800"
                  >
                    Previous
                  </button>
                  <span className="font-mono tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40 dark:border-slate-800"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Document Summary Modal */}
      {summaryResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                  {summaryResult.source.verification_status === 'user_uploaded_unverified'
                    ? 'User-Uploaded Document (Not Officially Verified)'
                    : `Verified Official Source · ${summaryResult.source.authority_name || ''}`}
                </p>
                <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {summaryResult.source.title}
                </h3>
              </div>
              <button type="button" onClick={() => setSummaryResult(null)} className="rounded p-1.5 text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            {summaryResult.source.verification_status === 'user_uploaded_unverified' && (
              <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>{summaryResult.source.notice}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm text-slate-700 dark:text-slate-300">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Plain-Language Summary</h4>
                <p className="mt-1.5 leading-relaxed">{summaryResult.summary.plain_language_summary}</p>
              </div>

              {summaryResult.summary.main_sections?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Main Sections</h4>
                  <div className="mt-2 space-y-2.5">
                    {summaryResult.summary.main_sections.map((sec: any, i: number) => (
                      <div key={i} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <div className="flex justify-between text-xs font-semibold text-slate-900 dark:text-slate-100">
                          <span>{sec.heading}</span>
                          <span className="font-mono text-slate-500">{sec.page_reference}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{sec.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summaryResult.summary.important_obligations?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Important Obligations</h4>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs">
                    {summaryResult.summary.important_obligations.map((o: string, i: number) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>
              )}

              {summaryResult.summary.key_dates?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Key Dates &amp; Deadlines</h4>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs">
                    {summaryResult.summary.key_dates.map((d: string, i: number) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {summaryResult.summary.questions_for_professional?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Questions to Ask a Professional</h4>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs">
                    {summaryResult.summary.questions_for_professional.map((q: string, i: number) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
