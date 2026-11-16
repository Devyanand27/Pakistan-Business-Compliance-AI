import { useEffect, useState } from 'react';
import { Bookmark, Folder, Search, Trash2 } from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import {
  deleteSavedItemDoc,
  listSavedItemsDocs,
  updateSavedItemDoc,
} from '../lib/firestoreRepo';
import { SavedItem, User } from '../types/compliance';

interface SavedResearchViewProps {
  user: User;
  onOpenDocument: (documentId: number) => void;
  onOpenConversation: (conversationId: string) => void;
}

const FOLDERS = [
  'All',
  'Company Registration',
  'FBR and Tax',
  'Sindh Compliance',
  'Startup Documentation',
  'Annual Filing',
  'General Research',
];

export function SavedResearchView({
  user,
  onOpenDocument,
  onOpenConversation,
}: SavedResearchViewProps) {
  const { notify } = useToast();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [folder, setFolder] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [folderDraft, setFolderDraft] = useState('General Research');

  const loadSaved = async () => {
    setLoading(true);
    try {
      const list = await listSavedItemsDocs(user.id, folder, search);
      setItems(list);
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadSaved, 180);
    return () => clearTimeout(timer);
  }, [user.id, folder, search]);

  const handleSaveEdit = async (id: string) => {
    try {
      await updateSavedItemDoc(id, { folder_name: folderDraft, notes: noteDraft });
      setEditingId(null);
      loadSaved();
      notify('Research note updated.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedItemDoc(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      notify('Removed from Saved Research.', 'info');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Saved Research Workspace
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Organize bookmarked answers, official documents, and personal compliance notes into project folders.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:col-span-3">
          <h2 className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Project Folders</h2>
          <div className="mt-2.5 space-y-1">
            {FOLDERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFolder(f)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  folder === f
                    ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <Folder className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{f}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0 space-y-4 lg:col-span-9">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search saved research, excerpts, or notes..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {loading ? (
            <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
              <Bookmark className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">No saved research in this folder</p>
              <p className="mt-1 text-xs text-slate-500">
                Save answers from the AI Assistant or bookmark documents from the Official Library.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">
                        <span className="font-semibold text-teal-700 dark:text-teal-400">{item.folder_name}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className="capitalize">{item.item_type}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{item.created_at.slice(0, 10)}</span>
                      </p>
                      <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {item.item_type === 'document' && Number.isFinite(Number(item.item_reference_id)) && (
                        <button
                          type="button"
                          onClick={() => onOpenDocument(Number(item.item_reference_id))}
                          className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                        >
                          Open Document
                        </button>
                      )}
                      {item.item_type === 'conversation' && item.item_reference_id && (
                        <button
                          type="button"
                          onClick={() => onOpenConversation(item.item_reference_id)}
                          className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                        >
                          Open Conversation
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setNoteDraft(item.notes || '');
                          setFolderDraft(item.folder_name || 'General Research');
                        }}
                        className="text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400"
                      >
                        Organize / Note
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        aria-label="Delete saved item"
                        className="rounded p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {item.excerpt && (
                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {item.excerpt}
                    </p>
                  )}

                  {item.notes && editingId !== item.id && (
                    <p className="mt-2.5 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                      <strong>Note:</strong> {item.notes}
                    </p>
                  )}

                  {editingId === item.id && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <select
                        value={folderDraft}
                        onChange={(e) => setFolderDraft(e.target.value)}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        {FOLDERS.filter((f) => f !== 'All').map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                      <textarea
                        rows={2}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Add your personal research notes..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditingId(null)} className="text-xs text-slate-500">
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(item.id)}
                          className="rounded-md bg-teal-700 px-3 py-1 text-xs font-medium text-white"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
