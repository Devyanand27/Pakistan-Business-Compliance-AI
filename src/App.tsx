import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { AppShell } from './components/AppShell';
import { AuthView } from './components/AuthView';
import { DocumentViewerModal } from './components/DocumentViewerModal';
import { LandingPage } from './components/LandingPage';
import { SearchCommandModal } from './components/SearchCommandModal';
import { ToastProvider } from './components/ToastProvider';
import { AdminDashboardView } from './features/AdminDashboardView';
import { AssistantView } from './features/AssistantView';
import { BusinessProfileView } from './features/BusinessProfileView';
import { ChecklistView } from './features/ChecklistView';
import { CompareView } from './features/CompareView';
import { DocumentLibraryView } from './features/DocumentLibraryView';
import { HelpFeedbackView } from './features/HelpFeedbackView';
import { OverviewView } from './features/OverviewView';
import { SavedResearchView } from './features/SavedResearchView';
import { SettingsView } from './features/SettingsView';
import { auth } from './lib/firebase';
import {
  ensureUserDocument,
  getBusinessProfileDoc,
  updateUserSettingsDoc,
} from './lib/firestoreRepo';
import { BusinessProfile, Language, ThemeMode, User } from './types/compliance';

function AppRoot() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [viewMode, setViewMode] = useState<'landing' | 'auth' | 'app'>('landing');
  const [activeTab, setActiveTab] = useState('overview');

  const [language, setLanguage] = useState<Language>('en');
  const [theme, setTheme] = useState<ThemeMode>('light');

  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [pendingConvId, setPendingConvId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{
    documentId: number;
    chunkId?: number;
    pageNumber?: number;
  } | null>(null);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr';
  }, [language]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setProfile(null);
        setViewMode((prev) => (prev === 'auth' ? 'auth' : 'landing'));
        setBooting(false);
        return;
      }

      try {
        const appUser = await ensureUserDocument(fbUser);
        const bp = await getBusinessProfileDoc(appUser.id);
        setUser(appUser);
        setProfile(bp);
        setLanguage(appUser.language || 'en');
        setTheme(appUser.theme || 'light');
        setViewMode('app');
      } catch (err) {
        console.error('[Auth Initialization Error]', (err as Error).message);
        setUser(null);
        setProfile(null);
        setViewMode('landing');
      } finally {
        setBooting(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleToggleLanguage = async () => {
    const next: Language = language === 'en' ? 'ur' : 'en';
    setLanguage(next);
    if (user) {
      setUser((u) => (u ? { ...u, language: next } : u));
      updateUserSettingsDoc(user.id, { language: next }).catch(() => {});
    }
  };

  const handleToggleTheme = async () => {
    const next: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    if (user) {
      setUser((u) => (u ? { ...u, theme: next } : u));
      updateUserSettingsDoc(user.id, { theme: next }).catch(() => {});
    }
  };

  const handleLogout = async () => {
    await signOut(auth).catch(() => {});
    setUser(null);
    setProfile(null);
    setPendingPrompt(null);
    setPendingConvId(null);
    setViewMode('landing');
    setActiveTab('overview');
  };

  const openDocument = (documentId: number, chunkId?: number, pageNumber?: number) => {
    setViewerDoc({ documentId, chunkId, pageNumber });
  };

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500 dark:bg-slate-950">
        Loading workspace...
      </div>
    );
  }

  return (
    <>
      {viewMode === 'landing' && (
        <LandingPage
          onStartResearching={() => setViewMode(user ? 'app' : 'auth')}
          onOpenLibraryPreview={() => setViewMode(user ? 'app' : 'auth')}
        />
      )}

      {viewMode === 'auth' && (
        <AuthView
          onBackToLanding={() => setViewMode('landing')}
          onSuccess={(authedUser, bp) => {
            setUser(authedUser);
            setProfile(bp);
            setLanguage(authedUser.language || 'en');
            setTheme(authedUser.theme || 'light');
            setViewMode('app');
            setActiveTab('overview');
          }}
        />
      )}

      {viewMode === 'app' && user && (
        <AppShell
          user={user}
          activeTab={activeTab}
          language={language}
          theme={theme}
          onSelectTab={setActiveTab}
          onToggleLanguage={handleToggleLanguage}
          onToggleTheme={handleToggleTheme}
          onOpenSearch={() => setSearchOpen(true)}
          onLogout={handleLogout}
        >
          {activeTab === 'overview' && (
            <OverviewView
              user={user}
              profile={profile}
              language={language}
              onNavigate={setActiveTab}
              onAskPrompt={(prompt) => {
                setPendingPrompt(prompt);
                setActiveTab('assistant');
              }}
              onOpenConversation={(convId) => {
                setPendingConvId(convId);
                setActiveTab('assistant');
              }}
              onOpenDocument={(docId) => openDocument(docId)}
            />
          )}

          {activeTab === 'assistant' && (
            <AssistantView
              user={user}
              profile={profile}
              language={language}
              initialPrompt={pendingPrompt}
              initialConversationId={pendingConvId}
              onPromptConsumed={() => {
                setPendingPrompt(null);
                setPendingConvId(null);
              }}
              onOpenDocument={openDocument}
            />
          )}

          {activeTab === 'checklist' && (
            <ChecklistView
              user={user}
              profile={profile}
              language={language}
              onOpenDocument={openDocument}
              onNavigateProfile={() => setActiveTab('profile')}
            />
          )}

          {activeTab === 'library' && (
            <DocumentLibraryView language={language} onOpenDocument={openDocument} />
          )}

          {activeTab === 'compare' && (
            <CompareView language={language} onOpenDocument={openDocument} />
          )}

          {activeTab === 'saved' && (
            <SavedResearchView
              user={user}
              onOpenDocument={(docId) => openDocument(docId)}
              onOpenConversation={(convId) => {
                setPendingConvId(convId);
                setActiveTab('assistant');
              }}
            />
          )}

          {activeTab === 'profile' && (
            <BusinessProfileView user={user} profile={profile} onSaved={setProfile} />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              user={user}
              onUserUpdated={(updated) => {
                setUser(updated);
                setLanguage(updated.language);
                setTheme(updated.theme);
              }}
              onAccountDeleted={() => {
                setUser(null);
                setProfile(null);
                setViewMode('landing');
                setActiveTab('overview');
              }}
            />
          )}

          {activeTab === 'help' && <HelpFeedbackView user={user} />}

          {activeTab === 'admin' && user.role === 'admin' && (
            <AdminDashboardView onOpenDocument={(docId) => openDocument(docId)} />
          )}
        </AppShell>
      )}

      <SearchCommandModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectDocument={(docId, chunkId, page) => openDocument(docId, chunkId, page)}
      />

      <DocumentViewerModal
        documentId={viewerDoc?.documentId || null}
        highlightChunkId={viewerDoc?.chunkId}
        highlightPage={viewerDoc?.pageNumber}
        language={language}
        isAuthenticated={Boolean(user)}
        onClose={() => setViewerDoc(null)}
      />
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppRoot />
    </ToastProvider>
  );
}
