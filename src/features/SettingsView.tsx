import React, { useState } from 'react';
import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { Download, Eye, EyeOff, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastProvider';
import { auth } from '../lib/firebase';
import {
  deleteUserWorkspaceData,
  exportUserWorkspaceData,
  updateUserSettingsDoc,
} from '../lib/firestoreRepo';
import { Language, ThemeMode, User } from '../types/compliance';

interface SettingsViewProps {
  user: User;
  onUserUpdated: (user: User) => void;
  onAccountDeleted: () => void;
}

export function SettingsView({ user, onUserUpdated, onAccountDeleted }: SettingsViewProps) {
  const { notify } = useToast();
  const [fullName, setFullName] = useState(user.full_name);
  const [language, setLanguage] = useState<Language>(user.language);
  const [theme, setTheme] = useState<ThemeMode>(user.theme);
  const [notificationsEnabled, setNotificationsEnabled] = useState(user.notifications_enabled);
  const [privacyAnalytics, setPrivacyAnalytics] = useState(user.privacy_analytics);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasPasswordProvider = Boolean(
    auth.currentUser?.providerData.some((p) => p.providerId === 'password')
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      notify('Full name cannot be empty.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (newPassword) {
        if (!hasPasswordProvider || !auth.currentUser) {
          throw new Error('Password change is only available for email/password accounts.');
        }
        if (newPassword.length < 8) {
          throw new Error('New password must be at least 8 characters long.');
        }
        if (!currentPassword) {
          throw new Error('Please enter your current password to set a new password.');
        }
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPassword);
      }

      if (auth.currentUser && fullName.trim() !== user.full_name) {
        await updateProfile(auth.currentUser, { displayName: fullName.trim() }).catch(() => {});
      }

      const updated = await updateUserSettingsDoc(user.id, {
        full_name: fullName.trim(),
        language,
        theme,
        notifications_enabled: notificationsEnabled,
        privacy_analytics: privacyAnalytics,
      });

      onUserUpdated({ ...updated, role: user.role });
      setCurrentPassword('');
      setNewPassword('');
      notify('Settings saved.', 'success');
    } catch (err) {
      const code = (err as any)?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        notify('Current password is incorrect.', 'error');
      } else if (code === 'auth/requires-recent-login') {
        notify('For security, please sign out and sign back in before changing your password.', 'error');
      } else {
        notify((err as Error).message, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const payload = await exportUserWorkspaceData(user.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pakcompliance-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify('Workspace data exported as JSON.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteUserWorkspaceData(user.id);
      if (auth.currentUser) {
        await deleteUser(auth.currentUser);
      }
      notify('Your account and Firestore workspace have been permanently deleted.', 'info');
      onAccountDeleted();
    } catch (err) {
      const code = (err as any)?.code || '';
      if (code === 'auth/requires-recent-login') {
        notify('For security, please sign out and sign back in before permanently deleting your account.', 'error');
      } else {
        notify((err as Error).message, 'error');
      }
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Account &amp; Workspace Settings
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage language (English / Urdu RTL), appearance, Firebase authentication security, and personal data exports.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Profile &amp; Preferences</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Full Name</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input
                disabled
                value={user.email}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Language &amp; Layout</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="en">English (LTR)</option>
                <option value="ur">Urdu — اردو (RTL)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Theme</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as ThemeMode)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="light">Light Workspace</option>
                <option value="dark">Dark Workspace</option>
              </select>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                className="h-4 w-4 accent-teal-700"
              />
              Notify me inside the workspace when indexed official regulations are updated
            </label>
            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={privacyAnalytics}
                onChange={(e) => setPrivacyAnalytics(e.target.checked)}
                className="h-4 w-4 accent-teal-700"
              />
              Allow anonymous retrieval quality metrics (never logs personal profile details)
            </label>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Change Password</h2>
            {hasPasswordProvider && (
              <button
                type="button"
                onClick={() => setShowPasswords((s) => !s)}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPasswords ? 'Hide' : 'Show'}
              </button>
            )}
          </div>

          {hasPasswordProvider ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Current Password</label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">New Password</label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You signed in with Google. Password authentication is managed directly through your Google Account security settings.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Data Export & Account Deletion */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Data Portability &amp; Account Deletion</h2>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleExportData}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Preparing Export...' : 'Export My Data (JSON)'}
          </button>

          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Account Permanently
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete your account permanently?"
        description="This immediately erases your user account, business profile, saved conversations, checklists, and saved research. This cannot be undone."
        confirmLabel="Delete My Account"
        destructive
        loading={deleting}
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
