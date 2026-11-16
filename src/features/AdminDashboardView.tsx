import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Globe,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { apiRequest } from '../lib/api';
import { listAllFeedbackDocs } from '../lib/firestoreRepo';
import { DocumentRecord, IngestionJob } from '../types/compliance';

interface AdminDashboardViewProps {
  onOpenDocument: (documentId: number) => void;
}

export function AdminDashboardView({ onOpenDocument }: AdminDashboardViewProps) {
  const { notify } = useToast();
  const [analytics, setAnalytics] = useState<any>(null);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [upTitle, setUpTitle] = useState('');
  const [upAuth, setUpAuth] = useState('SECP');
  const [upType, setUpType] = useState('Official Regulation');
  const [upUrl, setUpUrl] = useState('');
  const [upPubDate, setUpPubDate] = useState('');
  const [uploading, setUploading] = useState(false);

  const [ingestUrl, setIngestUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [urlAuth, setUrlAuth] = useState('FBR');
  const [ingestingUrl, setIngestingUrl] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [an, jb, dc, fb] = await Promise.all([
        apiRequest('/api/admin/analytics'),
        apiRequest<{ jobs: IngestionJob[] }>('/api/admin/ingestion-jobs'),
        apiRequest<{ documents: DocumentRecord[] }>('/api/documents?limit=50'),
        listAllFeedbackDocs().catch(() => []),
      ]);
      setAnalytics(an);
      setJobs(jb.jobs || []);
      setDocuments(dc.documents || []);
      setFeedbackList(fb || []);
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      notify('Please choose a file to upload.', 'error');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (upTitle) form.append('title', upTitle);
      form.append('authority_code', upAuth);
      form.append('document_type', upType);
      if (upUrl) form.append('source_url', upUrl);
      if (upPubDate) form.append('publication_date', upPubDate);

      const res = await apiRequest<any>('/api/admin/documents/upload', {
        method: 'POST',
        body: form,
      });
      notify(
        res.duplicate
          ? 'Document matched existing SHA-256 checksum (no duplicate created).'
          : `Ingested v${res.version} with ${res.chunksCreated} chunks${res.ocrUsed ? ' (Vision OCR used)' : ''}.`,
        'success'
      );
      setFile(null);
      setUpTitle('');
      setUpUrl('');
      setUpPubDate('');
      loadAll();
    } catch (err) {
      notify((err as Error).message, 'error');
      loadAll();
    } finally {
      setUploading(false);
    }
  };

  const handleUrlIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestUrl.trim()) return;
    setIngestingUrl(true);
    try {
      const res = await apiRequest<any>('/api/admin/documents/ingest-url', {
        method: 'POST',
        body: JSON.stringify({
          url: ingestUrl.trim(),
          title: urlTitle.trim() || undefined,
          authority_code: urlAuth,
        }),
      });
      notify(`Ingested official URL (${res.chunksCreated} chunks indexed).`, 'success');
      setIngestUrl('');
      setUrlTitle('');
      loadAll();
    } catch (err) {
      notify((err as Error).message, 'error');
      loadAll();
    } finally {
      setIngestingUrl(false);
    }
  };

  const handleRetryJob = async (jobId: number) => {
    try {
      await apiRequest(`/api/admin/ingestion-jobs/${jobId}/retry`, { method: 'POST' });
      notify('Ingestion job retried successfully.', 'success');
      loadAll();
    } catch (err) {
      notify((err as Error).message, 'error');
      loadAll();
    }
  };

  const handleStatusChange = async (docId: number, status: string) => {
    try {
      await apiRequest(`/api/admin/documents/${docId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          conflict_note: status === 'conflict_review' ? 'Flagged by admin for source conflict verification.' : '',
        }),
      });
      notify(`Document status updated to "${status}".`, 'success');
      loadAll();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const counts = analytics?.counts || {};
  const recentAudits = analytics?.recentAudits || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-teal-700 dark:text-teal-400">
            <ShieldCheck className="h-4 w-4" />
            RBAC Protected Administrator Console
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Official Ingestion &amp; Registry Governance
          </h1>
        </div>
        <button
          type="button"
          onClick={loadAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Real Database Counts */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Total Official Docs', value: counts.documents },
          { label: 'Published Docs', value: counts.published_documents },
          { label: 'Indexed Chunks', value: counts.chunks },
          { label: 'Vector Embeddings', value: counts.vector_embedded_chunks },
          { label: 'Failed Jobs', value: counts.failed_jobs },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-slate-500">{m.label}</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {loading ? '—' : m.value ?? 0}
            </p>
          </div>
        ))}
      </div>

      {/* Upload & URL Ingestion Forms */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={handleUpload} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Upload className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            Upload Official Document (PDF / DOCX / HTML / TXT / OCR)
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={upTitle}
              onChange={(e) => setUpTitle(e.target.value)}
              placeholder="Document Title"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 sm:col-span-2"
            />
            <select
              value={upAuth}
              onChange={(e) => setUpAuth(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="SECP">SECP</option>
              <option value="FBR">FBR</option>
              <option value="SRB">SRB</option>
              <option value="PAKISTAN_CODE">Pakistan Code</option>
              <option value="EOBI">EOBI</option>
            </select>
            <input
              value={upType}
              onChange={(e) => setUpType(e.target.value)}
              placeholder="Document Type"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              value={upUrl}
              onChange={(e) => setUpUrl(e.target.value)}
              placeholder="Official source URL (optional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="date"
              value={upPubDate}
              onChange={(e) => setUpPubDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md,.html,.htm,.csv,.png,.jpg,.jpeg"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium dark:text-slate-400 dark:file:bg-slate-800"
          />
          <button
            type="submit"
            disabled={uploading}
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {uploading ? 'Extracting & Indexing...' : 'Ingest & Index Document'}
          </button>
        </form>

        <form onSubmit={handleUrlIngest} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Globe className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            Ingest Allowlisted Official URL (SSRF Protected)
          </div>
          <p className="text-xs text-slate-500">
            Permitted domains: <span className="font-mono break-all">secp.gov.pk, fbr.gov.pk, srb.gos.pk, pakistancode.gov.pk, eobi.gov.pk</span>. Non-official domains and private IPs are blocked.
          </p>
          <input
            type="url"
            required
            value={ingestUrl}
            onChange={(e) => setIngestUrl(e.target.value)}
            placeholder="https://www.fbr.gov.pk/..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={urlTitle}
              onChange={(e) => setUrlTitle(e.target.value)}
              placeholder="Override Title (optional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <select
              value={urlAuth}
              onChange={(e) => setUrlAuth(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="FBR">FBR</option>
              <option value="SECP">SECP</option>
              <option value="SRB">SRB</option>
              <option value="PAKISTAN_CODE">Pakistan Code</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={ingestingUrl}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-teal-700"
          >
            {ingestingUrl ? 'Fetching & Indexing...' : 'Fetch & Index Official URL'}
          </button>
        </form>
      </div>

      {/* Document Governance Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Indexed Documents &amp; Version / Conflict Governance
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
              <tr>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Authority</th>
                <th className="px-4 py-2.5 font-medium">Ver</th>
                <th className="px-4 py-2.5 font-medium">Chunks</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Governance Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    <button type="button" onClick={() => onOpenDocument(doc.id)} className="text-left hover:text-teal-700 hover:underline">
                      {doc.title}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{doc.authority_code}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">v{doc.version}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">{doc.chunk_count}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-medium ${
                        doc.status === 'published'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : doc.status === 'superseded' || doc.status === 'outdated'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Change status for ${doc.title}`}
                      value={doc.status}
                      onChange={(e) => handleStatusChange(doc.id, e.target.value)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="published">Published (Active)</option>
                      <option value="draft">Unpublish (Draft)</option>
                      <option value="superseded">Mark Superseded</option>
                      <option value="outdated">Mark Outdated</option>
                      <option value="conflict_review">Flag Source Conflict</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ingestion Jobs & Firestore Feedback */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ingestion Jobs Queue</h2>
          </div>
          <div className="max-h-80 divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
            {jobs.map((job) => (
              <div key={job.id} className="px-5 py-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-slate-900 dark:text-slate-100">{job.source_input}</span>
                  <span
                    className={`font-semibold ${
                      job.status === 'completed'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : job.status === 'failed'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {job.source_type} · {job.chunks_created} chunks {Boolean(job.ocr_used) ? '· Vision OCR' : ''}
                </p>
                {job.error_message && (
                  <div className="mt-1.5 flex items-center justify-between gap-2 rounded bg-red-50 px-2.5 py-1.5 text-[11px] text-red-800 dark:bg-red-950/40 dark:text-red-300">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {job.error_message}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRetryJob(job.id)}
                      className="shrink-0 font-semibold underline"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">User Feedback &amp; Audit Trail</h2>
          </div>
          <div className="max-h-80 divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
            {feedbackList.length === 0 && recentAudits.length === 0 ? (
              <p className="p-5 text-xs text-slate-500">No user feedback or audit entries recorded yet.</p>
            ) : (
              <>
                {feedbackList.map((f) => (
                  <div key={f.id} className="px-5 py-3 text-xs">
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">Feedback: {f.rating}</span>
                      <span className="font-mono text-[11px] text-slate-400">{f.created_at?.slice(0, 10)}</span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-400">{f.comment || '(No comment provided)'}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">From: {f.user_email || f.userId}</p>
                  </div>
                ))}
                {recentAudits.slice(0, 10).map((a: any) => (
                  <div key={`audit-${a.id}`} className="px-5 py-3 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{a.action}</span>
                      <span className="font-mono text-[11px] text-slate-400">{a.created_at?.slice(0, 10)}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Actor: <span className="font-mono">{a.actor_uid || 'system'}</span> {a.details ? `· ${a.details}` : ''}
                    </p>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
