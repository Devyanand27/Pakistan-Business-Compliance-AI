import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  FileText,
  ListChecks,
  MessageSquare,
  Plus,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  getBusinessProfileDoc,
  listChecklistsDocs,
  listConversationsDocs,
  listSavedItemsDocs,
} from '../lib/firestoreRepo';
import {
  BusinessProfile,
  Conversation,
  DocumentRecord,
  Language,
  SavedItem,
  User,
} from '../types/compliance';

interface OverviewViewProps {
  user: User;
  profile: BusinessProfile | null;
  language: Language;
  onNavigate: (tab: string) => void;
  onAskPrompt: (prompt: string) => void;
  onOpenConversation: (conversationId: string) => void;
  onOpenDocument: (documentId: number) => void;
}

const RECOMMENDED_TOPICS = [
  'What do I need to register a Single Member Company in Pakistan?',
  'What are Form A, Form 24, and Form 9 deadlines under Companies Regulations 2024?',
  'How do I register for an FBR NTN via IRIS Form 181 as a freelancer or sole proprietor?',
  'When must a Sindh service business register with SRB and file Form SST-03?',
];

export function OverviewView({
  user,
  profile: initialProfile,
  onNavigate,
  onAskPrompt,
  onOpenConversation,
  onOpenDocument,
}: OverviewViewProps) {
  const [profile, setProfile] = useState<BusinessProfile | null>(initialProfile);
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<DocumentRecord[]>([]);
  const [stats, setStats] = useState({
    totalConversations: 0,
    checklistCompleted: 0,
    checklistTotal: 0,
    totalSaved: 0,
    indexedDocsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([
      listConversationsDocs(user.id),
      listChecklistsDocs(user.id),
      listSavedItemsDocs(user.id),
      getBusinessProfileDoc(user.id),
      apiRequest<{ documents: DocumentRecord[]; pagination: { total: number } }>('/api/documents?limit=5'),
    ])
      .then(([convs, checklists, saved, bp, docsRes]) => {
        if (!active) return;
        const allItems = checklists.flatMap((cl) => cl.items || []);
        const completed = allItems.filter((it) => it.status === 'completed').length;
        setProfile(bp);
        setRecentConversations(convs.slice(0, 5));
        setSavedItems(saved.slice(0, 5));
        setRecentDocuments(docsRes.documents || []);
        setStats({
          totalConversations: convs.length,
          checklistCompleted: completed,
          checklistTotal: allItems.length,
          totalSaved: saved.length,
          indexedDocsCount: docsRes.pagination?.total ?? (docsRes.documents?.length || 0),
        });
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
  }, [user.id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        {error}
      </div>
    );
  }

  const pct =
    stats.checklistTotal > 0
      ? Math.round((stats.checklistCompleted / stats.checklistTotal) * 100)
      : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Welcome, {user.full_name}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Your Pakistani regulatory research workspace backed by indexed SECP, FBR, and SRB publications.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('assistant')}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            New Compliance Query
          </button>
          <button
            type="button"
            onClick={() => onNavigate('checklist')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <ListChecks className="h-4 w-4" />
            View Checklists
          </button>
        </div>
      </div>

      {/* Real Database KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Research Conversations</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.totalConversations}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Checklist Completion</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.checklistCompleted} / {stats.checklistTotal}
            <span className="ml-2 text-xs font-normal text-slate-500">({pct}%)</span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Saved Research Items</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.totalSaved}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Published Official Sources</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.indexedDocsCount}
          </p>
        </div>
      </div>

      {/* Business Profile Summary + Recommended Prompts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Building2 className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              My Business Profile
            </div>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
            >
              {profile ? 'Edit Profile' : 'Setup Wizard'}
            </button>
          </div>

          {profile ? (
            <div className="mt-4 space-y-2.5 text-sm">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {profile.business_name || profile.business_type}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {profile.business_type} · {profile.city}, {profile.province}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Industry: {profile.industry}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Scope: {profile.provides_services ? 'Services' : ''}{profile.provides_services && profile.sells_goods ? ' & ' : ''}{profile.sells_goods ? 'Goods' : ''} · {profile.has_employees ? 'Has Employees' : 'No Employees'}
              </p>
              <p className="pt-2 text-xs text-slate-500 dark:text-slate-400">
                Used to personalize retrieval context. Does not constitute complete legal assessment.
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Complete the 3-step Business Profile Wizard so the AI Assistant and Checklist Generator tailor guidance to your structure and province.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-teal-700"
              >
                Launch Business Profile Wizard
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Recommended Research Topics
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Select a topic to run a grounded retrieval query against official SECP, FBR, and SRB documents.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {RECOMMENDED_TOPICS.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => onAskPrompt(topic)}
                className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-3 text-left text-xs font-medium text-slate-700 transition-colors hover:border-teal-600 hover:bg-teal-50/40 dark:border-slate-800 dark:text-slate-300 dark:hover:border-teal-500 dark:hover:bg-teal-950/20"
              >
                <span className="leading-relaxed">{topic}</span>
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity & Official Library Updates */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Conversations */}
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <MessageSquare className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              Recent Conversations
            </h3>
            <button type="button" onClick={() => onNavigate('assistant')} className="text-xs text-teal-700 hover:underline dark:text-teal-400">
              Open
            </button>
          </div>
          <div className="mt-4 space-y-2.5">
            {recentConversations.length === 0 ? (
              <p className="text-xs text-slate-500">No conversations yet. Ask your first compliance question.</p>
            ) : (
              recentConversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpenConversation(c.id)}
                  className="block w-full rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                >
                  <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">{c.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                    {c.message_count ?? 0} messages · {c.updated_at?.slice(0, 10)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Recently Saved Items */}
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <BookOpen className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              Saved Research
            </h3>
            <button type="button" onClick={() => onNavigate('saved')} className="text-xs text-teal-700 hover:underline dark:text-teal-400">
              View All
            </button>
          </div>
          <div className="mt-4 space-y-2.5">
            {savedItems.length === 0 ? (
              <p className="text-xs text-slate-500">Bookmark answers, citations, or official documents to organize research here.</p>
            ) : (
              savedItems.map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                  <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">{s.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {s.folder_name} · {s.item_type}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Indexed Official Documents */}
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <FileText className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              Official Library Updates
            </h3>
            <button type="button" onClick={() => onNavigate('library')} className="text-xs text-teal-700 hover:underline dark:text-teal-400">
              Browse
            </button>
          </div>
          <div className="mt-4 space-y-2.5">
            {recentDocuments.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => onOpenDocument(doc.id)}
                className="block w-full rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
              >
                <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">{doc.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {doc.authority_code} · v{doc.version} · {doc.status}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
