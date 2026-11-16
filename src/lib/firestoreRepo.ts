import { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BusinessProfile,
  ChatMessage,
  Checklist,
  ChecklistItem,
  ChecklistStatus,
  Conversation,
  SavedItem,
  User,
} from '../types/compliance';
import { db, handleFirestoreError, OperationType } from './firebase';

function tsToIso(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  return new Date().toISOString();
}

export async function resolveUserRole(fbUser: FirebaseUser, storedRole?: string): Promise<'user' | 'admin'> {
  if (fbUser.emailVerified) {
    try {
      const adminSnap = await getDoc(doc(db, 'admins', fbUser.uid));
      if (adminSnap.exists()) return 'admin';
    } catch {
      // Non-admin users may not have an admin marker; fall back cleanly
    }
  }
  return storedRole === 'admin' ? 'admin' : 'user';
}

export async function ensureUserDocument(
  fbUser: FirebaseUser,
  overrideFullName?: string
): Promise<User> {
  const path = `users/${fbUser.uid}`;
  try {
    const ref = doc(db, 'users', fbUser.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      const displayName = (
        overrideFullName ||
        fbUser.displayName ||
        fbUser.email?.split('@')[0] ||
        'Compliance Researcher'
      )
        .trim()
        .slice(0, 120);

      const newProfile = {
        uid: fbUser.uid,
        email: (fbUser.email || '').toLowerCase().slice(0, 180),
        full_name: displayName || 'Compliance Researcher',
        role: 'user' as const,
        email_verified: Boolean(fbUser.emailVerified),
        language: 'en' as const,
        theme: 'light' as const,
        notifications_enabled: true,
        privacy_analytics: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(ref, newProfile);
      const role = await resolveUserRole(fbUser, 'user');
      return {
        id: fbUser.uid,
        email: newProfile.email,
        full_name: newProfile.full_name,
        role,
        email_verified: Boolean(fbUser.emailVerified),
        language: 'en',
        theme: 'light',
        notifications_enabled: true,
        privacy_analytics: false,
      };
    }

    const data = snap.data();
    const pendingPatch: Record<string, any> = {};
    if (Boolean(fbUser.emailVerified) !== Boolean(data.email_verified)) {
      pendingPatch.email_verified = Boolean(fbUser.emailVerified);
    }
    const cleanOverride = overrideFullName?.trim().slice(0, 120);
    if (cleanOverride && cleanOverride !== data.full_name) {
      pendingPatch.full_name = cleanOverride;
    }
    if (Object.keys(pendingPatch).length > 0) {
      pendingPatch.updatedAt = serverTimestamp();
      await updateDoc(ref, pendingPatch).catch(() => {});
    }
    const role = await resolveUserRole(fbUser, data.role);
    return {
      id: fbUser.uid,
      email: data.email || fbUser.email || '',
      full_name: cleanOverride || data.full_name || fbUser.displayName || 'User',
      role,
      email_verified: Boolean(fbUser.emailVerified),
      language: data.language === 'ur' ? 'ur' : 'en',
      theme: data.theme === 'dark' ? 'dark' : 'light',
      notifications_enabled: data.notifications_enabled !== false,
      privacy_analytics: Boolean(data.privacy_analytics),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateUserSettingsDoc(
  uid: string,
  updates: Partial<{
    full_name: string;
    language: 'en' | 'ur';
    theme: 'light' | 'dark';
    notifications_enabled: boolean;
    privacy_analytics: boolean;
  }>
): Promise<User> {
  const path = `users/${uid}`;
  try {
    const ref = doc(db, 'users', uid);
    const payload: Record<string, any> = { updatedAt: serverTimestamp() };
    if (typeof updates.full_name === 'string' && updates.full_name.trim()) {
      payload.full_name = updates.full_name.trim().slice(0, 120);
    }
    if (updates.language === 'en' || updates.language === 'ur') payload.language = updates.language;
    if (updates.theme === 'light' || updates.theme === 'dark') payload.theme = updates.theme;
    if (typeof updates.notifications_enabled === 'boolean') {
      payload.notifications_enabled = updates.notifications_enabled;
    }
    if (typeof updates.privacy_analytics === 'boolean') {
      payload.privacy_analytics = updates.privacy_analytics;
    }
    await updateDoc(ref, payload);
    const snap = await getDoc(ref);
    const data = snap.data() || {};
    return {
      id: uid,
      email: data.email || '',
      full_name: data.full_name || 'User',
      role: data.role === 'admin' ? 'admin' : 'user',
      email_verified: Boolean(data.email_verified),
      language: data.language === 'ur' ? 'ur' : 'en',
      theme: data.theme === 'dark' ? 'dark' : 'light',
      notifications_enabled: data.notifications_enabled !== false,
      privacy_analytics: Boolean(data.privacy_analytics),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// ---------- Business Profile ----------

export async function getBusinessProfileDoc(uid: string): Promise<BusinessProfile | null> {
  const path = `business_profiles/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'business_profiles', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      id: snap.id,
      user_id: uid,
      business_name: d.business_name || '',
      business_type: d.business_type,
      legal_structure: d.legal_structure,
      industry: d.industry,
      province: d.province,
      city: d.city,
      business_activity: d.business_activity,
      ownership_count: Number(d.ownership_count || 1),
      has_employees: Boolean(d.has_employees),
      sells_goods: Boolean(d.sells_goods),
      provides_services: Boolean(d.provides_services),
      created_at: tsToIso(d.createdAt),
      updated_at: tsToIso(d.updatedAt),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveBusinessProfileDoc(
  uid: string,
  input: Omit<BusinessProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<BusinessProfile> {
  const path = `business_profiles/${uid}`;
  try {
    const ref = doc(db, 'business_profiles', uid);
    const existing = await getDoc(ref);
    const cleanData = {
      userId: uid,
      business_name: (input.business_name || '').trim().slice(0, 140),
      business_type: input.business_type.trim().slice(0, 80),
      legal_structure: input.legal_structure.trim().slice(0, 40),
      industry: input.industry.trim().slice(0, 100),
      province: input.province.trim().slice(0, 80),
      city: input.city.trim().slice(0, 80),
      business_activity: input.business_activity.trim().slice(0, 300),
      ownership_count: Math.max(1, Math.min(200, Math.floor(Number(input.ownership_count || 1)))),
      has_employees: Boolean(input.has_employees),
      sells_goods: Boolean(input.sells_goods),
      provides_services: Boolean(input.provides_services),
      updatedAt: serverTimestamp(),
    };

    if (existing.exists()) {
      await updateDoc(ref, {
        business_name: cleanData.business_name,
        business_type: cleanData.business_type,
        legal_structure: cleanData.legal_structure,
        industry: cleanData.industry,
        province: cleanData.province,
        city: cleanData.city,
        business_activity: cleanData.business_activity,
        ownership_count: cleanData.ownership_count,
        has_employees: cleanData.has_employees,
        sells_goods: cleanData.sells_goods,
        provides_services: cleanData.provides_services,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...cleanData,
        createdAt: serverTimestamp(),
      });
    }
    return (await getBusinessProfileDoc(uid))!;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// ---------- Conversations & Messages ----------

export async function listConversationsDocs(
  uid: string,
  search = '',
  onlySaved = false
): Promise<Conversation[]> {
  const path = 'conversations';
  try {
    const q = query(collection(db, 'conversations'), where('userId', '==', uid));
    const snap = await getDocs(q);
    const items: Conversation[] = snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          user_id: d.userId,
          title: d.title,
          is_saved: Boolean(d.is_saved),
          message_count: Number(d.message_count || 0),
          created_at: tsToIso(d.createdAt),
          updated_at: tsToIso(d.updatedAt),
        };
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

    return items.filter((c) => {
      if (onlySaved && !c.is_saved) return false;
      if (search.trim() && !c.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getConversationMessagesDocs(
  uid: string,
  convId: string
): Promise<{ conversation: Conversation; messages: ChatMessage[] }> {
  const convPath = `conversations/${convId}`;
  try {
    const convSnap = await getDoc(doc(db, 'conversations', convId));
    if (!convSnap.exists() || convSnap.data().userId !== uid) {
      throw new Error('Conversation not found.');
    }
    const cd = convSnap.data();
    const conversation: Conversation = {
      id: convSnap.id,
      user_id: cd.userId,
      title: cd.title,
      is_saved: Boolean(cd.is_saved),
      message_count: Number(cd.message_count || 0),
      created_at: tsToIso(cd.createdAt),
      updated_at: tsToIso(cd.updatedAt),
    };

    const msgQ = query(collection(db, 'conversations', convId, 'messages'), where('userId', '==', uid));
    const msgSnap = await getDocs(msgQ);
    const messages: ChatMessage[] = msgSnap.docs
      .map((m) => {
        const md = m.data();
        return {
          id: m.id,
          conversation_id: convId,
          role: md.role,
          content: md.content,
          structured: md.structured || null,
          evidence_level: md.evidence_level || 'none',
          warning_text: md.warning_text || '',
          citations: md.citations || [],
          created_at: tsToIso(md.createdAt),
        };
      })
      .sort((a, b) => {
        const cmp = a.created_at.localeCompare(b.created_at);
        if (cmp !== 0) return cmp;
        if (a.role === 'user' && b.role === 'assistant') return -1;
        if (a.role === 'assistant' && b.role === 'user') return 1;
        return 0;
      });

    return { conversation, messages };
  } catch (err) {
    if (err instanceof Error && err.message === 'Conversation not found.') throw err;
    handleFirestoreError(err, OperationType.GET, convPath);
  }
}

export async function saveChatExchangeDocs(params: {
  uid: string;
  conversationId: string | null;
  userQuestion: string;
  assistantMessage: Omit<ChatMessage, 'id' | 'conversation_id' | 'created_at'>;
}): Promise<{ conversationId: string; userMessageId: string; assistantMessageId: string }> {
  const { uid, userQuestion, assistantMessage } = params;
  let convId = params.conversationId;
  const path = convId ? `conversations/${convId}/messages` : 'conversations';

  try {
    const batch = writeBatch(db);

    if (!convId) {
      const convRef = doc(collection(db, 'conversations'));
      convId = convRef.id;
      const autoTitle =
        userQuestion.length > 64 ? `${userQuestion.slice(0, 61)}...` : userQuestion;
      batch.set(convRef, {
        userId: uid,
        title: autoTitle.slice(0, 140),
        is_saved: false,
        message_count: 2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const convRef = doc(db, 'conversations', convId);
      batch.update(convRef, {
        message_count: increment(2),
        updatedAt: serverTimestamp(),
      });
    }

    const userMsgRef = doc(collection(db, 'conversations', convId, 'messages'));
    batch.set(userMsgRef, {
      userId: uid,
      conversationId: convId,
      role: 'user',
      content: userQuestion.slice(0, 25000),
      evidence_level: 'none',
      warning_text: '',
      citations: [],
      createdAt: serverTimestamp(),
    });

    const assistantMsgRef = doc(collection(db, 'conversations', convId, 'messages'));
    batch.set(assistantMsgRef, {
      userId: uid,
      conversationId: convId,
      role: 'assistant',
      content: (assistantMessage.content || '').slice(0, 25000) || 'No content returned.',
      structured: assistantMessage.structured || null,
      evidence_level: assistantMessage.evidence_level || 'none',
      warning_text: (assistantMessage.warning_text || '').slice(0, 1000),
      citations: (assistantMessage.citations || []).slice(0, 20),
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return {
      conversationId: convId,
      userMessageId: userMsgRef.id,
      assistantMessageId: assistantMsgRef.id,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateConversationDoc(
  convId: string,
  patch: Partial<{ title: string; is_saved: boolean }>
): Promise<void> {
  const path = `conversations/${convId}`;
  try {
    const payload: Record<string, any> = { updatedAt: serverTimestamp() };
    if (typeof patch.title === 'string' && patch.title.trim()) {
      payload.title = patch.title.trim().slice(0, 140);
    }
    if (typeof patch.is_saved === 'boolean') {
      payload.is_saved = patch.is_saved;
    }
    await updateDoc(doc(db, 'conversations', convId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteConversationDoc(uid: string, convId: string): Promise<void> {
  const path = `conversations/${convId}`;
  try {
    const msgQ = query(
      collection(db, 'conversations', convId, 'messages'),
      where('userId', '==', uid)
    );
    const msgSnap = await getDocs(msgQ);
    const batch = writeBatch(db);
    msgSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'conversations', convId));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ---------- Compliance Checklists & Items ----------

export async function listChecklistsDocs(uid: string): Promise<Checklist[]> {
  const path = 'checklists';
  try {
    const q = query(collection(db, 'checklists'), where('userId', '==', uid));
    const snap = await getDocs(q);

    const lists: Checklist[] = await Promise.all(
      snap.docs.map(async (clDoc) => {
        const cd = clDoc.data();
        const itemsQ = query(collection(db, 'checklists', clDoc.id, 'items'), where('userId', '==', uid));
        const itemSnap = await getDocs(itemsQ);
        const items: ChecklistItem[] = itemSnap.docs
          .map((itDoc) => {
            const idata = itDoc.data();
            return {
              id: itDoc.id,
              checklist_id: clDoc.id,
              title: idata.title,
              description: idata.description || '',
              applicable_business_type: idata.applicable_business_type || 'General',
              authority_name: idata.authority_name || 'Official Authority',
              source_document_id: idata.source_document_id ?? null,
              source_chunk_id: idata.source_chunk_id ?? null,
              citation_label: idata.citation_label || '',
              source_document_title: idata.source_document_title || '',
              source_document_url: idata.source_document_url || '',
              source_page_number: idata.source_page_number ?? undefined,
              source_section_title: idata.source_section_title || '',
              source_is_superseded: Boolean(idata.source_is_superseded),
              status: (idata.status as ChecklistStatus) || 'not_started',
              is_user_created: Boolean(idata.is_user_created),
              notes: idata.notes || '',
              last_reviewed_at: idata.last_reviewed_at || tsToIso(idata.updatedAt),
              updated_at: tsToIso(idata.updatedAt),
            };
          })
          .sort((a, b) => Number(a.is_user_created) - Number(b.is_user_created) || a.id.localeCompare(b.id));

        return {
          id: clDoc.id,
          user_id: cd.userId,
          business_profile_id: uid,
          title: cd.title,
          created_at: tsToIso(cd.createdAt),
          updated_at: tsToIso(cd.updatedAt),
          items,
        };
      })
    );
    return lists.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createChecklistDocs(
  uid: string,
  title: string,
  items: Array<Omit<ChecklistItem, 'id' | 'checklist_id' | 'last_reviewed_at' | 'updated_at'>> = []
): Promise<Checklist> {
  const path = 'checklists';
  try {
    const clRef = doc(collection(db, 'checklists'));
    const batch = writeBatch(db);
    batch.set(clRef, {
      userId: uid,
      title: title.trim().slice(0, 180) || 'Compliance Checklist',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const today = new Date().toISOString().slice(0, 10);
    const createdItems: ChecklistItem[] = [];

    for (const item of items) {
      const itemRef = doc(collection(db, 'checklists', clRef.id, 'items'));
      const itemDoc = {
        userId: uid,
        checklistId: clRef.id,
        title: (item.title || '').slice(0, 180) || 'Compliance Task',
        description: (item.description || '').slice(0, 800),
        applicable_business_type: (item.applicable_business_type || 'General').slice(0, 80),
        authority_name: (item.authority_name || 'Official Authority').slice(0, 80),
        source_document_id: Number.isFinite(Number(item.source_document_id)) && item.source_document_id !== null
          ? Math.trunc(Number(item.source_document_id))
          : null,
        source_chunk_id: Number.isFinite(Number(item.source_chunk_id)) && item.source_chunk_id !== null
          ? Math.trunc(Number(item.source_chunk_id))
          : null,
        citation_label: (item.citation_label || '').slice(0, 300),
        source_document_title: (item.source_document_title || '').slice(0, 240),
        source_document_url: (item.source_document_url || '').slice(0, 500),
        source_page_number: Number.isFinite(Number(item.source_page_number)) && item.source_page_number !== null
          ? Math.trunc(Number(item.source_page_number))
          : null,
        source_section_title: (item.source_section_title || '').slice(0, 200),
        source_is_superseded: Boolean(item.source_is_superseded),
        status: item.status || 'not_started',
        is_user_created: Boolean(item.is_user_created),
        notes: (item.notes || '').slice(0, 800),
        last_reviewed_at: today,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      batch.set(itemRef, itemDoc);
      createdItems.push({
        id: itemRef.id,
        checklist_id: clRef.id,
        title: itemDoc.title,
        description: itemDoc.description,
        applicable_business_type: itemDoc.applicable_business_type,
        authority_name: itemDoc.authority_name,
        source_document_id: itemDoc.source_document_id,
        source_chunk_id: itemDoc.source_chunk_id,
        citation_label: itemDoc.citation_label,
        source_document_title: itemDoc.source_document_title,
        source_document_url: itemDoc.source_document_url,
        source_page_number: itemDoc.source_page_number ?? undefined,
        source_section_title: itemDoc.source_section_title,
        source_is_superseded: itemDoc.source_is_superseded,
        status: itemDoc.status as ChecklistStatus,
        is_user_created: itemDoc.is_user_created,
        notes: itemDoc.notes,
        last_reviewed_at: today,
        updated_at: new Date().toISOString(),
      });
    }

    await batch.commit();
    return {
      id: clRef.id,
      user_id: uid,
      business_profile_id: uid,
      title: title.trim().slice(0, 180) || 'Compliance Checklist',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: createdItems,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function addChecklistItemDoc(
  uid: string,
  checklistId: string,
  input: { title: string; description: string; authority_name: string }
): Promise<ChecklistItem> {
  const path = `checklists/${checklistId}/items`;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const itemRef = doc(collection(db, 'checklists', checklistId, 'items'));
    const payload = {
      userId: uid,
      checklistId,
      title: input.title.trim().slice(0, 180),
      description: (input.description.trim() || 'User-created compliance task').slice(0, 800),
      applicable_business_type: 'Custom',
      authority_name: (input.authority_name.trim() || 'Personal Task').slice(0, 80),
      status: 'not_started' as const,
      is_user_created: true,
      notes: '',
      last_reviewed_at: today,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const batch = writeBatch(db);
    batch.set(itemRef, payload);
    batch.update(doc(db, 'checklists', checklistId), { updatedAt: serverTimestamp() });
    await batch.commit();

    return {
      id: itemRef.id,
      checklist_id: checklistId,
      title: payload.title,
      description: payload.description,
      applicable_business_type: payload.applicable_business_type,
      authority_name: payload.authority_name,
      source_document_id: null,
      source_chunk_id: null,
      citation_label: '',
      status: 'not_started',
      is_user_created: true,
      notes: '',
      last_reviewed_at: today,
      updated_at: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateChecklistItemDoc(
  checklistId: string,
  itemId: string,
  patch: Partial<{ status: ChecklistStatus; notes: string; title: string }>
): Promise<void> {
  const path = `checklists/${checklistId}/items/${itemId}`;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const payload: Record<string, any> = {
      last_reviewed_at: today,
      updatedAt: serverTimestamp(),
    };
    if (patch.status) payload.status = patch.status;
    if (typeof patch.notes === 'string') payload.notes = patch.notes.slice(0, 800);
    if (typeof patch.title === 'string' && patch.title.trim()) {
      payload.title = patch.title.trim().slice(0, 180);
    }

    const batch = writeBatch(db);
    batch.update(doc(db, 'checklists', checklistId, 'items', itemId), payload);
    batch.update(doc(db, 'checklists', checklistId), { updatedAt: serverTimestamp() });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteChecklistItemDoc(checklistId: string, itemId: string): Promise<void> {
  const path = `checklists/${checklistId}/items/${itemId}`;
  try {
    await deleteDoc(doc(db, 'checklists', checklistId, 'items', itemId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ---------- Saved Research ----------

export async function listSavedItemsDocs(
  uid: string,
  folder = 'All',
  search = ''
): Promise<SavedItem[]> {
  const path = 'saved_items';
  try {
    const q = query(collection(db, 'saved_items'), where('userId', '==', uid));
    const snap = await getDocs(q);
    const items: SavedItem[] = snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          user_id: d.userId,
          item_type: d.item_type,
          item_reference_id: d.item_reference_id,
          folder_name: d.folder_name,
          title: d.title,
          excerpt: d.excerpt || '',
          notes: d.notes || '',
          created_at: tsToIso(d.createdAt),
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    return items.filter((it) => {
      if (folder !== 'All' && it.folder_name !== folder) return false;
      if (search.trim()) {
        const ql = search.trim().toLowerCase();
        return (
          it.title.toLowerCase().includes(ql) ||
          it.excerpt.toLowerCase().includes(ql) ||
          it.notes.toLowerCase().includes(ql)
        );
      }
      return true;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createSavedItemDoc(
  uid: string,
  input: {
    item_type: 'conversation' | 'answer' | 'citation' | 'document';
    item_reference_id: string | number;
    folder_name?: string;
    title: string;
    excerpt?: string;
    notes?: string;
  }
): Promise<SavedItem> {
  const path = 'saved_items';
  try {
    const ref = doc(collection(db, 'saved_items'));
    const data = {
      userId: uid,
      item_type: input.item_type,
      item_reference_id: String(input.item_reference_id).slice(0, 128),
      folder_name: (input.folder_name || 'General Research').trim().slice(0, 80),
      title: input.title.trim().slice(0, 200),
      excerpt: (input.excerpt || '').slice(0, 1500),
      notes: (input.notes || '').slice(0, 1000),
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, data);
    return {
      id: ref.id,
      user_id: uid,
      item_type: data.item_type,
      item_reference_id: data.item_reference_id,
      folder_name: data.folder_name,
      title: data.title,
      excerpt: data.excerpt,
      notes: data.notes,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateSavedItemDoc(
  id: string,
  patch: { folder_name?: string; notes?: string }
): Promise<void> {
  const path = `saved_items/${id}`;
  try {
    const payload: Record<string, any> = {};
    if (patch.folder_name) payload.folder_name = patch.folder_name.trim().slice(0, 80);
    if (typeof patch.notes === 'string') payload.notes = patch.notes.slice(0, 1000);
    await updateDoc(doc(db, 'saved_items', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteSavedItemDoc(id: string): Promise<void> {
  const path = `saved_items/${id}`;
  try {
    await deleteDoc(doc(db, 'saved_items', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ---------- Feedback ----------

export async function submitFeedbackDoc(
  uid: string,
  email: string,
  input: { rating: 'helpful' | 'not_helpful' | 'inaccurate' | 'outdated' | 'general'; message_id?: string; comment?: string }
): Promise<void> {
  const path = 'feedback';
  try {
    const ref = doc(collection(db, 'feedback'));
    await setDoc(ref, {
      userId: uid,
      user_email: email.slice(0, 180),
      message_id: (input.message_id || '').slice(0, 128),
      rating: input.rating,
      comment: (input.comment || '').trim().slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function listAllFeedbackDocs(): Promise<any[]> {
  const path = 'feedback';
  try {
    const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      created_at: tsToIso(d.data().createdAt),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

// ---------- Data Export & Permanent Account Deletion ----------

export async function exportUserWorkspaceData(uid: string) {
  const [userSnap, profile, conversations, checklists, savedItems] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getBusinessProfileDoc(uid),
    listConversationsDocs(uid),
    listChecklistsDocs(uid),
    listSavedItemsDocs(uid),
  ]);

  const fullConversations = await Promise.all(
    conversations.map(async (c) => {
      const detail = await getConversationMessagesDocs(uid, c.id);
      return { ...c, messages: detail.messages };
    })
  );

  return {
    exported_at: new Date().toISOString(),
    user: userSnap.exists() ? userSnap.data() : null,
    business_profile: profile,
    conversations: fullConversations,
    checklists,
    saved_items: savedItems,
  };
}

export async function deleteUserWorkspaceData(uid: string): Promise<void> {
  const conversations = await listConversationsDocs(uid);
  for (const conv of conversations) {
    await deleteConversationDoc(uid, conv.id);
  }

  const checklists = await listChecklistsDocs(uid);
  for (const cl of checklists) {
    for (const item of cl.items) {
      await deleteDoc(doc(db, 'checklists', cl.id, 'items', item.id));
    }
    await deleteDoc(doc(db, 'checklists', cl.id));
  }

  const saved = await listSavedItemsDocs(uid);
  for (const s of saved) {
    await deleteDoc(doc(db, 'saved_items', s.id));
  }

  await deleteDoc(doc(db, 'business_profiles', uid)).catch(() => {});
  await deleteDoc(doc(db, 'users', uid)).catch(() => {});
}
