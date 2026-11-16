import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  Building2,
  GitCompare,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { t } from '../lib/i18n';
import { Language, ThemeMode, User } from '../types/compliance';

interface AppShellProps {
  user: User;
  activeTab: string;
  language: Language;
  theme: ThemeMode;
  onSelectTab: (tab: string) => void;
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  onOpenSearch: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function AppShell({
  user,
  activeTab,
  language,
  theme,
  onSelectTab,
  onToggleLanguage,
  onToggleTheme,
  onOpenSearch,
  onLogout,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenSearch]);

  const navItems = [
    { id: 'overview', label: t(language, 'navOverview'), icon: LayoutDashboard },
    { id: 'assistant', label: t(language, 'navAssistant'), icon: MessageSquare },
    { id: 'checklist', label: t(language, 'navChecklist'), icon: ListChecks },
    { id: 'library', label: t(language, 'navLibrary'), icon: BookOpen },
    { id: 'compare', label: t(language, 'navCompare'), icon: GitCompare },
    { id: 'saved', label: t(language, 'navSaved'), icon: Bookmark },
    { id: 'profile', label: t(language, 'navProfile'), icon: Building2 },
    { id: 'settings', label: t(language, 'navSettings'), icon: Settings },
    { id: 'help', label: t(language, 'navHelp'), icon: HelpCircle },
  ];

  if (user.role === 'admin') {
    navItems.push({ id: 'admin', label: t(language, 'navAdmin'), icon: ShieldCheck });
  }

  const activeItem = navItems.find((i) => i.id === activeTab);

  const SidebarContent = () => (
    <div className="flex h-full flex-col justify-between bg-white px-3 py-4 dark:bg-slate-900">
      <div>
        <div className="px-3 pb-4">
          <button
            type="button"
            onClick={() => {
              onSelectTab('overview');
              setMobileOpen(false);
            }}
            className="text-left font-display text-sm font-bold tracking-tight text-slate-900 hover:text-teal-700 dark:text-slate-100 dark:hover:text-teal-400"
          >
            {t(language, 'brand')}
          </button>
        </div>

        <nav aria-label="Primary Sidebar" className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  setMobileOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
        <div className="px-3 py-2">
          <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{user.full_name}</p>
          <p className="truncate text-[11px] text-slate-500">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-red-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>{t(language, 'signOut')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen overflow-x-clip bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 w-64 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-2 top-3 rounded p-1.5 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
              <span>Workspace</span>
              <span className="mx-1.5" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {activeItem?.label || 'Overview'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenSearch}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search regulations</span>
              <kbd className="hidden rounded border border-slate-300 px-1 font-mono text-[10px] text-slate-400 sm:inline dark:border-slate-700">
                Ctrl K
              </kbd>
            </button>

            <button
              type="button"
              onClick={onToggleLanguage}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              {language === 'en' ? 'اردو (RTL)' : 'English'}
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Toggle color theme"
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
