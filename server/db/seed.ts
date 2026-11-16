import crypto from 'crypto';
import { getServerConfig } from '../config/env.js';
import { db } from './database.js';
import { chunkDocumentText } from '../ingestion/extractor.js';
import { embedTexts } from '../services/gemini.js';

const OFFICIAL_AUTHORITIES = [
  {
    code: 'SECP',
    name: 'Securities and Exchange Commission of Pakistan',
    official_domain: 'secp.gov.pk',
    website_url: 'https://www.secp.gov.pk/',
    authority_type: 'Federal Corporate Regulator',
  },
  {
    code: 'FBR',
    name: 'Federal Board of Revenue',
    official_domain: 'fbr.gov.pk',
    website_url: 'https://www.fbr.gov.pk/',
    authority_type: 'Federal Tax Authority',
  },
  {
    code: 'SRB',
    name: 'Sindh Revenue Board',
    official_domain: 'srb.gos.pk',
    website_url: 'https://www.srb.gos.pk/',
    authority_type: 'Provincial Sales Tax Authority (Sindh)',
  },
  {
    code: 'PAKISTAN_CODE',
    name: 'Pakistan Code (Ministry of Law and Justice)',
    official_domain: 'pakistancode.gov.pk',
    website_url: 'https://pakistancode.gov.pk/',
    authority_type: 'Federal Statutory Repository',
  },
  {
    code: 'EOBI',
    name: "Employees' Old-Age Benefits Institution",
    official_domain: 'eobi.gov.pk',
    website_url: 'https://www.eobi.gov.pk/',
    authority_type: 'Federal Social Security Institution',
  },
];

interface SeedDocumentSpec {
  authorityCode: string;
  title: string;
  sourceUrl: string;
  documentType: string;
  documentNumber: string;
  publicationDate: string;
  effectiveDate: string;
  version: string;
  status: 'published' | 'superseded';
  isSuperseded: boolean;
  supersededByTitle?: string;
  text: string;
}

const OFFICIAL_DOCUMENTS: SeedDocumentSpec[] = [
  {
    authorityCode: 'SECP',
    title: 'SECP Company Registration & Single Member Company (SMC) Incorporation Guide (eZfile)',
    sourceUrl: 'https://www.secp.gov.pk/company-formation/registration-of-company/',
    documentType: 'Official Guide',
    documentNumber: 'SECP-EZFILE-INC-2024',
    publicationDate: '2024-02-01',
    effectiveDate: '2024-02-01',
    version: '2.0',
    status: 'published',
    isSuperseded: false,
    text: `[[PAGE_1]]
# SECP Company Registration Guide — eZfile Digital Portal

## Section 1: Business Structures Registered with SECP
Under the Companies Act, 2017, the Securities and Exchange Commission of Pakistan (SECP) incorporates corporate entities including:
- Single Member Company (SMC-Private Limited): Incorporated by a single natural person who acts as the sole shareholder and director.
- Private Limited Company: Incorporated by two or more persons (up to fifty members), restricting share transfers to the public.
- Public Limited Company (Listed or Unlisted): Requires at least three subscribers/directors for unlisted or seven for listed companies.
Note: Sole proprietorships (unincorporated individual businesses) and general partnerships under the Partnership Act, 1932 are not incorporated as companies by SECP; partnerships are registered provincially with the Registrar of Firms.

## Section 2: Single Member Company (SMC-Private Limited) Core Requirements
To incorporate a Single Member Company under the Companies Act, 2017 and Companies Regulations, 2024:
1. Sole Member and Director: One individual holding 100% of shares and serving as sole director and Chief Executive Officer (CEO).
2. Mandatory Nominee Appointment: Every Single Member Company must appoint a Nominee (generally a close relative such as spouse, parent, sibling, or adult child) who assumes management/transfer responsibilities upon the death or incapacitation of the sole member.
3. Registered Office Address: A physical postal address in Pakistan where statutory notices are received.
4. Principal Line of Business: Clearly defined primary business object matching SECP business sector classifications.

[[PAGE_2]]
## Section 3: Documents and Prerequisites for eZfile Incorporation
Before initiating incorporation on SECP eZfile (ezfile.secp.gov.pk), applicants must prepare:
- Valid CNIC (front and back scanned copies) of all subscribers, directors, and for an SMC, the Nominee.
- Biometrically verified active mobile SIM number registered against each person's own CNIC, plus a personal email address for OTP and digital PIN verification.
- Separate eZfile user accounts for each subscriber/director and for the SMC Nominee so each party can apply their electronic PIN signature.
- Three proposed company names in order of preference, along with a brief explanation of the name's meaning/significance.
- Share capital structure (Authorized Capital and Paid-up Capital).
- Memorandum of Association (MOA) and Articles of Association (AOA), which eZfile generates automatically from standard templates or allows uploading custom drafts.

## Section 4: Step-by-Step Procedure via SECP eZfile
Step 1 (User Registration): Create individual user profiles on SECP eZfile using CNIC, personal email, and biometrically verified mobile number.
Step 2 (Name Reservation & Incorporation): Submit the combined or standalone Name Reservation request verifying the name does not infringe existing trademarks or prohibited words under Section 10 of the Companies Act, 2017.
Step 3 (Data Entry & Attachments): Fill in registered office location, authorized/paid-up capital, principal line of business, director/shareholder details, and upload CNIC scans.
Step 4 (PIN Verification): All subscribers/directors—and the Nominee in the case of an SMC—must log into their respective eZfile accounts to digitally sign the submission using their security PIN.
Step 5 (Challan Fee Payment): Generate the e-challan and pay the prescribed incorporation fee based on authorized share capital via ADC/online banking, credit/debit card, or branchless channels.
Step 6 (Certificate of Incorporation): Following SECP officer review, if no discrepancies or objections arise, SECP issues the digital Certificate of Incorporation bearing the Corporate Unique Identification Number (CUIN), alongside digitally certified copies of the MOA and AOA.`,
  },
  {
    authorityCode: 'SECP',
    title: 'SECP Companies Regulations, 2024 — Annual Returns (Form A, Form 24) & Officer Changes (Form 9)',
    sourceUrl: 'https://www.secp.gov.pk/laws/',
    documentType: 'Statutory Regulations',
    documentNumber: 'S.R.O. / Companies Regulations 2024',
    publicationDate: '2024-02-19',
    effectiveDate: '2024-02-19',
    version: '1.0',
    status: 'published',
    isSuperseded: false,
    text: `[[PAGE_1]]
# Companies Regulations, 2024 — Post-Incorporation Statutory Filings

## Section 130 (Companies Act, 2017) & Form A: Annual Return
Every company registered under the Companies Act, 2017 is required to file an Annual Return capturing its registered office, share capital, members/shareholders, directors, chief executive, and auditors as of the date of the Annual General Meeting (AGM), or December 31 where no AGM is required.
- Statutory Form: Form A (Annual Return of a company). Under the Companies Regulations, 2024, Form A consolidates annual return reporting across companies, including disclosures on annual turnover, employee count, and share classes.
- Filing Deadline: Within thirty (30) days from the date of the AGM (or within 30 days of the close of the calendar year where applicable).
- Form 24 (No-Change Return): If there has been zero change in any particulars reported in the previous annual return, a company (other than a listed company) may file Form 24 confirming no change instead of repeating full Form A schedules.

[[PAGE_2]]
## Form 9: Reporting Changes in Directors, CEO, Secretary, or Auditors
Under the Companies Regulations, 2024, Form 9 replaces the former Form 29 for reporting appointments, resignations, removals, or changes in particulars of directors, the chief executive officer (CEO), company secretary, chief financial officer, and statutory auditors.
- Filing Deadline: Form 9 must be filed electronically via SECP eZfile within fifteen (15) days of the occurrence of any such change.
- Mandatory Verification: Relevant resignations, board/shareholder resolutions, and consent to act as director/CEO must be properly documented and verified through eZfile PIN authentication.

## Late Filing Additional Fees (Section 468, Companies Act, 2017)
Failure to file Form A, Form 24, Form 9, or financial statements within statutory deadlines attracts escalating additional late filing fees under Section 468 of the Companies Act, 2017, and persistent default may lead to show-cause proceedings or company strike-off action by the Registrar.`,
  },
  {
    authorityCode: 'SECP',
    title: 'SECP Legacy Guidance: Form 29 for Particulars of Directors and Officers (Historical Pre-2024)',
    sourceUrl: 'https://www.secp.gov.pk/company-formation/faqs-incorporation/',
    documentType: 'Legacy Circular / FAQ',
    documentNumber: 'SECP-LEGACY-FORM29',
    publicationDate: '2018-06-15',
    effectiveDate: '2018-06-15',
    version: '1.0',
    status: 'superseded',
    isSuperseded: true,
    supersededByTitle: 'SECP Companies Regulations, 2024 — Annual Returns (Form A, Form 24) & Officer Changes (Form 9)',
    text: `[[PAGE_1]]
# Historical Notice: Form 29 — Return of Particulars of Directors and Officers
[SUPERSEDED RECORD: Under the Companies (General Provisions and Forms) Regulations, 2018, changes in directors, chief executive, secretary, and auditors were previously submitted on Form 29 within 15 days of the change via the former eServices portal.]
This legacy Form 29 procedure has been SUPERSEDED by Form 9 under the Companies Regulations, 2024 on the SECP eZfile portal.`,
  },
  {
    authorityCode: 'FBR',
    title: 'FBR Income Tax Registration (NTN) & IRIS Portal Enrollment Guide',
    sourceUrl: 'https://www.fbr.gov.pk/',
    documentType: 'Official Taxpayer Guide',
    documentNumber: 'FBR-IRIS-181',
    publicationDate: '',
    effectiveDate: '',
    version: '1.0',
    status: 'published',
    isSuperseded: false,
    text: `[[PAGE_1]]
# Federal Board of Revenue (FBR) — Income Tax Registration (NTN) via IRIS

## Section 1: National Tax Number (NTN) Structure
Under the Income Tax Ordinance, 2001, taxpayers enroll electronically via the FBR IRIS portal (iris.fbr.gov.pk):
- Individuals / Sole Proprietors / Freelancers: Your 13-digit Computerized National Identity Card (CNIC) serves as your National Tax Number (NTN) upon IRIS e-enrollment.
- Associations of Persons (AOPs / Partnerships) and Companies: FBR issues a distinct 7-digit NTN upon submission and approval of Form 181 registration.
Note: For SECP-incorporated companies, basic incorporation data is digitally shared with FBR through the one-window integration, after which the principal officer completes IRIS profile activation and bank/business verification.

## Section 2: Documents Required for Individual / Sole Proprietor Registration (Form 181)
1. Valid CNIC / NICOP / Passport.
2. Active personal mobile phone number registered in the applicant's own name via biometric verification (cannot be shared with another registered taxpayer).
3. Active personal email address.
4. Business particulars (when registering a sole proprietorship business name): Business name, principal business activity, business premises address, tenancy agreement or ownership document, and a paid electricity/gas utility bill not older than 3 months.
5. Bank account maintenance certificate.

[[PAGE_2]]
## Section 3: Documents Required for Companies & AOPs
- Certificate of Incorporation from SECP (for companies) or Firm Registration Certificate and Partnership Deed (for AOPs).
- CNICs of all Directors, Partners, or Members.
- Letter on official letterhead authorizing the Principal Officer / Managing Partner to represent the entity before FBR.
- Proof of business premises (rent agreement/ownership) and recent paid utility bill.

## Section 4: Filing Income Tax Returns & Active Taxpayer List (ATL)
Registered persons must file an annual Income Tax Return and (for resident individuals) a Wealth Statement (Statement of Assets and Liabilities) via the IRIS Declaration tab to maintain Active Taxpayer List (ATL) status.
Persons not appearing on the ATL face higher withholding tax rates across banking, property, vehicle, and commercial transactions under the Income Tax Ordinance, 2001.`,
  },
  {
    authorityCode: 'FBR',
    title: 'FBR Sales Tax Registration (STRN) — Simplified Form 14(1) Under Sales Tax Rules',
    sourceUrl: 'https://www.fbr.gov.pk/',
    documentType: 'Official Procedure',
    documentNumber: 'FBR-STRN-14-1',
    publicationDate: '',
    effectiveDate: '',
    version: '1.0',
    status: 'published',
    isSuperseded: false,
    text: `[[PAGE_1]]
# FBR Federal Sales Tax Registration (STRN) Guide

## Section 1: When Federal Sales Tax Registration Applies
Businesses engaged in manufacturing, importing, wholesaling, distribution, or taxable retail/supply of goods under the Sales Tax Act, 1990 (or ICT services subject to federal sales tax) must obtain a Sales Tax Registration Number (STRN) through the FBR IRIS portal when required by turnover thresholds, business category, or supply-chain rules.
Note: Sales tax on services in provinces is administered by provincial authorities (such as SRB in Sindh, PRA in Punjab, KPRA in Khyber Pakhtunkhwa, and BRA in Balochistan), rather than FBR.

## Section 2: Mandatory Prerequisites for Form 14(1) Application
To apply for STRN via IRIS Form 14(1):
1. Active Income Tax Registration (NTN / IRIS credentials).
2. Business Bank Account Certificate explicitly issued in the name of the business/entity (including IBAN).
3. Proof of Business Premises: Rent agreement or ownership deed, plus consumer/meter reference numbers of electricity and gas connections.
4. GPS-Tagged Photographs: Clear GPS-tagged photographs of the business premises and utility meters.
5. Additional Manufacturer Requirements: Manufacturers must upload GPS-tagged photographs of installed machinery and industrial electricity/gas meters.

## Section 3: Biometric Verification & Monthly Return Filing
After submitting Form 14(1) on IRIS, biometric verification of the authorized person/proprietor/principal officer may be required via NADRA e-Sahulat within the prescribed timeframe. Once registered, sales tax returns must be filed monthly on IRIS (including Nil returns where no taxable supply occurred during a tax period).`,
  },
  {
    authorityCode: 'SRB',
    title: 'Sindh Revenue Board (SRB) — e-Registration (SNTN) & Monthly Form SST-03 Return Filing',
    sourceUrl: 'https://www.srb.gos.pk/',
    documentType: 'Provincial Tax Guide',
    documentNumber: 'SRB-SST-2011-GUIDE',
    publicationDate: '',
    effectiveDate: '',
    version: '1.0',
    status: 'published',
    isSuperseded: false,
    text: `[[PAGE_1]]
# Sindh Revenue Board (SRB) — Sindh Sales Tax on Services Compliance

## Section 1: Applicability under the Sindh Sales Tax on Services Act, 2011
Any individual, sole proprietor, partnership (AOP), or company providing or rendering taxable services listed in the Second Schedule of the Sindh Sales Tax on Services Act, 2011 from a place of business in Sindh (or to recipients in Sindh where applicable) must register with the Sindh Revenue Board (SRB) via the e-SRB portal (e.srb.gos.pk).
Examples of taxable service categories include software/IT consultancy (subject to applicable statutory exemptions or reduced rates in notifications), advertising, management consultancy, courier, logistics, construction, and hospitality services.

## Section 2: Prerequisites & e-Registration Steps (SNTN)
1. Prerequisite: An active FBR National Tax Number (NTN). The e-SRB portal pulls taxpayer core particulars from FBR using the NTN.
2. Required Particulars: CNIC of proprietor/directors/partners, business address proof (rent agreement/utility bill), business bank account details, email, and mobile number.
3. Registration Steps: Open e.srb.gos.pk -> e-Registration -> New e-Registration -> Enter NTN -> Complete the Taxpayer Registration Form with business activity codes and branch details -> Submit to receive SRB User ID, Password, and Sindh National Tax Number (SNTN).

[[PAGE_2]]
## Section 3: Monthly Sindh Sales Tax Return Filing (Form SST-03)
Every registered service provider must file a monthly Sindh Sales Tax Return (Form SST-03) on e.srb.gos.pk, even if no taxable services were rendered during the month ("Nil" return).
- Statutory Filing Due Date: Generally by the 15th day of the month following the tax period (unless extended by an official SRB notification).
- Payment via PSID: Any net sales tax payable is deposited prior to submission using an electronic Payment Slip ID (PSID) generated on e-SRB through authorized banks or online banking.
- Input Tax & Withholding (Annex-A): Registered persons declare sales invoices, eligible input tax adjustments under Sindh Sales Tax on Services Rules, and sales tax withheld by withholding agents backed by valid certificates.
- Late Filing Consequences: Late payment or non-filing triggers default surcharge and statutory penalties under Section 43 and Section 44 of the Sindh Sales Tax on Services Act, 2011.`,
  },
];

export async function seedDatabase(): Promise<void> {
  // 1. Seed Authorities
  const insertAuth = db.prepare(
    `INSERT OR IGNORE INTO authorities (code, name, official_domain, website_url, authority_type)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const auth of OFFICIAL_AUTHORITIES) {
    insertAuth.run(auth.code, auth.name, auth.official_domain, auth.website_url, auth.authority_type);
  }

  // 2. Seed Curated Official Documents
  for (const doc of OFFICIAL_DOCUMENTS) {
    const checksum = crypto.createHash('sha256').update(doc.title + '|' + doc.text).digest('hex');
    const existing = db.prepare(`SELECT id FROM documents WHERE checksum = ?`).get(checksum) as any;
    if (existing) continue;

    const authRow = db.prepare(`SELECT id FROM authorities WHERE code = ?`).get(doc.authorityCode) as any;
    const chunks = chunkDocumentText(doc.text);
    const pageCount = Math.max(...chunks.map((c) => c.pageNumber), 1);

    const res = db
      .prepare(
        `INSERT INTO documents (
          authority_id, title, source_url, document_type, document_number,
          publication_date, effective_date, retrieval_date, language, version,
          page_count, status, verification_status, is_superseded, checksum, raw_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'en', ?, ?, ?, 'verified_official', ?, ?, ?)`
      )
      .run(
        authRow ? authRow.id : null,
        doc.title,
        doc.sourceUrl,
        doc.documentType,
        doc.documentNumber,
        doc.publicationDate,
        doc.effectiveDate,
        doc.version,
        pageCount,
        doc.status,
        doc.isSuperseded ? 1 : 0,
        checksum,
        doc.text
      );

    const docId = Number(res.lastInsertRowid);
    const embeddingModel = getServerConfig().embeddingModel;
    const embeddings = await embedTexts(chunks.map((c) => `${doc.title} — ${c.sectionTitle}\n${c.chunkText}`));

    const insertChunk = db.prepare(
      `INSERT INTO document_chunks (document_id, chunk_text, page_number, section_title, chunk_index, embedding, embedding_dim, embedding_model, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    chunks.forEach((chunk, idx) => {
      const vec = embeddings?.[idx];
      const blob = vec ? Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength) : null;
      insertChunk.run(
        docId,
        chunk.chunkText,
        chunk.pageNumber,
        chunk.sectionTitle,
        chunk.chunkIndex,
        blob,
        vec ? vec.length : 0,
        vec ? embeddingModel : '',
        JSON.stringify({ title: doc.title, source_url: doc.sourceUrl, page: chunk.pageNumber, section: chunk.sectionTitle })
      );
    });

    db.prepare(
      `INSERT INTO ingestion_jobs (document_id, source_type, source_input, status, ocr_used, chunks_created, started_at, completed_at)
       VALUES (?, 'seed', ?, 'completed', 0, ?, datetime('now'), datetime('now'))`
    ).run(docId, doc.sourceUrl, chunks.length);
  }

  // Link superseded_by_id for historical Form 29 record
  const currentReg = db
    .prepare(`SELECT id FROM documents WHERE document_number = 'S.R.O. / Companies Regulations 2024' LIMIT 1`)
    .get() as any;
  const legacyDoc = db
    .prepare(`SELECT id, superseded_by_id FROM documents WHERE document_number = 'SECP-LEGACY-FORM29' LIMIT 1`)
    .get() as any;
  if (currentReg && legacyDoc && !legacyDoc.superseded_by_id) {
    db.prepare(`UPDATE documents SET superseded_by_id = ? WHERE id = ?`).run(currentReg.id, legacyDoc.id);
  }
}
