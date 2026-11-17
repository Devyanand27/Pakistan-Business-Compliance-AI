import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Lock,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { apiFetchBlob, apiRequest } from '../lib/api';
import { t } from '../lib/i18n';
import { Authority, DocumentRecord, Language, UserFileRecord } from '../types/compliance';

interface DocumentLibraryViewProps {
  language: Language;
  onOpenDocument: (documentId: number, chunkId?: number, pageNumber?: number) => void;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DocumentLibraryView({ language, onOpenDocument }: DocumentLibraryViewProps) {
  const { notify } = useToast();
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [passageResults, setPassageResults] = useState<any[]>([]);
  const [userFiles, setUserFiles] = useState<UserFileRecord[]>([]);
  const [loadingUserFiles, setLoadingUserFiles] = useState(true);
  const [searchMode, setSearchMode] = useState<'library' | 'passages' | 'uploads'>('library');
  const [query, setQuery] = useState('');
  const [authorityFilter, setAuthorityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Summarizer & private upload state
  const [summarizing, setSummarizing] = useState(false);
  const [summarizingFileId, setSummarizingFileId] = useState<string | null>(null);
  const [uploadingPrivateFile, setUploadingPrivateFile] = useState(false);
  const [autoSummarizeOnUpload, setAutoSummarizeOnUpload] = useState(true);
  const [summaryResult, setSummaryResult] = useState<{
    source: any;
    summary: any;
    userFileId?: string;
  } | null>(null);
  const [uploadSummaryFile, setUploadSummaryFile] = useState<File | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  // Private file viewer modal state
  const [previewFile, setPreviewFile] = useState<UserFileRecord | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadUserFiles = async () => {
    setLoadingUserFiles(true);
    try {
      const res = await apiRequest<{ files: UserFileRecord[] }>('/api/user-files');
      setUserFiles(res.files || []);
    } catch {
      setUserFiles([]);
    } finally {
      setLoadingUserFiles(false);
    }
  };

  useEffect(() => {
    apiRequest<{ authorities: Authority[] }>('/api/documents/authorities')
      .then((res) => setAuthorities(res.authorities || []))
      .catch(() => {});
    loadUserFiles();
  }, []);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

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
    if (searchMode === 'uploads') return;
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

  const handleUploadPrivateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadSummaryFile) return;
    setUploadingPrivateFile(true);
    try {
      const form = new FormData();
      form.append('file', uploadSummaryFile);
      form.append('language', language);
      form.append('auto_summarize', autoSummarizeOnUpload ? 'true' : 'false');

      const res = await apiRequest<{
        file: UserFileRecord;
        extraction_warning?: string;
        summary_warning?: string;
      }>('/api/user-files', {
        method: 'POST',
        body: form,
      });

      setUserFiles((prev) => [res.file, ...prev.filter((f) => f.id !== res.file.id)]);
      setUploadSummaryFile(null);
      setSearchMode('uploads');

      if (res.summary_warning) {
        notify(res.summary_warning, 'info');
      } else if (res.extraction_warning) {
        notify(`Saved privately. Note: ${res.extraction_warning}`, 'info');
      } else {
        notify('File saved permanently to your private vault.', 'success');
      }

      if (res.file.summary_json) {
        setSummaryResult({
          userFileId: res.file.id,
          source: {
            title: res.file.original_filename,
            verification_status: 'user_uploaded_unverified',
            notice:
              'This document was uploaded to your private vault and has NOT been verified as an official government regulation.',
            page_count: res.file.page_count,
            ocr_used: res.file.ocr_used,
          },
          summary: res.file.summary_json,
        });
      }
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setUploadingPrivateFile(false);
    }
  };

  const handleOpenPrivateFileSummary = async (file: UserFileRecord, forceRegenerate = false) => {
    if (file.summary_json && !forceRegenerate) {
      setSummaryResult({
        userFileId: file.id,
        source: {
          title: file.original_filename,
          verification_status: 'user_uploaded_unverified',
          notice:
            'This document was uploaded to your private vault and has NOT been verified as an official government regulation.',
          page_count: file.page_count,
          ocr_used: file.ocr_used,
        },
        summary: file.summary_json,
      });
      return;
    }

    setSummarizingFileId(file.id);
    try {
      const res = await apiRequest<{ file: UserFileRecord; summary: any }>(
        `/api/user-files/${encodeURIComponent(file.id)}/summarize`,
        {
          method: 'POST',
          body: JSON.stringify({ language, force: forceRegenerate }),
        }
      );
      setUserFiles((prev) => prev.map((item) => (item.id === res.file.id ? res.file : item)));
      setSummaryResult({
        userFileId: res.file.id,
        source: {
          title: res.file.original_filename,
          verification_status: 'user_uploaded_unverified',
          notice:
            'This document was uploaded to your private vault and has NOT been verified as an official government regulation.',
          page_count: res.file.page_count,
          ocr_used: res.file.ocr_used,
        },
        summary: res.summary,
      });
      notify('AI summary saved permanently.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSummarizingFileId(null);
    }
  };

  const handleDownloadPrivateFile = async (file: UserFileRecord) => {
    setDownloadingFileId(file.id);
    try {
      const { blob } = await apiFetchBlob(`/api/user-files/${encodeURIComponent(file.id)}/download`);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = file.original_filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleViewPrivateFile = async (file: UserFileRecord) => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setPreviewFile(file);
    setPreviewLoading(true);
    try {
      const detail = await apiRequest<{ file: UserFileRecord }>(
        `/api/user-files/${encodeURIComponent(file.id)}`
      );
      setPreviewFile(detail.file);

      if (
        detail.file.mime_type.startsWith('image/') ||
        detail.file.mime_type === 'application/pdf'
      ) {
        const { blob } = await apiFetchBlob(
          `/api/user-files/${encodeURIComponent(file.id)}/download?inline=1`
        );
        const url = URL.createObjectURL(blob);
        setPreviewBlobUrl(url);
      }
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDeletePrivateFile = async (fileId: string) => {
    setDeletingFileId(fileId);
    try {
      await apiRequest(`/api/user-files/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
      });
      setUserFiles((prev) => prev.filter((f) => f.id !== fileId));
      setConfirmDeleteId(null);
      if (previewFile?.id === fileId) {
        setPreviewFile(null);
        if (previewBlobUrl) {
          URL.revokeObjectURL(previewBlobUrl);
          setPreviewBlobUrl(null);
        }
      }
      if (summaryResult?.userFileId === fileId) {
        setSummaryResult(null);
      }
      notify('File permanently deleted from private storage.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setDeletingFileId(null);
    }
  };

  const filteredUserFiles = userFiles.filter((f) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      f.original_filename.toLowerCase().includes(q) ||
      f.extension.toLowerCase().includes(q) ||
      (f.extracted_text_preview || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Official Document Library &amp; Private Vault
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Browse verified SECP, FBR, and SRB documents, or store and summarize your own private files permanently.
          </p>
        </div>

        <form onSubmit={handleUploadPrivateFile} className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <Upload className="h-3.5 w-3.5" />
            <span className="max-w-[220px] truncate">
              {uploadSummaryFile ? uploadSummaryFile.name : 'Upload File (PDF, DOCX, TXT, Image)'}
            </span>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,.html,.htm,.csv,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => setUploadSummaryFile(e.target.files?.[0] || null)}
            />
          </label>
          {uploadSummaryFile && (
            <>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={autoSummarizeOnUpload}
                  onChange={(e) => setAutoSummarizeOnUpload(e.target.checked)}
                  className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                <span>Save AI summary</span>
              </label>
              <button
                type="submit"
                disabled={uploadingPrivateFile}
                className="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {uploadingPrivateFile ? 'Saving...' : 'Save to Private Vault'}
              </button>
            </>
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
                : searchMode === 'passages'
                ? 'Search exact statutory passages (e.g. Form 9 deadline, SMC nominee)...'
                : 'Filter your private uploaded files by filename or extracted text...'
            }
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap rounded-lg bg-slate-100 p-1 text-xs font-medium dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSearchMode('library')}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              searchMode === 'library' ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Official Documents
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
          <button
            type="button"
            onClick={() => setSearchMode('uploads')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
              searchMode === 'uploads' ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Lock className="h-3 w-3" />
            <span>My Private Uploads</span>
            <span className="font-mono text-[11px] opacity-75">({userFiles.length})</span>
          </button>
        </div>
      </div>

      {searchMode === 'uploads' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-xs text-teal-900 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-200">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
              <span>
                Files uploaded here are stored permanently in your private account storage and isolated strictly to your Firebase login.
              </span>
            </div>
            <button
              type="button"
              onClick={loadUserFiles}
              className="inline-flex items-center gap-1 font-medium text-teal-800 hover:underline dark:text-teal-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          {loadingUserFiles ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
              ))}
            </div>
          ) : filteredUserFiles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <FileText className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                {query.trim() ? 'No uploaded files match your filter.' : 'No private files uploaded yet.'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Use the upload control above to save PDF, DOCX, TXT, or image documents privately to your account.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUserFiles.map((file) => (
                <div key={file.id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold uppercase text-teal-700 dark:text-teal-400">
                        {file.extension.replace('.', '') || 'FILE'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatFileSize(file.size_bytes)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{file.page_count} page{file.page_count === 1 ? '' : 's'}</span>
                      {file.ocr_used && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-700 dark:text-amber-400">Vision OCR</span>
                        </>
                      )}
                    </div>
                    <span
                      className={`font-medium ${
                        file.has_summary
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {file.has_summary ? `AI Summary Saved (${(file.summary_language || 'en').toUpperCase()})` : 'Not summarized yet'}
                    </span>
                  </div>

                  <h3 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {file.original_filename}
                  </h3>

                  {file.extracted_text_preview && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {file.extracted_text_preview}
                    </p>
                  )}

                  <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    Uploaded {new Date(file.created_at).toLocaleString()}
                    {file.summarized_at ? ` · Summarized ${new Date(file.summarized_at).toLocaleString()}` : ''}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={() => handleViewPrivateFile(file)}
                        className="inline-flex items-center gap-1.5 font-medium text-teal-700 hover:underline dark:text-teal-400"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View File
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenPrivateFileSummary(file, false)}
                        disabled={summarizingFileId === file.id}
                        className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-teal-700 disabled:opacity-50 dark:text-slate-300"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {summarizingFileId === file.id
                          ? 'Summarizing...'
                          : file.has_summary
                          ? 'View Saved Summary'
                          : 'Generate & Save Summary'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadPrivateFile(file)}
                        disabled={downloadingFileId === file.id}
                        className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-teal-700 disabled:opacity-50 dark:text-slate-300"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {downloadingFileId === file.id ? 'Downloading...' : 'Download'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {confirmDeleteId === file.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDeletePrivateFile(file.id)}
                            disabled={deletingFileId === file.id}
                            className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {deletingFileId === file.id ? 'Deleting...' : 'Confirm Delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(file.id)}
                          className="inline-flex items-center gap-1 font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
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
      )}

      {/* Private File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                  Private Vault File · {previewFile.extension.replace('.', '').toUpperCase()} · {formatFileSize(previewFile.size_bytes)}
                </p>
                <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {previewFile.original_filename}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPrivateFile(previewFile)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewFile(null);
                    if (previewBlobUrl) {
                      URL.revokeObjectURL(previewBlobUrl);
                      setPreviewBlobUrl(null);
                    }
                  }}
                  className="rounded p-1.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {previewLoading ? (
                <div className="h-64 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              ) : (
                <>
                  {previewBlobUrl && previewFile.mime_type.startsWith('image/') && (
                    <div className="flex justify-center rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                      <img
                        src={previewBlobUrl}
                        alt={previewFile.original_filename}
                        className="max-h-[420px] rounded object-contain"
                      />
                    </div>
                  )}

                  {previewBlobUrl && previewFile.mime_type === 'application/pdf' && (
                    <iframe
                      title={previewFile.original_filename}
                      src={previewBlobUrl}
                      className="h-[420px] w-full rounded-lg border border-slate-200 dark:border-slate-800"
                    />
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Extracted Document Text
                      </h4>
                      <button
                        type="button"
                        onClick={() => handleOpenPrivateFileSummary(previewFile, false)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {previewFile.has_summary ? 'Open Saved AI Summary' : 'Generate & Save AI Summary'}
                      </button>
                    </div>
                    <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 font-sans text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      {previewFile.extracted_text || previewFile.extracted_text_preview || 'No text layer extracted for this file.'}
                    </pre>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
              <div className="flex items-center gap-2">
                {summaryResult.userFileId && (
                  <button
                    type="button"
                    disabled={summarizingFileId === summaryResult.userFileId}
                    onClick={() => {
                      const target = userFiles.find((f) => f.id === summaryResult.userFileId);
                      if (target) handleOpenPrivateFileSummary(target, true);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Regenerate ({language.toUpperCase()})
                  </button>
                )}
                <button type="button" onClick={() => setSummaryResult(null)} className="rounded p-1.5 text-slate-400 hover:text-slate-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
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
