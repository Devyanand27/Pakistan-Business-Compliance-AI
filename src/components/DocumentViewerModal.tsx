import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  ExternalLink,
  FileText,
  History,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { auth } from '../lib/firebase';
import { createSavedItemDoc } from '../lib/firestoreRepo';
import { t } from '../lib/i18n';
import { DocumentChunk, DocumentRecord, Language } from '../types/compliance';
import { useToast } from './ToastProvider';

interface DocumentViewerModalProps {
  documentId: number | null;
  highlightChunkId?: number | null;
  highlightPage?: number | null;
  language: Language;
  isAuthenticated: boolean;
  onClose: () => void;
}

export function DocumentViewerModal({
  documentId,
  highlightChunkId,
  highlightPage,
  language,
  isAuthenticated,
  onClose,
}: DocumentViewerModalProps) {
  const { notify } = useToast();
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!documentId) return;
    let active = true;
    setLoading(true);
    setError('');
    setShowVersions(false);

    Promise.all([
      apiRequest<{ document: DocumentRecord; chunks: DocumentChunk[] }>(`/api/documents/${documentId}`),
      apiRequest<{ versions: any[] }>(`/api/documents/${documentId}/versions`),
    ])
      .then(([docRes, verRes]) => {
        if (!active) return;
        setDoc(docRes.document);
        setChunks(docRes.chunks);
        setVersions(verRes.versions || []);
      })
      .catch((err) => {
        if (!active) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [documentId]);

  useEffect(() => {
    if (!loading && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [loading, highlightChunkId, highlightPage]);

  if (!documentId) return null;

  const handleSaveDocument = async () => {
    if (!doc || !isAuthenticated || !auth.currentUser) return;
    setSaving(true);
    try {
      await createSavedItemDoc(auth.currentUser.uid, {
        item_type: 'document',
        item_reference_id: doc.id,
        folder_name:
          doc.authority_code === 'SECP'
            ? 'Company Registration'
            : doc.authority_code === 'FBR'
            ? 'FBR and Tax'
            : doc.authority_code === 'SRB'
            ? 'Sindh Compliance'
            : 'General Research',
        title: doc.title,
        excerpt: `${doc.authority_name || ''} · ${doc.document_type} · Version ${doc.version}`,
      });
      notify('Document saved to your Research Workspace.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Official Document Viewer"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-teal-700 dark:text-teal-400">
                {doc?.authority_name || 'Official Authority'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{doc?.document_type || 'Regulation'}</span>
              {doc?.document_number && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{doc.document_number}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">v{doc?.version || '1.0'}</span>
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {doc?.title || 'Loading official document...'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close document viewer"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status / Warning Bar */}
        {doc && (Boolean(doc.is_superseded) || doc.status === 'conflict_review') && (
          <div className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              {Boolean(doc.is_superseded) && (
                <p className="font-medium">
                  {t(language, 'supersededWarning')}: This document has been superseded or marked outdated. Verify active regulations before filing.
                </p>
              )}
              {doc.status === 'conflict_review' && (
                <p className="font-medium">
                  Conflict Review Flagged: {doc.conflict_note || 'Pending human review against another official source.'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Metadata Bar */}
        {doc && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                Publication: <strong className="font-medium text-slate-800 dark:text-slate-200">{doc.publication_date || t(language, 'dateNotStated')}</strong>
              </span>
              <span>
                Effective: <strong className="font-medium text-slate-800 dark:text-slate-200">{doc.effective_date || t(language, 'dateNotStated')}</strong>
              </span>
              <span>
                Retrieved: <strong className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{doc.retrieval_date?.slice(0, 10)}</strong>
              </span>
              <span>
                Pages: <strong className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{doc.page_count}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {versions.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowVersions((s) => !s)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <History className="h-3.5 w-3.5" />
                  Versions ({versions.length})
                </button>
              )}
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={handleSaveDocument}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              )}
              {doc.source_url && !doc.source_url.startsWith('uploaded://') && (
                <a
                  href={doc.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3 py-1 text-xs font-medium text-white hover:bg-teal-800"
                >
                  Open Official Source
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Version History Panel */}
        {showVersions && (
          <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-3 dark:border-slate-800 dark:bg-slate-950/60">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Document Version Lineage</h4>
            <div className="mt-2 space-y-1.5">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400"
                >
                  <span>
                    <strong className="text-slate-900 dark:text-slate-100">v{v.version}</strong> — {v.title}
                  </span>
                  <span className="tabular-nums">
                    {v.status} · Retrieved {v.retrieval_date?.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {loading && (
            <div className="space-y-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-24 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
              <div className="h-24 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          {!loading && !error && chunks.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500">
              <FileText className="mx-auto mb-2 h-8 w-8 text-slate-400" />
              No extracted text sections stored for this document.
            </div>
          )}

          {!loading &&
            chunks.map((chunk) => {
              const isHighlighted =
                (highlightChunkId && chunk.id === highlightChunkId) ||
                (!highlightChunkId && highlightPage && chunk.page_number === highlightPage);

              return (
                <div
                  key={chunk.id}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={`rounded-lg border p-4 transition-colors ${
                    isHighlighted
                      ? 'border-teal-500 bg-teal-50/70 dark:border-teal-500/70 dark:bg-teal-950/30'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {chunk.section_title}
                    </span>
                    <span className="font-mono tabular-nums">
                      Page {chunk.page_number} · Chunk #{chunk.id}
                    </span>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    {chunk.chunk_text}
                  </p>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
