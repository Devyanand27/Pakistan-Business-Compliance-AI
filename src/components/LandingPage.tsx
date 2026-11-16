import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileSearch,
  GitCompare,
  ListChecks,
  Scale,
  ShieldCheck,
  X,
} from 'lucide-react';

interface LandingPageProps {
  onStartResearching: () => void;
  onOpenLibraryPreview: () => void;
}

const FAQS = [
  {
    q: 'Where does Pakistan Business Compliance AI source its regulatory answers?',
    a: 'All legal, tax, and filing guidance is retrieved exclusively from indexed official Pakistani government publications, acts, statutory rules, and portal guides published by SECP (secp.gov.pk), FBR (fbr.gov.pk), and SRB (srb.gos.pk). Commercial blogs and social media posts are excluded from authoritative retrieval.',
  },
  {
    q: 'What happens if an indexed source is missing or outdated?',
    a: 'If retrieved documents do not contain enough verified evidence to answer a question, the AI assistant explicitly states what could not be verified instead of guessing. Historical documents—such as legacy Form 29 guidance replaced by Form 9 under the Companies Regulations 2024—are flagged as superseded.',
  },
  {
    q: 'Does using this platform replace a corporate lawyer or tax consultant?',
    a: 'No. The platform provides structured informational research and source discovery to help founders, SMEs, and professionals navigate official filings. It does not issue legal opinions, tax advice, or compliance guarantees.',
  },
  {
    q: 'Does the platform support Urdu and provincial compliance?',
    a: 'Yes. You can switch the workspace between English and Urdu (with full right-to-left layout support while preserving exact statutory form numbers and source URLs), and tailor guidance to your province—starting with Sindh Revenue Board (SRB) services tax alongside federal SECP and FBR filings.',
  },
];

export function LandingPage({ onStartResearching }: LandingPageProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | 'disclaimer' | 'contact' | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [archiveImgFailed, setArchiveImgFailed] = useState(false);

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Bar Contract: exactly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
          <a
            href="#top"
            className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            Pakistan Business Compliance AI
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#how-it-works" className="hover:text-teal-700 dark:hover:text-teal-400 transition-colors whitespace-nowrap shrink-0">
              How It Works
            </a>
            <a href="#features" className="hover:text-teal-700 dark:hover:text-teal-400 transition-colors whitespace-nowrap shrink-0">
              Features
            </a>
            <a href="#authorities" className="hover:text-teal-700 dark:hover:text-teal-400 transition-colors whitespace-nowrap shrink-0">
              Authorities
            </a>
            <a href="#trust" className="hover:text-teal-700 dark:hover:text-teal-400 transition-colors whitespace-nowrap shrink-0">
              Transparency
            </a>
            <a href="#faq" className="hover:text-teal-700 dark:hover:text-teal-400 transition-colors whitespace-nowrap shrink-0">
              FAQ
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onStartResearching}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
            >
              Start Researching
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Split */}
        <section className="mx-auto max-w-7xl px-6 py-14 lg:py-20">
          <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
            <div className="flex flex-col justify-center lg:col-span-6">
              <p className="text-xs font-medium tracking-wide text-teal-700 dark:text-teal-400">
                Official-Source Regulatory Research · SECP · FBR · SRB
              </p>
              <h1
                className="mt-3 font-display font-bold tracking-tight text-slate-900 dark:text-slate-50"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', lineHeight: 1.1 }}
              >
                Understand Pakistan&apos;s Business Compliance. With Confidence.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
                Ask practical questions about company incorporation, NTN and sales tax registration, and annual statutory filings. Every answer is retrieved from indexed official Pakistani government documents—with exact section citations, page references, and source freshness indicators.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onStartResearching}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
                >
                  Start Researching
                  <ArrowRight className="h-4 w-4" />
                </button>
                <a
                  href="#features"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  Explore Features
                </a>
              </div>

              <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                Informational research tool grounded in official public publications. Not legal, accounting, or tax advice.
              </p>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[300px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/hero_compliance_desk_1794841842876.jpg"
                    alt="Pakistani regulatory research workspace with statutory volumes and digital compliance interface"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full min-h-[300px] flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-teal-50 p-8 text-center dark:from-slate-900 dark:to-teal-950/30">
                    <Scale className="h-10 w-10 text-teal-700 dark:text-teal-400" />
                    <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                      Grounded Pakistani Business Regulatory Archive
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                How Grounded Retrieval Works
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Instead of relying on unverified AI memory, every query follows a transparent four-stage evidence pipeline.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  num: '01. Profile Context',
                  title: 'Configure Your Structure',
                  desc: 'Specify whether you operate as a freelancer, sole proprietor, partnership, SMC, or private limited company, along with province and goods/services scope.',
                },
                {
                  num: '02. Hybrid Search',
                  title: 'Retrieve Official Passages',
                  desc: 'Semantic embeddings and full-text statutory indexing locate relevant sections across SECP, FBR, and SRB documents—preserving page numbers.',
                },
                {
                  num: '03. Citation Validation',
                  title: 'Verify Every Claim',
                  desc: 'The AI synthesizes plain-language steps strictly from retrieved passages, validating that every citation points to an indexed chunk.',
                },
                {
                  num: '04. Action & Export',
                  title: 'Track & Export PDF',
                  desc: 'Turn verified obligations into a progress-tracked compliance checklist, save citations into project folders, and export clean PDFs.',
                },
              ].map((step) => (
                <div key={step.num} className="border-t border-slate-200 pt-5 dark:border-slate-800">
                  <p className="font-mono text-xs font-medium text-teal-700 dark:text-teal-400">{step.num}</p>
                  <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Bento Grid */}
        <section id="features" className="border-t border-slate-200 py-16 dark:border-slate-800">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                Built for Real Compliance Workflows
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Practical research tools designed for founders, SMEs, accountants, and consultants across Pakistan.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                <div className="flex items-center gap-2.5 text-teal-700 dark:text-teal-400">
                  <FileSearch className="h-5 w-5" />
                  <span className="text-xs font-semibold tracking-wide">AI Compliance Assistant</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Side-by-Side Answers and Official Source Evidence
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Every response separates direct guidance, procedural steps, conditions, and required documents—paired with a live Sources Panel showing document title, issuing authority, section reference, page number, and publication status. Clicking any citation opens the exact passage.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2.5 text-teal-700 dark:text-teal-400">
                  <ListChecks className="h-5 w-5" />
                  <span className="text-xs font-semibold tracking-wide">Compliance Checklists</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Profile-Driven Action Plans
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Generate checklists linked to official regulations, distinguish AI-grounded tasks from personal notes, track status, and export clean PDFs.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2.5 text-teal-700 dark:text-teal-400">
                  <GitCompare className="h-5 w-5" />
                  <span className="text-xs font-semibold tracking-wide">Structure Comparison</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Compare Entities Side by Side
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Compare Sole Proprietorship, Partnership, Single Member Company, and Private Limited Company across ownership, registration authority, filings, and taxes.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                <div className="flex items-center gap-2.5 text-teal-700 dark:text-teal-400">
                  <BookOpen className="h-5 w-5" />
                  <span className="text-xs font-semibold tracking-wide">Document Library &amp; Summarizer</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Searchable Statutory Library with Version History
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Browse indexed SECP, FBR, and SRB publications, inspect document versions and superseded notices, summarize complex circulars in plain English or Urdu, or upload your own draft document for clearly labeled unverified plain-language breakdown.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Supported Official Authorities */}
        <section id="authorities" className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                Supported Official Authorities
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Primary coverage starts with Pakistan&apos;s core corporate and tax regulators, with extensible allowlisted ingestion for provincial bodies.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                {
                  code: 'SECP',
                  name: 'Securities & Exchange Commission of Pakistan',
                  url: 'https://www.secp.gov.pk/',
                  scope: 'Company incorporation (SMC, Private & Public Ltd), eZfile portal procedures, MOA/AOA, Form A, Form 24, Form 9, and Companies Regulations 2024.',
                },
                {
                  code: 'FBR',
                  name: 'Federal Board of Revenue',
                  url: 'https://www.fbr.gov.pk/',
                  scope: 'NTN & IRIS e-enrollment (Form 181), Income Tax Return & Active Taxpayer List obligations, and Federal Sales Tax Registration (STRN Form 14(1)).',
                },
                {
                  code: 'SRB',
                  name: 'Sindh Revenue Board',
                  url: 'https://www.srb.gos.pk/',
                  scope: 'Sindh Sales Tax on Services Act 2011, e-SRB registration (SNTN), taxable service categories, and monthly Form SST-03 filing guidance.',
                },
              ].map((auth) => (
                <div key={auth.code} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <p className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">{auth.code}</p>
                    <h3 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-100">{auth.name}</h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{auth.scope}</p>
                  </div>
                  <a
                    href={auth.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                  >
                    {auth.url}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust & Transparency */}
        <section id="trust" className="border-t border-slate-200 py-16 dark:border-slate-800">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <div className="h-full min-h-[260px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                  {!archiveImgFailed ? (
                    <img
                      src="/src/assets/images/regulatory_archive_editorial_1794841843540.jpg"
                      alt="Institutional regulatory archive hall representing verified versioned document storage"
                      referrerPolicy="no-referrer"
                      onError={() => setArchiveImgFailed(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full min-h-[260px] items-center justify-center p-8">
                      <ShieldCheck className="h-10 w-10 text-teal-700" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col justify-center lg:col-span-7">
                <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                  Designed Around Honesty, Freshness &amp; Verification
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Regulatory tools fail users when they guess fees, invent deadlines, or hide missing dates. This platform enforces strict transparency rules across ingestion, retrieval, and generation.
                </p>

                <ul className="mt-6 space-y-3.5 text-sm text-slate-700 dark:text-slate-300">
                  {[
                    'Never fabricates tax rates, statutory deadlines, government form numbers, or citations.',
                    'Displays "Date not stated in source" whenever an official document omits a publication or effective date.',
                    'Retains historical versions and flags superseded procedures (e.g., Form 29 replaced by Form 9) instead of silently deleting them.',
                    'Separates verified official government publications from user-uploaded unverified documents.',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <button
                    type="button"
                    onClick={onStartResearching}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-teal-700 dark:hover:bg-teal-800"
                  >
                    Open Research Workspace
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className="border-t border-slate-200 bg-white py-14 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mx-auto max-w-7xl px-6">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
              Who Uses Pakistan Business Compliance AI
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  role: 'Startup Founders',
                  desc: 'Compare Single Member vs Private Limited structures and prepare SECP eZfile incorporations.',
                },
                {
                  role: 'Freelancers & Sole Proprietors',
                  desc: 'Understand FBR IRIS NTN enrollment, ATL status, and provincial service tax applicability.',
                },
                {
                  role: 'SMEs in Sindh',
                  desc: 'Verify SRB e-Registration (SNTN), service schedules, and monthly Form SST-03 workflows.',
                },
                {
                  role: 'Accountants & Consultants',
                  desc: 'Search indexed statutory updates, inspect Form A / Form 9 timelines, and export client checklists.',
                },
              ].map((u) => (
                <div key={u.role} className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{u.role}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{u.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-slate-200 py-16 dark:border-slate-800">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Frequently Asked Questions
            </h2>
            <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {FAQS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-100"
                    >
                      <span>{item.q}</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <p className="pb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                        {item.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white py-10 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Pakistan Business Compliance AI
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Informational research grounded in official SECP, FBR, and SRB publications. Not professional legal or tax advice.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-slate-600 dark:text-slate-400">
            <button type="button" onClick={() => setLegalModal('privacy')} className="hover:text-slate-900 dark:hover:text-slate-100">
              Privacy
            </button>
            <button type="button" onClick={() => setLegalModal('terms')} className="hover:text-slate-900 dark:hover:text-slate-100">
              Terms
            </button>
            <button type="button" onClick={() => setLegalModal('disclaimer')} className="hover:text-slate-900 dark:hover:text-slate-100">
              Disclaimer
            </button>
            <button type="button" onClick={() => setLegalModal('contact')} className="hover:text-slate-900 dark:hover:text-slate-100">
              Contact
            </button>
          </div>
        </div>
      </footer>

      {legalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="text-base font-semibold capitalize text-slate-900 dark:text-slate-100">
                {legalModal} Notice
              </h3>
              <button type="button" onClick={() => setLegalModal(null)} className="rounded p-1 text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {legalModal === 'privacy' && (
                <p>
                  We minimize stored user data. Authentication is managed securely via Firebase Authentication, user workspace data is isolated per account in Cloud Firestore, and you can export or permanently delete your account data anytime from Settings. Do not enter CNICs or confidential client tax filings into research queries.
                </p>
              )}
              {legalModal === 'terms' && (
                <p>
                  This platform indexes public Pakistani regulatory documents for informational research. Users remain responsible for verifying statutory deadlines, fee schedules, and filings directly on SECP eZfile, FBR IRIS, and e-SRB portals.
                </p>
              )}
              {legalModal === 'disclaimer' && (
                <p>
                  Pakistan Business Compliance AI is an informational research assistant—not a law firm, chartered accountancy practice, tax advisor, or government agency. Always consult a qualified advocate or tax practitioner for binding legal or tax advice.
                </p>
              )}
              {legalModal === 'contact' && (
                <p>
                  To suggest an official Pakistani government document source or report an outdated citation, sign in and submit a report through the Help &amp; Feedback section in the workspace.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
