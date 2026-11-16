import { GoogleGenAI, Schema } from '@google/genai';
import crypto from 'node:crypto';
import {
  getServerConfig,
  hasGeminiKey,
  hasOpenRouterKey,
} from '../config/env.js';

export type AiProviderName = 'gemini' | 'openrouter';

export interface AiGenerationMeta {
  provider_used: AiProviderName;
  model_used: string;
  fallback_triggered: boolean;
  fallback_reason?: string;
  cached?: boolean;
}

export interface StructuredAiResult<T> {
  data: T;
  meta: AiGenerationMeta;
}

export class AiProviderError extends Error {
  status: number;
  code: string;
  provider?: AiProviderName;
  retryable: boolean;
  credentialOrConfigError: boolean;

  constructor(
    message: string,
    opts: {
      status?: number;
      code?: string;
      provider?: AiProviderName;
      retryable?: boolean;
      credentialOrConfigError?: boolean;
    } = {}
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.status = opts.status ?? 502;
    this.code = opts.code ?? 'AI_PROVIDER_ERROR';
    this.provider = opts.provider;
    this.retryable = Boolean(opts.retryable);
    this.credentialOrConfigError = Boolean(opts.credentialOrConfigError);
  }
}

export interface AiProviderTestHooks {
  geminiGenerate?: (args: {
    model: string;
    systemInstruction: string;
    userPrompt: string;
    responseSchema?: Schema;
  }) => Promise<string>;
  openrouterFetch?: typeof fetch;
}

let testHooks: AiProviderTestHooks = {};

export function setAiProviderTestHooks(hooks: AiProviderTestHooks | null): void {
  testHooks = hooks || {};
}

interface CachedResponseEntry {
  data: unknown;
  meta: AiGenerationMeta;
  expiresAt: number;
}

const RESPONSE_CACHE = new Map<string, CachedResponseEntry>();
const RESPONSE_CACHE_TTL_MS = 5 * 60 * 1000;
const RESPONSE_CACHE_MAX_ITEMS = 50;

export function clearAiResponseCache(): void {
  RESPONSE_CACHE.clear();
  MODEL_CATALOG_CACHE = null;
}

let MODEL_CATALOG_CACHE: {
  models: Map<string, { id: string; outputModalities: string[]; supportedParameters: string[] }>;
  expiresAt: number;
} | null = null;
const MODEL_CATALOG_TTL_MS = 10 * 60 * 1000;

export function truncateContextPrompt(text: string, maxChars?: number): string {
  const limit = maxChars ?? getServerConfig().aiMaxContextChars;
  if (text.length <= limit) return text;
  const notice = '\n\n[Additional lower-ranked regulatory context truncated to respect model context limits.]';
  return `${text.slice(0, Math.max(500, limit - notice.length))}${notice}`;
}

function getErrorStatus(err: unknown): number | undefined {
  const anyErr = err as any;
  if (typeof anyErr?.status === 'number') return anyErr.status;
  if (typeof anyErr?.statusCode === 'number') return anyErr.statusCode;
  if (typeof anyErr?.response?.status === 'number') return anyErr.response.status;
  const msg = String(anyErr?.message || '');
  const match = msg.match(/\b(400|401|402|403|404|408|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : undefined;
}

function classifyProviderError(err: unknown, provider: AiProviderName): AiProviderError {
  if (err instanceof AiProviderError) return err;

  const status = getErrorStatus(err);
  const msg = String((err as Error)?.message || err || 'Unknown AI provider error');
  const lower = msg.toLowerCase();

  // Credential, authentication, or model configuration issues — NEVER silently mask
  if (
    status === 401 ||
    status === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid_api_key') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthorized') ||
    lower.includes('authentication credentials') ||
    lower.includes('api_key_missing')
  ) {
    return new AiProviderError(
      `${provider === 'gemini' ? 'Gemini' : 'OpenRouter'} API authentication failed. Verify the server API key configuration.`,
      {
        status: 502,
        code: 'AI_INVALID_CREDENTIALS',
        provider,
        retryable: false,
        credentialOrConfigError: true,
      }
    );
  }

  if (
    status === 404 ||
    lower.includes('model_not_found') ||
    lower.includes('is not found for api version') ||
    lower.includes('no endpoints found')
  ) {
    return new AiProviderError(
      `${provider === 'gemini' ? 'Gemini' : 'OpenRouter'} model configuration error: ${msg.slice(0, 180)}`,
      {
        status: 502,
        code: 'AI_INVALID_MODEL',
        provider,
        retryable: false,
        credentialOrConfigError: true,
      }
    );
  }

  // Quota exhaustion or rate limiting — eligible for fallback
  if (
    status === 429 ||
    status === 402 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    return new AiProviderError(
      `${provider === 'gemini' ? 'Gemini' : 'OpenRouter'} quota or rate limit reached (HTTP ${status || 429}).`,
      {
        status: 429,
        code: 'AI_QUOTA_EXCEEDED',
        provider,
        retryable: false,
        credentialOrConfigError: false,
      }
    );
  }

  // Timeout or transient network/server outage — retryable & eligible for fallback
  if (
    status === 408 ||
    (status !== undefined && status >= 500 && status <= 504) ||
    lower.includes('timeout') ||
    lower.includes('aborted') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed') ||
    lower.includes('network')
  ) {
    return new AiProviderError(
      `${provider === 'gemini' ? 'Gemini' : 'OpenRouter'} temporary service interruption: ${msg.slice(0, 160)}`,
      {
        status: 503,
        code: 'AI_TRANSIENT_OUTAGE',
        provider,
        retryable: true,
        credentialOrConfigError: false,
      }
    );
  }

  if (status === 400 || lower.includes('invalid json')) {
    return new AiProviderError(
      `${provider === 'gemini' ? 'Gemini' : 'OpenRouter'} rejected the request or returned invalid structured output.`,
      {
        status: 502,
        code: 'AI_BAD_RESPONSE',
        provider,
        retryable: false,
        credentialOrConfigError: true,
      }
    );
  }

  return new AiProviderError(`${provider} error: ${msg.slice(0, 180)}`, {
    status: 502,
    code: 'AI_PROVIDER_ERROR',
    provider,
    retryable: false,
    credentialOrConfigError: false,
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function extractJsonFromText(rawText: string): unknown {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    throw new Error('Invalid JSON: empty AI response.');
  }

  // Direct parse first
  try {
    return JSON.parse(trimmed);
  } catch {
    // Strip markdown code fences if present
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // Fall through to bracket extraction
      }
    }

    const firstObj = trimmed.indexOf('{');
    const firstArr = trimmed.indexOf('[');
    let startIdx = -1;
    let closeChar = '}';
    if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
      startIdx = firstArr;
      closeChar = ']';
    } else if (firstObj !== -1) {
      startIdx = firstObj;
      closeChar = '}';
    }
    const endIdx = trimmed.lastIndexOf(closeChar);
    if (startIdx !== -1 && endIdx > startIdx) {
      return JSON.parse(trimmed.slice(startIdx, endIdx + 1));
    }

    throw new Error('Invalid JSON returned by AI model.');
  }
}

function getGeminiClient(): GoogleGenAI {
  if (!hasGeminiKey()) {
    throw new AiProviderError('GEMINI_API_KEY_MISSING: Gemini API key is not configured.', {
      status: 503,
      code: 'GEMINI_KEY_MISSING',
      provider: 'gemini',
      credentialOrConfigError: true,
    });
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function callGeminiStructured<T>(params: {
  systemInstruction: string;
  userPrompt: string;
  responseSchema?: Schema;
  timeoutMs: number;
}): Promise<{ data: T; modelUsed: string }> {
  const cfg = getServerConfig();
  const prompt = truncateContextPrompt(params.userPrompt, cfg.aiMaxContextChars);

  if (testHooks.geminiGenerate) {
    const raw = await withTimeout(
      testHooks.geminiGenerate({
        model: cfg.llmModel,
        systemInstruction: params.systemInstruction,
        userPrompt: prompt,
        responseSchema: params.responseSchema,
      }),
      params.timeoutMs,
      'Gemini request'
    );
    return { data: extractJsonFromText(raw) as T, modelUsed: cfg.llmModel };
  }

  const ai = getGeminiClient();
  const response = await withTimeout(
    ai.models.generateContent({
      model: cfg.llmModel,
      contents: prompt,
      config: {
        systemInstruction: params.systemInstruction,
        responseMimeType: 'application/json',
        ...(params.responseSchema ? { responseSchema: params.responseSchema } : {}),
      },
    }),
    params.timeoutMs,
    'Gemini generateContent'
  );

  const rawText = (response.text || '').trim();
  return {
    data: extractJsonFromText(rawText) as T,
    modelUsed: cfg.llmModel,
  };
}

export async function validateOpenRouterModel(modelId: string): Promise<void> {
  if (modelId === 'openrouter/free') return;

  const fetchImpl = testHooks.openrouterFetch || fetch;
  const now = Date.now();
  if (!MODEL_CATALOG_CACHE || MODEL_CATALOG_CACHE.expiresAt < now) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetchImpl('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });
      if (!resp.ok) {
        // Do not break runtime if catalog endpoint has transient outage
        console.warn(`[OpenRouter Catalog] Skipping strict model validation (HTTP ${resp.status}).`);
        return;
      }
      const json = (await resp.json()) as { data?: Array<any> };
      const map = new Map<string, { id: string; outputModalities: string[]; supportedParameters: string[] }>();
      for (const m of json?.data || []) {
        if (m?.id) {
          map.set(m.id, {
            id: m.id,
            outputModalities: Array.isArray(m.architecture?.output_modalities)
              ? m.architecture.output_modalities
              : ['text'],
            supportedParameters: Array.isArray(m.supported_parameters) ? m.supported_parameters : [],
          });
        }
      }
      MODEL_CATALOG_CACHE = { models: map, expiresAt: now + MODEL_CATALOG_TTL_MS };
    } catch (err) {
      console.warn('[OpenRouter Catalog] Could not reach /api/v1/models; continuing directly:', (err as Error).message);
      return;
    } finally {
      clearTimeout(timer);
    }
  }

  const found = MODEL_CATALOG_CACHE.models.get(modelId);
  if (!found) {
    throw new AiProviderError(
      `OPENROUTER_MODEL_NOT_FOUND: Configured OPENROUTER_MODEL "${modelId}" was not found in OpenRouter's active model catalog.`,
      {
        status: 502,
        code: 'AI_INVALID_MODEL',
        provider: 'openrouter',
        credentialOrConfigError: true,
      }
    );
  }
  if (found.outputModalities.length > 0 && !found.outputModalities.includes('text')) {
    throw new AiProviderError(
      `OPENROUTER_UNSUPPORTED_MODEL: Model "${modelId}" does not support text chat completions.`,
      {
        status: 502,
        code: 'AI_INVALID_MODEL',
        provider: 'openrouter',
        credentialOrConfigError: true,
      }
    );
  }
}

async function callOpenRouterStructured<T>(params: {
  systemInstruction: string;
  userPrompt: string;
  schemaHint: string;
  expectArray?: boolean;
  timeoutMs: number;
}): Promise<{ data: T; modelUsed: string }> {
  const cfg = getServerConfig();
  if (!hasOpenRouterKey()) {
    throw new AiProviderError('OPENROUTER_API_KEY_MISSING: OpenRouter API key is not configured.', {
      status: 503,
      code: 'OPENROUTER_KEY_MISSING',
      provider: 'openrouter',
      credentialOrConfigError: true,
    });
  }

  await validateOpenRouterModel(cfg.openrouterModel);

  const prompt = truncateContextPrompt(params.userPrompt, cfg.aiMaxContextChars);
  const fetchImpl = testHooks.openrouterFetch || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);

  const strictSystem = `${params.systemInstruction}

STRICT OUTPUT FORMAT REQUIREMENT:
Return ONLY valid JSON matching the exact schema below. Do NOT wrap the JSON in markdown fences or add prose before/after the JSON.
Expected JSON structure:
${params.schemaHint}`;

  try {
    const body: Record<string, any> = {
      model: cfg.openrouterModel,
      messages: [
        { role: 'system', content: strictSystem },
        { role: 'user', content: prompt },
      ],
      max_tokens: cfg.aiMaxOutputTokens,
      temperature: 0.1,
    };

    if (!params.expectArray) {
      body.response_format = { type: 'json_object' };
    }

    const resp = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': cfg.appUrl,
        'X-Title': 'Pakistan Business Compliance AI',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      let parsedMsg = errText;
      try {
        const j = JSON.parse(errText);
        parsedMsg = j?.error?.message || j?.message || errText;
      } catch {
        // Keep raw snippet
      }
      const err = new Error(`OpenRouter HTTP ${resp.status}: ${parsedMsg.slice(0, 220)}`);
      (err as any).status = resp.status;
      throw err;
    }

    const json = (await resp.json()) as any;
    const rawContent = json?.choices?.[0]?.message?.content;
    const text =
      typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
        ? rawContent.map((p: any) => p?.text || '').join('')
        : '';

    const parsed = extractJsonFromText(text) as T;
    const actualModel = typeof json?.model === 'string' && json.model ? json.model : cfg.openrouterModel;
    return { data: parsed, modelUsed: actualModel };
  } finally {
    clearTimeout(timer);
  }
}

async function runWithRetry<T>(
  fn: () => Promise<T>,
  provider: AiProviderName
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const classified = classifyProviderError(err, provider);
    if (classified.retryable) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return await fn();
    }
    throw classified;
  }
}

function logSanitizedProviderError(provider: AiProviderName, err: AiProviderError): void {
  console.error(
    `[AI Provider Error] provider=${provider} code=${err.code} status=${err.status} credential_or_config=${err.credentialOrConfigError} message=${err.message}`
  );
}

export async function generateStructuredJson<T>(params: {
  taskName: 'rag_chat' | 'summarize' | 'compare' | 'checklist';
  systemInstruction: string;
  userPrompt: string;
  responseSchema?: Schema;
  openrouterSchemaHint: string;
  expectArray?: boolean;
  cacheKey?: string;
  normalize?: (raw: any) => T;
}): Promise<StructuredAiResult<T>> {
  const cfg = getServerConfig();

  if (params.cacheKey) {
    const key = `${cfg.aiProvider}:${cfg.llmModel}:${cfg.openrouterModel}:${params.taskName}:${crypto
      .createHash('sha256')
      .update(params.cacheKey)
      .digest('hex')}`;
    const hit = RESPONSE_CACHE.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return {
        data: hit.data as T,
        meta: { ...hit.meta, cached: true },
      };
    }
  }

  const saveCache = (result: StructuredAiResult<T>) => {
    if (!params.cacheKey) return;
    if (RESPONSE_CACHE.size >= RESPONSE_CACHE_MAX_ITEMS) {
      const oldestKey = RESPONSE_CACHE.keys().next().value;
      if (oldestKey) RESPONSE_CACHE.delete(oldestKey);
    }
    const key = `${cfg.aiProvider}:${cfg.llmModel}:${cfg.openrouterModel}:${params.taskName}:${crypto
      .createHash('sha256')
      .update(params.cacheKey)
      .digest('hex')}`;
    RESPONSE_CACHE.set(key, {
      data: result.data,
      meta: result.meta,
      expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
    });
  };

  const normalizeData = (raw: any): T => (params.normalize ? params.normalize(raw) : (raw as T));

  // Mode 1: OpenRouter explicitly enforced
  if (cfg.aiProvider === 'openrouter') {
    try {
      const res = await runWithRetry(
        () =>
          callOpenRouterStructured<T>({
            systemInstruction: params.systemInstruction,
            userPrompt: params.userPrompt,
            schemaHint: params.openrouterSchemaHint,
            expectArray: params.expectArray,
            timeoutMs: cfg.aiRequestTimeoutMs,
          }),
        'openrouter'
      );
      const output: StructuredAiResult<T> = {
        data: normalizeData(res.data),
        meta: {
          provider_used: 'openrouter',
          model_used: res.modelUsed,
          fallback_triggered: false,
        },
      };
      saveCache(output);
      return output;
    } catch (err) {
      const classified = classifyProviderError(err, 'openrouter');
      logSanitizedProviderError('openrouter', classified);
      throw classified;
    }
  }

  // Mode 2: Gemini explicitly enforced, OR Auto mode with Gemini configured
  if (cfg.aiProvider === 'gemini' || hasGeminiKey()) {
    try {
      const res = await runWithRetry(
        () =>
          callGeminiStructured<T>({
            systemInstruction: params.systemInstruction,
            userPrompt: params.userPrompt,
            responseSchema: params.responseSchema,
            timeoutMs: cfg.aiRequestTimeoutMs,
          }),
        'gemini'
      );
      const output: StructuredAiResult<T> = {
        data: normalizeData(res.data),
        meta: {
          provider_used: 'gemini',
          model_used: res.modelUsed,
          fallback_triggered: false,
        },
      };
      saveCache(output);
      return output;
    } catch (err) {
      const classified = classifyProviderError(err, 'gemini');
      logSanitizedProviderError('gemini', classified);

      // Do NOT silently mask broken credentials, invalid models, or invalid requests
      if (classified.credentialOrConfigError || cfg.aiProvider === 'gemini' || !hasOpenRouterKey()) {
        throw classified;
      }

      // Eligible auto-fallback: quota exhaustion (429), transient outage (500-504), or timeout
      console.warn(
        `[AI Failover] Gemini failed (${classified.code}); failing over to OpenRouter model "${cfg.openrouterModel}".`
      );
      try {
        const fbRes = await runWithRetry(
          () =>
            callOpenRouterStructured<T>({
              systemInstruction: params.systemInstruction,
              userPrompt: params.userPrompt,
              schemaHint: params.openrouterSchemaHint,
              expectArray: params.expectArray,
              timeoutMs: cfg.aiRequestTimeoutMs,
            }),
          'openrouter'
        );
        const output: StructuredAiResult<T> = {
          data: normalizeData(fbRes.data),
          meta: {
            provider_used: 'openrouter',
            model_used: fbRes.modelUsed,
            fallback_triggered: true,
            fallback_reason: classified.code,
          },
        };
        saveCache(output);
        return output;
      } catch (fbErr) {
        const fbClassified = classifyProviderError(fbErr, 'openrouter');
        logSanitizedProviderError('openrouter', fbClassified);
        throw new AiProviderError(
          `Both Gemini (${classified.code}) and fallback OpenRouter (${fbClassified.code}) failed: ${fbClassified.message}`,
          {
            status: fbClassified.status === 429 ? 429 : 503,
            code: 'AI_ALL_PROVIDERS_FAILED',
            provider: 'openrouter',
            credentialOrConfigError: fbClassified.credentialOrConfigError,
          }
        );
      }
    }
  }

  // Mode 3: Auto mode where GEMINI_API_KEY is absent, use OpenRouter if configured
  if (hasOpenRouterKey()) {
    try {
      const res = await runWithRetry(
        () =>
          callOpenRouterStructured<T>({
            systemInstruction: params.systemInstruction,
            userPrompt: params.userPrompt,
            schemaHint: params.openrouterSchemaHint,
            expectArray: params.expectArray,
            timeoutMs: cfg.aiRequestTimeoutMs,
          }),
        'openrouter'
      );
      const output: StructuredAiResult<T> = {
        data: normalizeData(res.data),
        meta: {
          provider_used: 'openrouter',
          model_used: res.modelUsed,
          fallback_triggered: false,
        },
      };
      saveCache(output);
      return output;
    } catch (err) {
      const classified = classifyProviderError(err, 'openrouter');
      logSanitizedProviderError('openrouter', classified);
      throw classified;
    }
  }

  throw new AiProviderError(
    'No server AI provider key is configured. Set GEMINI_API_KEY and/or OPENROUTER_API_KEY in server secrets.',
    {
      status: 503,
      code: 'AI_PROVIDER_UNAVAILABLE',
      credentialOrConfigError: true,
    }
  );
}
