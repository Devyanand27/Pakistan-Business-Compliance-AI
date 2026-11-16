import { useState } from 'react';
import { Download, FileText, GitCompare } from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { apiRequest } from '../lib/api';
import { exportComparisonToPdf } from '../lib/pdfExport';
import { Language } from '../types/compliance';

interface CompareViewProps {
  language: Language;
  onOpenDocument: (documentId: number, chunkId?: number, pageNumber?: number) => void;
}

const STRUCTURE_OPTIONS = [
  'Sole Proprietorship',
  'Partnership (AOP)',
  'Single Member Company (SMC)',
  'Private Limited Company',
  'Public Limited Company',
];

export function CompareView({ language, onOpenDocument }: CompareViewProps) {
  const { notify } = useToast();
  const [selected, setSelected] = useState<string[]>([
    'Sole Proprietorship',
    'Single Member Company (SMC)',
  ]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ comparison: any; sources: any[] } | null>(null);

  const toggleStructure = (name: string) => {
    setSelected((prev) => {
      if (prev.includes(name)) {
        return prev.length > 2 ? prev.filter((s) => s !== name) : prev;
      }
      if (prev.length >= 4) {
        notify('Select up to 4 structures for comparison.', 'info');
        return prev;
      }
      return [...prev, name];
    });
  };

  const handleCompare = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ comparison: any; sources: any[] }>('/api/compare', {
        method: 'POST',
        body: JSON.stringify({ structures: selected, language }),
      });
      setResult(res);
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const sourceMap = new Map((result?.sources || []).map((s) => [s.chunk_id, s]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Compare Business Structures
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Side-by-side regulatory comparison synthesized strictly from indexed SECP, FBR, and SRB documents.
          </p>
        </div>
        {result?.comparison && (
          <button
            type="button"
            onClick={() => exportComparisonToPdf(result.comparison)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-teal-700"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </button>
        )}
      </div>

      {/* Structure Selector */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Select 2 to 4 Pakistani Business Structures
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STRUCTURE_OPTIONS.map((name) => {
            const active = selected.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleStructure(name)}
                className={`rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                  active
                    ? 'border-teal-700 bg-teal-700 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={handleCompare}
            disabled={loading || selected.length < 2}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            <GitCompare className="h-4 w-4" />
            {loading ? 'Comparing Indexed Regulations...' : 'Run Grounded Comparison'}
          </button>
        </div>
      </div>

      {/* Comparison Matrix */}
      {result?.comparison && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50">
                  <th className="w-44 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Criterion
                  </th>
                  {result.comparison.structures.map((st: string) => (
                    <th key={st} className="px-4 py-3 text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {st}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {result.comparison.rows.map((row: any) => (
                  <tr key={row.criterion} className="align-top">
                    <td className="px-4 py-3.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {row.criterion}
                    </td>
                    {result.comparison.structures.map((st: string) => {
                      const cell = row.values.find((v: any) => v.structure === st);
                      return (
                        <td key={st} className="px-4 py-3.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                          <p>{cell?.statement || 'Not verified from available official sources.'}</p>
                          {cell?.chunk_ids?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {cell.chunk_ids.map((cid: number) => {
                                const src = sourceMap.get(cid);
                                if (!src) return null;
                                return (
                                  <button
                                    key={cid}
                                    type="button"
                                    onClick={() => onOpenDocument(src.document_id, src.chunk_id, src.page_number)}
                                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700 hover:border-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-teal-400"
                                  >
                                    <FileText className="h-3 w-3" />
                                    p.{src.page_number}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.comparison.important_limitations?.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Important Limitations
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
                {result.comparison.important_limitations.map((lim: string, idx: number) => (
                  <li key={idx}>{lim}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
