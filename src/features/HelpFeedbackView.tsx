import React, { useState } from 'react';
import { BookOpen, Send, ShieldAlert } from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { submitFeedbackDoc } from '../lib/firestoreRepo';
import { User } from '../types/compliance';

interface HelpFeedbackViewProps {
  user: User;
}

export function HelpFeedbackView({ user }: HelpFeedbackViewProps) {
  const { notify } = useToast();
  const [rating, setRating] = useState<'general' | 'helpful' | 'inaccurate' | 'outdated'>('general');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await submitFeedbackDoc(user.id, user.email, {
        rating,
        comment: comment.trim(),
      });
      setComment('');
      notify('Feedback submitted to the compliance governance queue.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Help, Limitations &amp; Feedback
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Understand how official citations work, review AI limitations, or report an outdated regulation.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <BookOpen className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            Quick User Guide
          </div>
          <ul className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            <li>1. Fill in <strong>My Business Profile</strong> so answers reflect your legal structure and province.</li>
            <li>2. Use the <strong>AI Assistant</strong> to ask practical compliance questions and click any citation chip to read the original passage.</li>
            <li>3. Generate a <strong>Compliance Checklist</strong> tailored to your profile and export it to PDF.</li>
            <li>4. Use <strong>Compare Requirements</strong> before choosing between a Sole Proprietorship, SMC, or Private Limited Company.</li>
          </ul>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            AI Limitations &amp; Legal Boundary
          </div>
          <ul className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            <li>• The AI can only cite documents currently indexed in the Official Document Library.</li>
            <li>• Tax rates, statutory fee schedules, and SRO exemptions change frequently—always verify on SECP eZfile, FBR IRIS, and e-SRB before filing.</li>
            <li>• User-uploaded summaries are explicitly marked as unverified and do not override official statutes.</li>
            <li>• Nothing on this platform constitutes legal, tax, or chartered accountancy advice.</li>
          </ul>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Report Missing Source, Outdated Rule, or Feedback
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Category</label>
            <select
              value={rating}
              onChange={(e) => setRating(e.target.value as any)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="general">General Feedback / Feature Request</option>
              <option value="outdated">Report Outdated / Superseded Law</option>
              <option value="inaccurate">Report Citation Issue</option>
              <option value="helpful">Positive Feedback</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Details</label>
            <textarea
              required
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share the regulation name, official URL suggestion, or feedback..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" />
            {submitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      </form>
    </div>
  );
}
