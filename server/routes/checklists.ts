import express from 'express';
import { retrieveRelevantChunks } from '../rag/retriever.js';
import { logAudit, requireAuth } from '../security/auth.js';
import { sanitizeTextInput } from '../security/ssrf.js';
import { generateChecklistFromEvidence, hasGeminiKey } from '../services/gemini.js';

const router = express.Router();

router.post('/checklists/generate', requireAuth, async (req, res) => {
  try {
    const profile = req.body?.business_profile;
    const focusTopic = sanitizeTextInput(req.body?.focus_topic, 200);
    const customTitle = sanitizeTextInput(req.body?.title, 140);
    const language = req.body?.language === 'ur' ? 'ur' : 'en';

    if (!profile || typeof profile !== 'object' || !profile.business_type || !profile.province) {
      res.status(400).json({
        error: 'Please complete your Business Profile first so the checklist can be tailored to your structure and province.',
      });
      return;
    }

    if (!hasGeminiKey()) {
      res.status(503).json({
        code: 'AI_PROVIDER_UNAVAILABLE',
        error: 'GEMINI_API_KEY is not configured on the server to generate grounded compliance checklists.',
      });
      return;
    }

    const queryText = `${profile.business_type} ${profile.province} ${profile.business_activity || ''} ${
      profile.provides_services ? 'services sales tax SRB' : ''
    } ${profile.sells_goods ? 'goods sales tax STRN FBR' : ''} ${focusTopic || 'registration filing compliance'}`;

    const retrieval = await retrieveRelevantChunks({
      query: queryText,
      topK: 10,
    });

    if (retrieval.chunks.length === 0) {
      res.status(422).json({
        error: 'Insufficient indexed official documents matched this profile to generate a verified checklist.',
      });
      return;
    }

    const generated = await generateChecklistFromEvidence({
      businessProfile: profile,
      focusTopic,
      retrievedChunks: retrieval.chunks,
      language,
    });

    const chunkMap = new Map(retrieval.chunks.map((c) => [c.chunk_id, c]));
    const verifiedItems = generated.filter((item) => chunkMap.has(item.chunk_id));

    if (verifiedItems.length === 0) {
      res.status(422).json({
        error: 'Could not verify generated checklist items against indexed official document chunks.',
      });
      return;
    }

    const title =
      customTitle ||
      `${profile.business_type} — ${focusTopic || `${profile.province} Compliance Roadmap`}`;

    const items = verifiedItems.map((item) => {
      const chunk = chunkMap.get(item.chunk_id)!;
      return {
        title: sanitizeTextInput(item.title, 180),
        description: sanitizeTextInput(item.description, 800),
        applicable_business_type: sanitizeTextInput(item.applicable_business_type, 80),
        authority_name: sanitizeTextInput(item.authority_name, 80),
        source_document_id: chunk.document_id,
        source_chunk_id: chunk.chunk_id,
        citation_label: `${chunk.document_title} (${chunk.section_title}, Page ${chunk.page_number})`,
        source_document_title: chunk.document_title,
        source_document_url: chunk.source_url,
        source_page_number: chunk.page_number,
        source_section_title: chunk.section_title,
        source_is_superseded: Boolean(chunk.is_superseded),
        status: 'not_started',
        is_user_created: false,
        notes: '',
      };
    });

    logAudit(req.user!.uid, 'CHECKLIST_GENERATE', 'checklist', '', `Items: ${items.length}`);
    res.status(200).json({ title, items });
  } catch (err) {
    console.error('[Checklist Generate Error]', (err as Error).message);
    res.status(502).json({ error: `Checklist generation failed: ${(err as Error).message}` });
  }
});

export default router;
