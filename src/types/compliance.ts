export type UserRole = 'user' | 'admin';
export type Language = 'en' | 'ur';
export type ThemeMode = 'light' | 'dark';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  email_verified: boolean;
  language: Language;
  theme: ThemeMode;
  notifications_enabled: boolean;
  privacy_analytics: boolean;
}

export interface BusinessProfile {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  legal_structure: string;
  industry: string;
  province: string;
  city: string;
  business_activity: string;
  ownership_count: number;
  has_employees: number | boolean;
  sells_goods: number | boolean;
  provides_services: number | boolean;
  created_at: string;
  updated_at: string;
}

export interface Authority {
  id: number;
  code: string;
  name: string;
  official_domain: string;
  website_url: string;
  authority_type: string;
}

export interface DocumentRecord {
  id: number;
  title: string;
  source_url: string;
  document_type: string;
  document_number: string;
  publication_date: string;
  effective_date: string;
  retrieval_date: string;
  language: Language;
  version: string;
  page_count: number;
  status: 'published' | 'draft' | 'superseded' | 'outdated' | 'conflict_review';
  verification_status: 'verified_official' | 'user_uploaded_unverified';
  is_superseded: number | boolean;
  superseded_by_id: number | null;
  previous_version_id: number | null;
  conflict_note: string;
  authority_code?: string;
  authority_name?: string;
  chunk_count?: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunk {
  id: number;
  chunk_index: number;
  page_number: number;
  section_title: string;
  chunk_text: string;
}

export interface Citation {
  id: number;
  document_id: number;
  chunk_id: number;
  citation_text: string;
  page_number: number;
  section_reference: string;
  document_title: string;
  source_url: string;
  document_type: string;
  publication_date: string;
  effective_date: string;
  version: string;
  is_superseded: number | boolean;
  verification_status: string;
  authority_name: string;
  authority_code: string;
}

export interface StructuredAnswer {
  short_answer: string;
  detailed_explanation: string;
  step_by_step_guidance: string[];
  conditions_and_exceptions: string[];
  what_you_may_need: string[];
  important_considerations: string[];
  related_questions: string[];
  insufficient_evidence: boolean;
  conflict_detected: boolean;
  conflict_summary: string;
  retrieval_mode?: string;
  provider_meta?: {
    provider_used: 'gemini' | 'openrouter';
    model_used: string;
    fallback_triggered?: boolean;
    fallback_reason?: string;
    cached?: boolean;
  };
  disclaimer?: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  structured?: StructuredAnswer | null;
  evidence_level?: 'strong' | 'moderate' | 'insufficient' | 'none';
  warning_text?: string;
  citations?: Citation[];
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  is_saved: number | boolean;
  message_count?: number;
  created_at: string;
  updated_at: string;
}

export type ChecklistStatus = 'not_started' | 'in_progress' | 'completed' | 'needs_review';

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  title: string;
  description: string;
  applicable_business_type: string;
  authority_name: string;
  source_document_id: number | null;
  source_chunk_id: number | null;
  citation_label: string;
  source_document_title?: string;
  source_document_url?: string;
  source_page_number?: number;
  source_section_title?: string;
  source_is_superseded?: number | boolean;
  status: ChecklistStatus;
  is_user_created: number | boolean;
  notes: string;
  last_reviewed_at: string;
  updated_at: string;
}

export interface Checklist {
  id: string;
  user_id: string;
  business_profile_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
  items: ChecklistItem[];
}

export interface SavedItem {
  id: string;
  user_id: string;
  item_type: 'conversation' | 'answer' | 'citation' | 'document';
  item_reference_id: string;
  folder_name: string;
  title: string;
  excerpt: string;
  notes: string;
  created_at: string;
}

export interface IngestionJob {
  id: number;
  document_id: number | null;
  document_title?: string;
  document_status?: string;
  source_type: 'upload' | 'url' | 'seed';
  source_input: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  ocr_used: number | boolean;
  error_message: string;
  chunks_created: number;
  started_at: string;
  completed_at: string;
}
