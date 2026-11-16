import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { saveBusinessProfileDoc } from '../lib/firestoreRepo';
import { BusinessProfile, User } from '../types/compliance';

interface BusinessProfileViewProps {
  user: User;
  profile: BusinessProfile | null;
  onSaved: (profile: BusinessProfile) => void;
}

const BUSINESS_TYPES = [
  'Freelancer',
  'Sole proprietor',
  'Partnership',
  'Single Member Company',
  'Private Limited Company',
  'Startup',
  'Small business',
  'Other',
];

const PROVINCES = [
  'Sindh',
  'Punjab',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Islamabad Capital Territory',
  'Gilgit-Baltistan',
  'Azad Jammu & Kashmir',
];

export function BusinessProfileView({ user, profile, onSaved }: BusinessProfileViewProps) {
  const { notify } = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [businessName, setBusinessName] = useState(profile?.business_name || '');
  const [businessType, setBusinessType] = useState(profile?.business_type || 'Single Member Company');
  const [legalStructure, setLegalStructure] = useState(profile?.legal_structure || 'company');
  const [province, setProvince] = useState(profile?.province || 'Sindh');
  const [city, setCity] = useState(profile?.city || 'Karachi');
  const [industry, setIndustry] = useState(profile?.industry || 'Information Technology & Software');
  const [businessActivity, setBusinessActivity] = useState(
    profile?.business_activity || 'Software development and digital consultancy services'
  );
  const [ownershipCount, setOwnershipCount] = useState(profile?.ownership_count || 1);
  const [hasEmployees, setHasEmployees] = useState(Boolean(profile?.has_employees));
  const [sellsGoods, setSellsGoods] = useState(Boolean(profile?.sells_goods));
  const [providesServices, setProvidesServices] = useState(
    profile ? Boolean(profile.provides_services) : true
  );

  useEffect(() => {
    if (profile) {
      setBusinessName(profile.business_name || '');
      setBusinessType(profile.business_type || 'Single Member Company');
      setLegalStructure(profile.legal_structure || 'company');
      setProvince(profile.province || 'Sindh');
      setCity(profile.city || 'Karachi');
      setIndustry(profile.industry || 'Information Technology & Software');
      setBusinessActivity(
        profile.business_activity || 'Software development and digital consultancy services'
      );
      setOwnershipCount(profile.ownership_count || 1);
      setHasEmployees(Boolean(profile.has_employees));
      setSellsGoods(Boolean(profile.sells_goods));
      setProvidesServices(Boolean(profile.provides_services));
    }
  }, [profile]);

  const handleNextStep = () => {
    if (step === 2) {
      if (!city.trim() || !industry.trim() || !businessActivity.trim()) {
        notify('Please enter your city, industry, and principal business activity before continuing.', 'error');
        return;
      }
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim() || !industry.trim() || !businessActivity.trim()) {
      notify('Please complete city, industry, and principal business activity in Step 2.', 'error');
      setStep(2);
      return;
    }
    if (!sellsGoods && !providesServices) {
      notify('Please select whether the business sells goods, provides services, or both.', 'error');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveBusinessProfileDoc(user.id, {
        business_name: businessName,
        business_type: businessType,
        legal_structure: legalStructure,
        province,
        city,
        industry,
        business_activity: businessActivity,
        ownership_count: Number(ownershipCount),
        has_employees: hasEmployees,
        sells_goods: sellsGoods,
        provides_services: providesServices,
      });
      onSaved(saved);
      notify('Business profile saved to Firestore. AI responses and checklists will reflect these details.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          My Business Profile Wizard
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Provide essential structure and provincial context so research and compliance checklists are relevant to your business.
        </p>
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
        {[
          { num: 1, title: '01. Business Structure' },
          { num: 2, title: '02. Location & Industry' },
          { num: 3, title: '03. Operations & Team' },
        ].map((s) => (
          <button
            key={s.num}
            type="button"
            onClick={() => setStep(s.num)}
            className={`rounded-lg border px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
              step === s.num
                ? 'border-teal-700 bg-teal-50 text-teal-900 dark:border-teal-500 dark:bg-teal-950/40 dark:text-teal-200'
                : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Business Name (optional)
              </label>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Indus Tech Solutions (SMC-Private) Limited"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Business Type
                </label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt} value={bt}>{bt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Legal Operating Form
                </label>
                <select
                  value={legalStructure}
                  onChange={(e) => setLegalStructure(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="individual">Individual / Sole Proprietor</option>
                  <option value="partnership">Partnership (AOP)</option>
                  <option value="company">SECP Incorporated Company</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Number of Owners / Shareholders
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={ownershipCount}
                onChange={(e) => setOwnershipCount(Number(e.target.value))}
                className="mt-1 w-32 rounded-lg border border-slate-300 px-3.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Province / Territory
                </label>
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {PROVINCES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  City
                </label>
                <input
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Karachi, Lahore, Islamabad"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Industry / Sector
              </label>
              <input
                required
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Information Technology, E-Commerce, Manufacturing"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Principal Business Activity
              </label>
              <textarea
                required
                rows={3}
                value={businessActivity}
                onChange={(e) => setBusinessActivity(e.target.value)}
                placeholder="Describe what your business sells or provides..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Revenue &amp; Workforce Scope (used to distinguish federal STRN goods tax vs provincial services tax)
            </p>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
              <input
                type="checkbox"
                checked={providesServices}
                onChange={(e) => setProvidesServices(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-teal-700"
              />
              <div className="text-xs">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Provides Services</p>
                <p className="text-slate-500">Relevant to provincial revenue boards such as SRB (Sindh), PRA, KPRA, or BRA.</p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
              <input
                type="checkbox"
                checked={sellsGoods}
                onChange={(e) => setSellsGoods(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-teal-700"
              />
              <div className="text-xs">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Sells or Manufactures Goods</p>
                <p className="text-slate-500">Relevant to FBR federal Sales Tax Registration (STRN) under the Sales Tax Act, 1990.</p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
              <input
                type="checkbox"
                checked={hasEmployees}
                onChange={(e) => setHasEmployees(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-teal-700"
              />
              <div className="text-xs">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Employs Staff</p>
                <p className="text-slate-500">Helps surface employee-count disclosures (Form A) and social security context.</p>
              </div>
            </label>

            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
              Note: This profile helps organize relevant guidance—it cannot determine your complete legal or tax obligations on its own.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Previous
              </button>
            )}
          </div>

          <div className="flex gap-2">
            {step < 3 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-teal-700"
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saving ? 'Saving Profile...' : 'Save Business Profile'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
