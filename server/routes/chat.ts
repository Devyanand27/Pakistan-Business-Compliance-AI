import express from 'express';
import { hasAnyAiProvider } from '../config/env.js';
import { retrieveRelevantChunks } from '../rag/retriever.js';
import { logAudit, requireAuth } from '../security/auth.js';
import { sanitizeTextInput } from '../security/ssrf.js';
import { AiProviderError } from '../services/aiProvider.js';
import { generateGroundedComplianceAnswer } from '../services/gemini.js';

const router = express.Router();

function formatStructuredMarkdown(payload: any): string {
  const parts: string[] = [];
  if (payload.short_answer) {
    parts.push(`**Direct Answer**\n${payload.short_answer}`);
  }
  if (payload.detailed_explanation) {
    parts.push(`**Detailed Explanation**\n${payload.detailed_explanation}`);
  }
  if (Array.isArray(payload.step_by_step_guidance) && payload.step_by_step_guidance.length > 0) {
    parts.push(
      `**Step-by-Step Guidance**\n${payload.step_by_step_guidance
        .map((s: string, i: number) => `${i + 1}. ${s}`)
        .join('\n')}`
    );
  }
  if (Array.isArray(payload.conditions_and_exceptions) && payload.conditions_and_exceptions.length > 0) {
    parts.push(
      `**Conditions & Exceptions**\n${payload.conditions_and_exceptions.map((s: string) => `- ${s}`).join('\n')}`
    );
  }
  if (Array.isArray(payload.what_you_may_need) && payload.what_you_may_need.length > 0) {
    parts.push(
      `**What You May Need**\n${payload.what_you_may_need.map((s: string) => `- ${s}`).join('\n')}`
    );
  }
  if (Array.isArray(payload.important_considerations) && payload.important_considerations.length > 0) {
    parts.push(
      `**Important Considerations**\n${payload.important_considerations.map((s: string) => `- ${s}`).join('\n')}`
    );
  }
  return parts.join('\n\n');
}

router.post('/chat', requireAuth, async (req, res) => {
  try {
    const uid = req.user!.uid;
    const question = sanitizeTextInput(req.body?.question, 2000);
    const authorityFilter = sanitizeTextInput(req.body?.authority_code, 30);
    const language = req.body?.language === 'ur' ? 'ur' : 'en';

    const businessProfile =
      req.body?.business_profile && typeof req.body.business_profile === 'object'
        ? req.body.business_profile
        : null;

    const historyRows = Array.isArray(req.body?.conversation_history)
      ? req.body.conversation_history
          .filter(
            (m: any) =>
              m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
          )
          .slice(-6)
          .map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: sanitizeTextInput(m.content, 800),
          }))
      : [];

    if (!question || question.length < 3) {
      res.status(400).json({ error: 'Please enter a valid compliance question.' });
      return;
    }

    if (!hasAnyAiProvider()) {
      res.status(503).json({
        code: 'AI_PROVIDER_UNAVAILABLE',
        error:
          'No AI provider key (GEMINI_API_KEY or OPENROUTER_API_KEY) is configured on the server. Configure an AI provider key in environment secrets to run grounded RAG queries.',
      });
      return;
    }

    const retrieval = await retrieveRelevantChunks({
      query: question,
      topK: 8,
      authorityCode: authorityFilter || undefined,
    });

    const { data: answerPayload, meta: providerMeta } = await generateGroundedComplianceAnswer({
      question,
      language,
      businessProfile,
      conversationHistory: historyRows,
      retrievedChunks: retrieval.chunks,
    });

    // Strictly validate citations against retrieved official document chunks
    const chunkMap = new Map(retrieval.chunks.map((c) => [c.chunk_id, c]));
    const validatedCitations = (answerPayload.citations || []).filter((c) => chunkMap.has(c.chunk_id));

    const topScore = retrieval.chunks[0]?.score || 0;
    const hasSuperseded = validatedCitations.some((c) => chunkMap.get(c.chunk_id)?.is_superseded);

    let evidenceLevel: 'strong' | 'moderate' | 'insufficient' = 'insufficient';
    if (!answerPayload.insufficient_evidence && validatedCitations.length >= 2 && topScore >= 0.35) {
      evidenceLevel = 'strong';
    } else if (!answerPayload.insufficient_evidence && validatedCitations.length >= 1) {
      evidenceLevel = 'moderate';
    }

    const warningMessages: string[] = [];
    if (hasSuperseded) {
      warningMessages.push(
        'One or more retrieved records are marked as historical/superseded. Verify current active regulations before filing.'
      );
    }
    if (answerPayload.conflict_detected && answerPayload.conflict_summary) {
      warningMessages.push(`Source Conflict Flagged: ${answerPayload.conflict_summary}`);
    }
    const warningText = warningMessages.join(' ');
    const markdownContent = formatStructuredMarkdown(answerPayload);

    const seenPairs = new Set<string>();
    const formattedCitations: any[] = [];
    for (const cit of validatedCitations) {
      const chunk = chunkMap.get(cit.chunk_id)!;
      const key = `${chunk.document_id}:${chunk.chunk_id}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      formattedCitations.push({
        id: chunk.chunk_id,
        document_id: chunk.document_id,
        chunk_id: chunk.chunk_id,
        citation_text: sanitizeTextInput(cit.quote, 320),
        page_number: chunk.page_number,
        section_reference: cit.section_reference || chunk.section_title,
        document_title: chunk.document_title,
        source_url: chunk.source_url,
        document_type: chunk.document_type,
        publication_date: chunk.publication_date,
        effective_date: chunk.effective_date,
        version: chunk.version,
        is_superseded: chunk.is_superseded,
        verification_status: chunk.verification_status,
        authority_name: chunk.authority_name,
        authority_code: chunk.authority_name.includes('SECP')
          ? 'SECP'
          : chunk.authority_name.includes('Federal Board')
          ? 'FBR'
          : chunk.authority_name.includes('Sindh')
          ? 'SRB'
          : 'OFFICIAL',
      });
    }

    logAudit(
      uid,
      'RAG_CHAT_QUERY',
      'chat',
      '',
      `Chunks: ${retrieval.chunks.length}, Evidence: ${evidenceLevel}, Provider: ${providerMeta.provider_used}`
    );

    res.json({
      assistant_message: {
        role: 'assistant',
        content: markdownContent,
        structured: {
          ...answerPayload,
          retrieval_mode: retrieval.retrievalMode,
          provider_meta: providerMeta,
          disclaimer:
            'Informational assistance grounded in indexed official publications. This is not formal legal, accounting, or tax advice.',
        },
        evidence_level: evidenceLevel,
        warning_text: warningText,
        citations: formattedCitations,
      },
      provider_meta: providerMeta,
      retrieved_chunks_count: retrieval.chunks.length,
    });
  } catch (err) {
    console.error('[RAG Chat Error]', (err as Error).message);
    if (err instanceof AiProviderError) {
      res.status(err.status).json({
        code: err.code,
        error: err.message,
      });
      return;
    }
    res.status(502).json({
      code: 'AI_PROVIDER_ERROR',
      error: `Unable to generate grounded response: ${(err as Error).message}`,
    });
  }
});

export default router;
