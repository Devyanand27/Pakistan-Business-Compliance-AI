import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Check,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastProvider';
import { apiRequest } from '../lib/api';
import {
  createSavedItemDoc,
  deleteConversationDoc,
  getConversationMessagesDocs,
  listConversationsDocs,
  saveChatExchangeDocs,
  submitFeedbackDoc,
  updateConversationDoc,
} from '../lib/firestoreRepo';
import { t } from '../lib/i18n';
import { exportConversationToPdf } from '../lib/pdfExport';
import {
  BusinessProfile,
  ChatMessage,
  Citation,
  Conversation,
  Language,
  User,
} from '../types/compliance';

interface AssistantViewProps {
  user: User;
  profile: BusinessProfile | null;
  language: Language;
  initialPrompt?: string | null;
  initialConversationId?: string | null;
  onPromptConsumed: () => void;
  onOpenDocument: (documentId: number, chunkId?: number, pageNumber?: number) => void;
}

const EXAMPLE_PROMPTS = [
  'What do I need to register a single-member company in Pakistan?',
  'Has Form 29 been replaced under Companies Regulations 2024?',
  'How do freelancers and sole proprietors register for NTN on FBR IRIS?',
  'When is SRB e-Registration and Form SST-03 required in Sindh?',
];

export function AssistantView({
  user,
  profile,
  language,
  initialPrompt,
  initialConversationId,
  onPromptConsumed,
  onOpenDocument,
}: AssistantViewProps) {
  const { notify } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchConv, setSearchConv] = useState('');
  const [onlySaved, setOnlySaved] = useState(false);

  const [question, setQuestion] = useState('');
  const [authorityFilter, setAuthorityFilter] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [chatError, setChatError] = useState('');
  const [showSourcesDrawer, setShowSourcesDrawer] = useState(true);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = async () => {
    try {
      const list = await listConversationsDocs(user.id, searchConv, onlySaved);
      setConversations(list);
      return list;
    } catch (err) {
      notify((err as Error).message, 'error');
      return [];
    }
  };

  const loadConversationMessages = async (convId: string) => {
    setLoadingConv(true);
    setChatError('');
    try {
      const res = await getConversationMessagesDocs(user.id, convId);
      setActiveConvId(convId);
      setMessages(res.messages || []);
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setLoadingConv(false);
    }
  };

  useEffect(() => {
    loadConversations().then((list) => {
      if (initialConversationId) {
        loadConversationMessages(initialConversationId);
        onPromptConsumed();
      } else if (!activeConvId && list.length > 0 && !initialPrompt) {
        loadConversationMessages(list[0].id);
      }
    });
  }, [user.id, onlySaved]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadConversations();
    }, 200);
    return () => clearTimeout(timer);
  }, [searchConv]);

  useEffect(() => {
    if (initialPrompt) {
      setQuestion(initialPrompt);
      setActiveConvId(null);
      setMessages([]);
      onPromptConsumed();
    }
  }, [initialPrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async (overrideQuestion?: string) => {
    const text = (overrideQuestion ?? question).trim();
    if (!text || sending) return;

    setSending(true);
    setChatError('');
    if (!overrideQuestion) setQuestion('');

    const historySnapshot = messages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 800),
    }));

    const tempId = `temp-${Date.now()}`;
    const tempUserMsg: ChatMessage = {
      id: tempId,
      conversation_id: activeConvId || '',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await apiRequest<{
        assistant_message: Omit<ChatMessage, 'id' | 'conversation_id' | 'created_at'>;
      }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          question: text,
          authority_code: authorityFilter || undefined,
          language,
          business_profile: profile,
          conversation_history: historySnapshot,
        }),
      });

      const saved = await saveChatExchangeDocs({
        uid: user.id,
        conversationId: activeConvId,
        userQuestion: text,
        assistantMessage: res.assistant_message,
      });

      const finalUserMsg: ChatMessage = {
        ...tempUserMsg,
        id: saved.userMessageId,
        conversation_id: saved.conversationId,
      };
      const finalAssistantMsg: ChatMessage = {
        ...res.assistant_message,
        id: saved.assistantMessageId,
        conversation_id: saved.conversationId,
        created_at: new Date().toISOString(),
      };

      setActiveConvId(saved.conversationId);
      setMessages((prev) => [...prev.slice(0, -1), finalUserMsg, finalAssistantMsg]);
      await loadConversations();
    } catch (err) {
      setMessages((prev) => prev.slice(0, -1));
      if (!overrideQuestion) setQuestion(text);
      setChatError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setChatError('');
  };

  const handleRenameSubmit = async (convId: string) => {
    if (!renameText.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await updateConversationDoc(convId, { title: renameText.trim() });
      setRenamingId(null);
      loadConversations();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const handleToggleSaveConv = async (conv: Conversation) => {
    try {
      const nextSaved = !Boolean(conv.is_saved);
      await updateConversationDoc(conv.id, { is_saved: nextSaved });
      loadConversations();
      notify(nextSaved ? 'Conversation bookmarked.' : 'Removed from saved chats.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const handleDeleteConv = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteConversationDoc(user.id, deleteTargetId);
      if (activeConvId === deleteTargetId) {
        setActiveConvId(null);
        setMessages([]);
      }
      setDeleteTargetId(null);
      loadConversations();
      notify('Conversation deleted.', 'info');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const handleSaveAnswer = async (msg: ChatMessage) => {
    try {
      const title = msg.structured?.short_answer?.slice(0, 90) || 'Saved Compliance Answer';
      await createSavedItemDoc(user.id, {
        item_type: 'answer',
        item_reference_id: msg.id,
        folder_name: 'General Research',
        title,
        excerpt: msg.content.slice(0, 500),
      });
      notify('Answer saved to Research Workspace.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleFeedback = async (msgId: string, rating: 'helpful' | 'not_helpful' | 'inaccurate') => {
    try {
      await submitFeedbackDoc(user.id, user.email, { message_id: msgId, rating });
      notify('Thank you. Feedback recorded in Firestore for review.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const activeCitations: Citation[] = lastAssistant?.citations || [];

  return (
    <div className="flex min-h-[540px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:h-[calc(100vh-8.5rem)] lg:flex-row">
      {/* Left Pane: Conversations */}
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40 lg:w-64 lg:border-b-0 lg:border-r">
        <div className="space-y-2.5 border-b border-slate-200 p-3 dark:border-slate-800">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"
          >
            <Plus className="h-3.5 w-3.5" />
            {t(language, 'newChat')}
          </button>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={searchConv}
              onChange={(e) => setSearchConv(e.target.value)}
              placeholder="Search chats..."
              className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex rounded-md bg-slate-200/70 p-0.5 text-[11px] font-medium dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setOnlySaved(false)}
              className={`flex-1 rounded py-1 transition-colors ${
                !onlySaved ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              All Chats
            </button>
            <button
              type="button"
              onClick={() => setOnlySaved(true)}
              className={`flex-1 rounded py-1 transition-colors ${
                onlySaved ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Saved
            </button>
          </div>
        </div>

        <div className="max-h-40 flex-1 space-y-1 overflow-y-auto p-2 lg:max-h-none">
          {conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-500">No conversations found.</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center justify-between gap-1 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                  activeConvId === conv.id
                    ? 'border border-slate-200 bg-white text-slate-900 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60'
                }`}
              >
                {renamingId === conv.id ? (
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={() => handleRenameSubmit(conv.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(conv.id)}
                    className="w-full rounded border border-teal-600 bg-white px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none dark:bg-slate-950 dark:text-slate-100"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => loadConversationMessages(conv.id)}
                    className="min-w-0 flex-1 truncate text-left font-medium"
                  >
                    {conv.title}
                  </button>
                )}

                <div className="flex shrink-0 items-center gap-0.5 opacity-80 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => handleToggleSaveConv(conv)}
                    aria-label="Bookmark conversation"
                    className={`rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700 ${
                      Boolean(conv.is_saved) ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400'
                    }`}
                  >
                    <Bookmark className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(conv.id);
                      setRenameText(conv.title);
                    }}
                    aria-label="Rename conversation"
                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700"
                  >
                    <Edit3 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTargetId(conv.id)}
                    aria-label="Delete conversation"
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Center Pane: Messages + Composer */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Chat Subheader */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {activeConv?.title || 'Official-Source Compliance Assistant'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t(language, 'disclaimerShort')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => exportConversationToPdf(activeConv?.title || 'Compliance Research', messages)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                {t(language, 'exportPdf')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSourcesDrawer((s) => !s)}
              aria-label="Toggle sources panel"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              {showSourcesDrawer ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
              Sources ({activeCitations.length})
            </button>
          </div>
        </div>

        {/* Message List */}
        <div className="min-h-[300px] flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {loadingConv ? (
            <div className="space-y-4">
              <div className="h-12 w-2/3 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-36 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto max-w-2xl py-8">
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Ask a question grounded in Pakistani official regulations
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                The assistant retrieves passages from indexed SECP, FBR, and SRB documents first and cites exact sections and page numbers.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleSend(p)}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-left text-xs font-medium text-slate-700 hover:border-teal-600 hover:bg-teal-50/40 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-2xl break-words rounded-xl bg-slate-900 px-4 py-3 text-sm text-white dark:bg-teal-800">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              const s = msg.structured;
              const isLast = index === messages.length - 1;
              const prevUserMsg = index > 0 && messages[index - 1].role === 'user' ? messages[index - 1].content : '';

              return (
                <div key={msg.id} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-950/40">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 text-xs dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-400">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Grounded Research Answer
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Evidence:{' '}
                        <strong
                          className={
                            msg.evidence_level === 'strong'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : msg.evidence_level === 'moderate'
                              ? 'text-teal-700 dark:text-teal-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }
                        >
                          {msg.evidence_level === 'strong'
                            ? 'Strong official match'
                            : msg.evidence_level === 'moderate'
                            ? 'Partial official match'
                            : 'Insufficient official evidence'}
                        </strong>
                      </span>
                      {s?.retrieval_mode && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[11px]">
                            {s.retrieval_mode === 'hybrid_vector_fts' ? 'Vector + FTS5' : 'FTS5 Lexical'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {msg.warning_text && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <span>{msg.warning_text}</span>
                    </div>
                  )}

                  {s ? (
                    <div className="space-y-4 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                          Direct Answer
                        </h4>
                        <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">{s.short_answer}</p>
                      </div>

                      {s.detailed_explanation && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Detailed Explanation
                          </h4>
                          <p className="mt-1 whitespace-pre-line">{s.detailed_explanation}</p>
                        </div>
                      )}

                      {s.step_by_step_guidance?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Step-by-Step Guidance
                          </h4>
                          <ol className="mt-1.5 list-decimal space-y-1.5 pl-5">
                            {s.step_by_step_guidance.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {s.what_you_may_need?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            What You May Need
                          </h4>
                          <ul className="mt-1.5 list-disc space-y-1 pl-5">
                            {s.what_you_may_need.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {s.conditions_and_exceptions?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Conditions &amp; Exceptions
                          </h4>
                          <ul className="mt-1.5 list-disc space-y-1 pl-5">
                            {s.conditions_and_exceptions.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {s.important_considerations?.length > 0 && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                            Important Considerations
                          </h4>
                          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
                            {s.important_considerations.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Inline Citation Chips */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="pt-1">
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                            Official Citations ({msg.citations.length})
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {msg.citations.map((cit) => (
                              <button
                                key={cit.id}
                                type="button"
                                onClick={() => onOpenDocument(cit.document_id, cit.chunk_id, cit.page_number)}
                                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-teal-800 hover:border-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-teal-300"
                              >
                                <FileText className="h-3 w-3 shrink-0" />
                                <span className="max-w-[200px] truncate">{cit.document_title}</span>
                                <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">
                                  p.{cit.page_number}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-line text-sm text-slate-800 dark:text-slate-200">{msg.content}</p>
                  )}

                  {/* Message Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(`ans-${msg.id}`, msg.content)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                      >
                        {copiedId === `ans-${msg.id}` ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveAnswer(msg)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                      >
                        <Bookmark className="h-3.5 w-3.5" />
                        Save Answer
                      </button>
                      {isLast && prevUserMsg && (
                        <button
                          type="button"
                          onClick={() => handleSend(prevUserMsg)}
                          disabled={sending}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Regenerate
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleFeedback(msg.id, 'helpful')}
                        aria-label="Mark helpful"
                        className="rounded p-1 hover:bg-slate-200/70 hover:text-emerald-700 dark:hover:bg-slate-800"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(msg.id, 'not_helpful')}
                        aria-label="Mark not helpful"
                        className="rounded p-1 hover:bg-slate-200/70 hover:text-red-600 dark:hover:bg-slate-800"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Follow-up suggestions */}
                  {isLast && s?.related_questions && s.related_questions.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[11px] font-medium text-slate-500">Related follow-up questions:</p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {s.related_questions.slice(0, 3).map((rq) => (
                          <button
                            key={rq}
                            type="button"
                            onClick={() => handleSend(rq)}
                            disabled={sending}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-left text-xs text-slate-700 hover:border-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          >
                            {rq}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {sending && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
              Retrieving official SECP, FBR, and SRB document chunks and validating citations...
            </div>
          )}

          {chatError && (
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Unable to complete grounded RAG request</p>
                <p className="mt-1 break-words">{chatError}</p>
              </div>
              <button
                type="button"
                onClick={() => handleSend()}
                className="shrink-0 rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
              >
                Retry
              </button>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-500">Scope:</span>
              {[
                { code: '', label: 'All Authorities' },
                { code: 'SECP', label: 'SECP' },
                { code: 'FBR', label: 'FBR' },
                { code: 'SRB', label: 'SRB' },
              ].map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setAuthorityFilter(opt.code)}
                  className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                    authorityFilter === opt.code
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              {question.length}/2000 · Enter to send
            </span>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              maxLength={2000}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              placeholder={t(language, 'askPlaceholder')}
              className="min-w-0 flex-1 resize-none rounded-lg border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={sending || question.trim().length < 3}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="h-4 w-4" />
              {sending ? t(language, 'sending') : t(language, 'send')}
            </button>
          </div>
        </div>
      </div>

      {/* Right Pane: Sources Panel */}
      {showSourcesDrawer && (
        <aside className="flex w-full shrink-0 flex-col border-t border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40 lg:w-80 lg:border-l lg:border-t-0">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              {t(language, 'sourcesTitle')}
            </h3>
          </div>
          <div className="max-h-60 flex-1 space-y-3 overflow-y-auto p-3.5 lg:max-h-none">
            {activeCitations.length === 0 ? (
              <p className="text-xs leading-relaxed text-slate-500">
                {t(language, 'noSourcesYet')}
              </p>
            ) : (
              activeCitations.map((cit) => (
                <div
                  key={cit.id}
                  className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-teal-700 dark:text-teal-400">{cit.authority_code}</span>
                    <span className="font-mono tabular-nums">Page {cit.page_number} · v{cit.version}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenDocument(cit.document_id, cit.chunk_id, cit.page_number)}
                    className="mt-1 text-left font-semibold text-slate-900 hover:text-teal-700 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {cit.document_title}
                  </button>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {cit.section_reference}
                  </p>
                  <p className="mt-2 line-clamp-3 rounded bg-slate-50 p-2 text-[11px] italic text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                    &ldquo;{cit.citation_text}&rdquo;
                  </p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Date: {cit.publication_date || cit.effective_date || t(language, 'dateNotStated')}
                  </p>
                  {Boolean(cit.is_superseded) && (
                    <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      Superseded / Historical Document
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => onOpenDocument(cit.document_id, cit.chunk_id, cit.page_number)}
                      className="font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      Inspect Passage
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          `cit-${cit.id}`,
                          `${cit.authority_name}, "${cit.document_title}", ${cit.section_reference}, Page ${cit.page_number} (${cit.source_url})`
                        )
                      }
                      className="text-slate-600 hover:text-slate-900 dark:text-slate-400"
                    >
                      {copiedId === `cit-${cit.id}` ? 'Copied!' : 'Copy Citation'}
                    </button>
                    {cit.source_url && !cit.source_url.startsWith('uploaded://') && (
                      <a
                        href={cit.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 dark:text-slate-400"
                      >
                        Official URL
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Delete conversation?"
        description="This permanently removes this conversation and its saved citations from your workspace."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConv}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}
