import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  FileText,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { apiRequest } from '../lib/api';
import {
  addChecklistItemDoc,
  createChecklistDocs,
  deleteChecklistItemDoc,
  listChecklistsDocs,
  updateChecklistItemDoc,
} from '../lib/firestoreRepo';
import { exportChecklistToPdf } from '../lib/pdfExport';
import {
  BusinessProfile,
  Checklist,
  ChecklistItem,
  ChecklistStatus,
  Language,
  User,
} from '../types/compliance';

interface ChecklistViewProps {
  user: User;
  profile: BusinessProfile | null;
  language: Language;
  onOpenDocument: (documentId: number, chunkId?: number, pageNumber?: number) => void;
  onNavigateProfile: () => void;
}

const STATUS_LABELS: Record<ChecklistStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  needs_review: 'Needs review',
};

export function ChecklistView({
  user,
  profile,
  language,
  onOpenDocument,
  onNavigateProfile,
}: ChecklistViewProps) {
  const { notify } = useToast();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [activeChecklistId, setActiveChecklistId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [focusTopic, setFocusTopic] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskAuth, setNewTaskAuth] = useState('Internal / Personal');
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  const loadChecklists = async (selectId?: string) => {
    setLoading(true);
    try {
      const list = await listChecklistsDocs(user.id);
      setChecklists(list);
      if (selectId) {
        setActiveChecklistId(selectId);
      } else if (!activeChecklistId && list.length > 0) {
        setActiveChecklistId(list[0].id);
      }
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChecklists();
  }, [user.id]);

  const activeChecklist = checklists.find((c) => c.id === activeChecklistId) || checklists[0] || null;

  const handleGenerateGrounded = async () => {
    if (!profile) {
      notify('Complete your Business Profile first so the checklist reflects your structure and province.', 'error');
      return;
    }
    setGenerating(true);
    try {
      const generated = await apiRequest<{
        title: string;
        items: Array<Omit<ChecklistItem, 'id' | 'checklist_id' | 'last_reviewed_at' | 'updated_at'>>;
      }>('/api/checklists/generate', {
        method: 'POST',
        body: JSON.stringify({
          business_profile: profile,
          focus_topic: focusTopic.trim() || undefined,
          language,
        }),
      });
      const created = await createChecklistDocs(user.id, generated.title, generated.items);
      notify('Generated compliance checklist grounded in official documents.', 'success');
      setFocusTopic('');
      await loadChecklists(created.id);
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateBlank = async () => {
    try {
      const created = await createChecklistDocs(user.id, 'Custom Compliance Checklist', []);
      await loadChecklists(created.id);
      notify('Created personal checklist.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const handleStatusChange = async (itemId: string, status: ChecklistStatus) => {
    if (!activeChecklist) return;
    try {
      await updateChecklistItemDoc(activeChecklist.id, itemId, { status });
      setChecklists((prev) =>
        prev.map((cl) =>
          cl.id === activeChecklist.id
            ? {
                ...cl,
                items: cl.items.map((it) => (it.id === itemId ? { ...it, status } : it)),
              }
            : cl
        )
      );
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const handleSaveNotes = async (itemId: string) => {
    if (!activeChecklist) return;
    try {
      await updateChecklistItemDoc(activeChecklist.id, itemId, { notes: notesDraft });
      setChecklists((prev) =>
        prev.map((cl) =>
          cl.id === activeChecklist.id
            ? {
                ...cl,
                items: cl.items.map((it) => (it.id === itemId ? { ...it, notes: notesDraft } : it)),
              }
            : cl
        )
      );
      setEditingNotesId(null);
      notify('Notes saved.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const handleAddPersonalTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChecklist || !newTaskTitle.trim()) return;
    try {
      const createdItem = await addChecklistItemDoc(user.id, activeChecklist.id, {
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim(),
        authority_name: newTaskAuth,
      });
      setChecklists((prev) =>
        prev.map((cl) =>
          cl.id === activeChecklist.id ? { ...cl, items: [...cl.items, createdItem] } : cl
        )
      );
      setNewTaskTitle('');
      setNewTaskDesc('');
      setShowAddTask(false);
      notify('Personal task added.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!activeChecklist) return;
    try {
      await deleteChecklistItemDoc(activeChecklist.id, itemId);
      setChecklists((prev) =>
        prev.map((cl) =>
          cl.id === activeChecklist.id
            ? { ...cl, items: cl.items.filter((i) => i.id !== itemId) }
            : cl
        )
      );
      notify('Task removed.', 'info');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const filteredItems = (activeChecklist?.items || []).filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.authority_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const grouped = filteredItems.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    const key = item.is_user_created ? 'Personal / User-Created Tasks' : item.authority_name || 'Official Authority';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const totalCount = activeChecklist?.items.length || 0;
  const completedCount = (activeChecklist?.items || []).filter((i) => i.status === 'completed').length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header & Generator Bar */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Compliance Checklists
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Track official filing obligations linked to SECP, FBR, and SRB citations alongside personal tasks.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <input
            value={focusTopic}
            onChange={(e) => setFocusTopic(e.target.value)}
            placeholder="Optional focus (e.g. Sales tax or Annual return)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:w-60"
          />
          <button
            type="button"
            onClick={handleGenerateGrounded}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {generating ? 'Generating...' : 'Generate from Profile'}
          </button>
          <button
            type="button"
            onClick={handleCreateBlank}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            Blank List
          </button>
        </div>
      </div>

      {!profile && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <span>Complete your Business Profile first to generate checklists tailored to your entity type and province.</span>
          <button type="button" onClick={onNavigateProfile} className="font-semibold underline whitespace-nowrap">
            Open Profile Wizard
          </button>
        </div>
      )}

      {/* Checklist Tabs */}
      {checklists.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
          {checklists.map((cl) => (
            <button
              key={cl.id}
              type="button"
              onClick={() => setActiveChecklistId(cl.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeChecklist?.id === cl.id
                  ? 'bg-slate-900 text-white dark:bg-teal-700'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {cl.title}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
      ) : !activeChecklist ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">No checklists created yet.</p>
          <p className="mt-1 text-xs text-slate-500">Generate one from your business profile or create a blank checklist.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Progress & Toolbar */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{activeChecklist.title}</h2>
                <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                  {completedCount} of {totalCount} completed ({pct}%)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddTask((s) => !s)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Personal Task
                </button>
                <button
                  type="button"
                  onClick={() => exportChecklistToPdf(activeChecklist, profile)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-teal-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export PDF
                </button>
              </div>
            </div>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full bg-teal-700 transition-all" style={{ width: `${pct}%` }} />
            </div>

            {/* Filters */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs dark:bg-slate-800">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'not_started', label: 'Not started' },
                  { id: 'in_progress', label: 'In progress' },
                  { id: 'completed', label: 'Completed' },
                  { id: 'needs_review', label: 'Needs review' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                      statusFilter === f.id
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter tasks..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          {showAddTask && (
            <form
              onSubmit={handleAddPersonalTask}
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Add Personal Task (User-Created)
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Task title (e.g. Open corporate bank account)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 sm:col-span-2"
                />
                <input
                  value={newTaskAuth}
                  onChange={(e) => setNewTaskAuth(e.target.value)}
                  placeholder="Category"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <textarea
                rows={2}
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                placeholder="Optional notes or internal deadline..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddTask(false)} className="px-3 py-1.5 text-xs text-slate-600">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-800">
                  Add Task
                </button>
              </div>
            </form>
          )}

          {/* Grouped Task List */}
          {Object.entries(grouped).map(([groupName, items]) => (
            <div key={groupName} className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  {groupName} ({items.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {items.map((item) => (
                  <div key={item.id} className="space-y-2.5 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            handleStatusChange(
                              item.id,
                              item.status === 'completed' ? 'not_started' : 'completed'
                            )
                          }
                          aria-label="Toggle task completion"
                          className="mt-0.5 shrink-0 text-teal-700 dark:text-teal-400"
                        >
                          {item.status === 'completed' ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          ) : item.status === 'in_progress' ? (
                            <Clock className="h-5 w-5 text-amber-600" />
                          ) : item.status === 'needs_review' ? (
                            <AlertCircle className="h-5 w-5 text-red-600" />
                          ) : (
                            <Circle className="h-5 w-5 text-slate-400" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            <span className="font-semibold text-teal-700 dark:text-teal-400">
                              {item.is_user_created ? 'User-Created Task' : `Official Grounded · ${item.authority_name}`}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{item.applicable_business_type}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">Reviewed {item.last_reviewed_at?.slice(0, 10)}</span>
                          </div>
                          <h4
                            className={`mt-1 text-sm font-semibold ${
                              item.status === 'completed'
                                ? 'line-through text-slate-400'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {item.title}
                          </h4>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <select
                          aria-label="Task status"
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value as ChecklistStatus)}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {Object.entries(STATUS_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          aria-label="Remove task"
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pl-8 text-xs">
                      {item.source_document_id ? (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenDocument(
                              item.source_document_id!,
                              item.source_chunk_id || undefined,
                              item.source_page_number || undefined
                            )
                          }
                          className="inline-flex items-center gap-1.5 text-left font-medium text-teal-700 hover:underline dark:text-teal-400"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span>{item.citation_label || item.source_document_title}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Personal reminder (no official citation attached)</span>
                      )}

                      {editingNotesId === item.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            placeholder="Add note..."
                            className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveNotes(item.id)}
                            className="font-medium text-teal-700 hover:underline"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNotesId(item.id);
                            setNotesDraft(item.notes || '');
                          }}
                          className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        >
                          {item.notes ? `Note: ${item.notes}` : '+ Add note'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
