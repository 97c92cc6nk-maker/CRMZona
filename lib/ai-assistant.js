'use strict';

const crypto = require('crypto');

const DEFAULT_OPENAI_MODEL = 'gpt-5';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MEMORY_ENDPOINT = 'https://memory.tdai.tencentyun.com';
const DEFAULT_MEMORY_VERSION = 'v3';
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2500;
const RETRY_MAX_OUTPUT_TOKENS = 6000;
const DEFAULT_OPENAI_REASONING_EFFORT = 'low';
const DEFAULT_OPENAI_TEXT_VERBOSITY = 'low';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_APP_CONTEXT_CHARS = 9000;
const MAX_MEMORY_CHARS = 5000;
const MAX_CAPTURE_CHARS = 6000;

class AssistantRequestError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'AssistantRequestError';
    this.status = status;
    this.details = details;
  }
}

function resolveAssistantConfig(env = process.env) {
  const memoryVersion = normalizeMemoryVersion(firstEnv(env, [
    'TENCENT_MEMORY_API_VERSION',
    'TENCENTDB_MEMORY_API_VERSION',
    'TENCENTDB_AGENT_MEMORY_API_VERSION',
    'TDAI_MEMORY_API_VERSION',
  ]));
  const rawMemoryEndpoint = firstEnv(env, [
    'TENCENT_MEMORY_ENDPOINT',
    'TENCENTDB_MEMORY_ENDPOINT',
    'TENCENTDB_AGENT_MEMORY_ENDPOINT',
    'TDAI_MEMORY_ENDPOINT',
  ]) || DEFAULT_MEMORY_ENDPOINT;
  const memoryEndpoint = normalizeMemoryEndpoint(rawMemoryEndpoint, memoryVersion);
  const memoryApiKey = firstEnv(env, [
    'TENCENT_MEMORY_API_KEY',
    'TENCENTDB_MEMORY_API_KEY',
    'TENCENTDB_AGENT_MEMORY_API_KEY',
    'TDAI_MEMORY_API_KEY',
  ]);
  const memoryServiceId = firstEnv(env, [
    'TENCENT_MEMORY_SERVICE_ID',
    'TENCENTDB_MEMORY_SERVICE_ID',
    'TENCENTDB_AGENT_MEMORY_SERVICE_ID',
    'TDAI_MEMORY_SERVICE_ID',
  ]);
  const memoryTeamId = firstEnv(env, [
    'TENCENT_MEMORY_TEAM_ID',
    'TENCENTDB_MEMORY_TEAM_ID',
    'TENCENTDB_AGENT_MEMORY_TEAM_ID',
    'TDAI_MEMORY_TEAM_ID',
  ]) || 'crmzona';
  const memoryAgentId = firstEnv(env, [
    'TENCENT_MEMORY_AGENT_ID',
    'TENCENTDB_MEMORY_AGENT_ID',
    'TENCENTDB_AGENT_MEMORY_AGENT_ID',
    'TDAI_MEMORY_AGENT_ID',
  ]) || 'crmzona-assistant';

  const memory = {
    endpoint: memoryEndpoint,
    apiKey: memoryApiKey,
    serviceId: memoryServiceId,
    teamId: memoryTeamId,
    agentId: memoryAgentId,
    apiVersion: memoryVersion,
    timeoutMs: clampInteger(env.TENCENT_MEMORY_TIMEOUT_MS || env.TENCENTDB_MEMORY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 3000, 60000),
  };
  memory.configured = Boolean(memory.endpoint && memory.apiKey && memory.serviceId);
  memory.missing = [
    memory.endpoint ? '' : 'TENCENT_MEMORY_ENDPOINT',
    memory.apiKey ? '' : 'TENCENT_MEMORY_API_KEY',
    memory.serviceId ? '' : 'TENCENT_MEMORY_SERVICE_ID',
  ].filter(Boolean);

  const openAiModel = trim(env.OPENAI_MODEL || env.AI_ASSISTANT_MODEL) || DEFAULT_OPENAI_MODEL;
  const openAi = {
    apiKey: trim(env.OPENAI_API_KEY),
    baseUrl: normalizeEndpoint(env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL),
    model: openAiModel,
    timeoutMs: clampInteger(env.OPENAI_TIMEOUT_MS || env.AI_ASSISTANT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 5000, 120000),
    maxOutputTokens: clampInteger(
      env.OPENAI_MAX_OUTPUT_TOKENS || env.AI_ASSISTANT_MAX_OUTPUT_TOKENS,
      DEFAULT_MAX_OUTPUT_TOKENS,
      128,
      RETRY_MAX_OUTPUT_TOKENS,
    ),
    reasoningEffort: modelSupportsReasoning(openAiModel)
      ? normalizeReasoningEffort(env.OPENAI_REASONING_EFFORT || env.AI_ASSISTANT_REASONING_EFFORT, openAiModel)
      : '',
    textVerbosity: modelSupportsTextVerbosity(openAiModel)
      ? normalizeTextVerbosity(env.OPENAI_TEXT_VERBOSITY || env.AI_ASSISTANT_TEXT_VERBOSITY)
      : '',
  };

  return { openAi, memory };
}

function assistantStatus(env = process.env) {
  const config = resolveAssistantConfig(env);
  return {
    enabled: Boolean(config.openAi.apiKey),
    openAiConfigured: Boolean(config.openAi.apiKey),
    model: config.openAi.model,
    openAiBaseUrlHost: endpointHost(config.openAi.baseUrl),
    openAiTimeoutMs: config.openAi.timeoutMs,
    openAiMaxOutputTokens: config.openAi.maxOutputTokens,
    openAiReasoningEffort: config.openAi.reasoningEffort || null,
    openAiTextVerbosity: config.openAi.textVerbosity || null,
    tencentMemoryConfigured: config.memory.configured,
    memory: {
      provider: 'TencentDB Agent Memory',
      configured: config.memory.configured,
      apiVersion: config.memory.apiVersion,
      endpointHost: endpointHost(config.memory.endpoint),
      hasApiKey: Boolean(config.memory.apiKey),
      hasServiceId: Boolean(config.memory.serviceId),
      missing: config.memory.missing,
      teamId: config.memory.teamId,
      agentId: config.memory.agentId,
    },
  };
}

async function handleAssistantMessage({
  user,
  appContext = {},
  message,
  sessionId,
  fetchImpl = globalThis.fetch,
  env = process.env,
}) {
  const config = resolveAssistantConfig(env);
  const cleanMessage = normalizeAssistantMessage(message);
  const cleanSessionId = normalizeSessionId(sessionId, user);

  if (!config.openAi.apiKey) {
    throw new AssistantRequestError(503, 'AI-помощник не настроен: задайте OPENAI_API_KEY на сервере.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new AssistantRequestError(500, 'В этой среде недоступен fetch для AI-помощника.');
  }

  const memoryClient = createTencentMemoryClient(config.memory, fetchImpl);
  const memoryRecall = await memoryClient.recall(cleanMessage, {
    sessionId: cleanSessionId,
    userId: user?.id,
  });
  const prompt = buildAssistantPrompt({
    appContext,
    memoryRecall,
    message: cleanMessage,
    user,
  });
  const answer = await callOpenAiResponse(config.openAi, prompt, fetchImpl, user);
  const memoryCapture = await memoryClient.capture({
    assistantText: answer,
    sessionId: cleanSessionId,
    userId: user?.id,
    userText: cleanMessage,
  });

  return {
    ok: true,
    answer,
    sessionId: cleanSessionId,
    assistant: assistantStatus(env),
    memory: {
      configured: config.memory.configured,
      recall: publicMemoryRecall(memoryRecall),
      capture: memoryCapture,
    },
  };
}

function buildAssistantPrompt({ appContext = {}, memoryRecall = {}, message, user }) {
  const appContextText = trimToLength(
    typeof appContext === 'string' ? appContext : appContext.text || JSON.stringify(appContext || {}, null, 2),
    MAX_APP_CONTEXT_CHARS,
  );
  const memoryPrompt = formatMemoryPrompt(memoryRecall);
  const stableMemory = memoryPrompt.append ? `\n\n${memoryPrompt.append}` : '';
  const instructions = [
    'Ты AI-помощник CRMZona App для операционной CRM: графики, сотрудники, точки, заявки, задачи, отчеты, расходы и претензии.',
    'Отвечай по-русски, коротко и практически. Если нужен список действий, давай его в понятной очередности.',
    'Используй только тот контекст приложения, который сервер передал для текущего пользователя. Не выдумывай записи, права, суммы и статусы.',
    'Если данных в контексте не хватает, прямо скажи, чего не видно, и предложи следующий безопасный шаг внутри CRM.',
    'Не раскрывай секреты окружения, ключи API, пароли, служебные заголовки и скрытые поля. Не проси пользователя отправлять секреты в чат.',
    'Память TencentDB используй как подсказку о долгосрочных предпочтениях и прошлых разговорах; текущие данные CRM имеют приоритет.',
    stableMemory,
  ].filter(Boolean).join('\n');

  const input = [
    memoryPrompt.prepend || '',
    '<crm-context>',
    appContextText || 'Контекст CRM недоступен или пуст.',
    '</crm-context>',
    '<user-message>',
    message,
    '</user-message>',
  ].filter(Boolean).join('\n\n');

  return { instructions, input };
}

function createTencentMemoryClient(memoryConfig, fetchImpl = globalThis.fetch) {
  const config = memoryConfig?.memory ? memoryConfig.memory : memoryConfig;
  const configured = Boolean(config?.configured || (config?.endpoint && config?.apiKey && config?.serviceId));

  async function post(path, payload, options = {}) {
    if (!configured) {
      return { ok: false, skipped: true, reason: 'TencentDB Memory не настроена.' };
    }
    if (typeof fetchImpl !== 'function') {
      return { ok: false, skipped: true, reason: 'В этой среде недоступен fetch.' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs || DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${config.endpoint}/${config.apiVersion}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          'x-tdai-service-id': config.serviceId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const envelope = await readResponseJson(response);
      if (!response.ok) {
        throw new AssistantRequestError(
          response.status,
          tencentErrorMessage(envelope) || `TencentDB Memory вернула HTTP ${response.status}.`,
        );
      }
      return {
        ok: true,
        status: response.status,
        data: unwrapTencentEnvelope(envelope),
      };
    } catch (error) {
      if (options.required) throw error;
      return {
        ok: false,
        failed: true,
        reason: error.name === 'AbortError' ? 'TencentDB Memory не ответила вовремя.' : error.message,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function isolation(context = {}) {
    return {
      team_id: config.teamId || 'default',
      agent_id: config.agentId || 'crmzona-assistant',
      user_id: sanitizeIsolationId(context.userId) || 'default',
      ...(context.sessionId ? { session_id: context.sessionId } : {}),
    };
  }

  return {
    configured,
    async searchAtomic(query, context = {}) {
      return post('/atomic/search', {
        ...isolation(context),
        query: trimToLength(query, 1000),
        limit: clampInteger(context.limit, 5, 1, 10),
      });
    },
    async searchConversation(query, context = {}) {
      return post('/conversation/search', {
        ...isolation(context),
        query: trimToLength(query, 1000),
        limit: clampInteger(context.limit, 5, 1, 10),
      });
    },
    async readCore(context = {}) {
      return post('/core/read', isolation(context));
    },
    async listScenarios(context = {}) {
      return post('/scenario/ls', {
        ...isolation(context),
        file_path: trim(context.filePath),
      });
    },
    async readScenario(path, context = {}) {
      return post('/scenario/read', {
        ...isolation(context),
        file_path: trim(path),
      });
    },
    async recall(query, context = {}) {
      if (!configured) {
        return { configured: false, used: false, reason: 'TencentDB Memory не настроена.' };
      }
      const [atomic, core, scenarios] = await Promise.all([
        this.searchAtomic(query, { ...context, limit: 5 }),
        this.readCore(context),
        this.listScenarios(context),
      ]);
      return {
        configured: true,
        used: Boolean(atomic.ok || core.ok || scenarios.ok),
        atomic,
        core,
        scenarios,
      };
    },
    async capture({ userText, assistantText, sessionId, userId }) {
      if (!configured) {
        return { status: 'skipped', reason: 'TencentDB Memory не настроена.' };
      }
      const cleanUserText = cleanMemoryText(userText);
      const cleanAssistantText = cleanMemoryText(assistantText);
      if (!cleanUserText || !cleanAssistantText) {
        return { status: 'skipped', reason: 'Недостаточно чистого текста для записи в память.' };
      }
      const response = await post('/conversation/add', {
        ...isolation({ sessionId, userId }),
        messages: [
          { role: 'user', content: cleanUserText },
          { role: 'assistant', content: cleanAssistantText },
        ],
      });
      if (!response.ok) {
        return { status: 'failed', reason: response.reason || 'TencentDB Memory не приняла диалог.' };
      }
      return {
        status: 'captured',
        totalCount: Number(response.data?.total_count || response.data?.totalCount || 2),
      };
    },
  };
}

async function callOpenAiResponse(openAiConfig, prompt, fetchImpl, user) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), openAiConfig.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const payload = await createOpenAiResponse(openAiConfig, prompt, fetchImpl, user, controller.signal);
    let text = extractOpenAiText(payload);
    if (text) return text;

    if (shouldRetryOpenAiEmptyResponse(payload, openAiConfig)) {
      const retryConfig = {
        ...openAiConfig,
        maxOutputTokens: Math.min(RETRY_MAX_OUTPUT_TOKENS, Math.max(openAiConfig.maxOutputTokens * 2, 3500)),
        reasoningEffort: lowerReasoningEffort(openAiConfig.reasoningEffort),
      };
      const retryPayload = await createOpenAiResponse(retryConfig, prompt, fetchImpl, user, controller.signal);
      text = extractOpenAiText(retryPayload);
      if (text) return text;
      throw openAiEmptyResponseError(retryPayload, true);
    }

    if (!text) {
      throw openAiEmptyResponseError(payload, false);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AssistantRequestError(504, 'OpenAI API не ответил вовремя.');
    }
    if (isFetchNetworkError(error)) {
      throw new AssistantRequestError(
        502,
        'Сервер CRM не смог связаться с OpenAI API. Проверьте в Vercel переменную OPENAI_BASE_URL: если она задана, должно быть https://api.openai.com/v1. Затем повторите запрос.',
        openAiNetworkErrorDetails(error),
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function createOpenAiResponse(openAiConfig, prompt, fetchImpl, user, signal) {
  const response = await fetchImpl(`${openAiConfig.baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiConfig.apiKey}`,
    },
    body: JSON.stringify(openAiRequestBody(openAiConfig, prompt, user)),
    signal,
  });
  const payload = await readResponseJson(response);
  if (!response.ok) {
    throw new AssistantRequestError(
      response.status,
      openAiErrorMessage(payload, response.status) || `OpenAI API вернул HTTP ${response.status}.`,
      openAiErrorDetails(payload),
    );
  }
  if (payload?.status === 'failed' || payload?.error) {
    throw new AssistantRequestError(
      502,
      openAiErrorMessage(payload, 502) || 'OpenAI API не смог сформировать ответ.',
      openAiErrorDetails(payload),
    );
  }
  return payload;
}

function openAiRequestBody(openAiConfig, prompt, user) {
  const body = {
    model: openAiConfig.model,
    instructions: prompt.instructions,
    input: prompt.input,
    max_output_tokens: openAiConfig.maxOutputTokens,
    store: false,
    metadata: {
      app: 'crmzona',
      user_id: sanitizeMetadataValue(user?.id),
    },
    text: {
      format: { type: 'text' },
    },
  };
  if (openAiConfig.reasoningEffort) {
    body.reasoning = { effort: openAiConfig.reasoningEffort };
  }
  if (openAiConfig.textVerbosity) {
    body.text.verbosity = openAiConfig.textVerbosity;
  }
  return body;
}

function extractOpenAiText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.output_text === 'string') return payload.output_text.trim();
  if (Array.isArray(payload.output)) {
    const parts = [];
    for (const item of payload.output) {
      if (typeof item?.content === 'string') {
        parts.push(item.content);
        continue;
      }
      if (!Array.isArray(item?.content)) continue;
      for (const content of item.content) {
        if (typeof content?.text === 'string') parts.push(content.text);
        if (typeof content?.content === 'string') parts.push(content.content);
        if (typeof content?.refusal === 'string') parts.push(content.refusal);
      }
    }
    return parts.join('\n').trim();
  }
  if (Array.isArray(payload.choices)) {
    return payload.choices
      .map((choice) => choice?.message?.content || choice?.text || '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function formatMemoryPrompt(memoryRecall = {}) {
  if (!memoryRecall.configured || !memoryRecall.used) {
    return { prepend: '', append: '' };
  }

  const atomicItems = normalizeAtomicItems(memoryRecall.atomic?.data);
  const coreText = trimToLength(memoryRecall.core?.data?.content || memoryRecall.core?.data?.text || '', 1800);
  const scenarioEntries = normalizeScenarioEntries(memoryRecall.scenarios?.data);

  const prepend = atomicItems.length
    ? [
        '<relevant-memories>',
        ...atomicItems.slice(0, 5).map((item) => `- [${item.type || 'memory'}] ${item.content}`),
        '</relevant-memories>',
      ].join('\n')
    : '';

  const appendParts = [];
  if (coreText) {
    appendParts.push(['<user-profile>', coreText, '</user-profile>'].join('\n'));
  }
  if (scenarioEntries.length) {
    appendParts.push([
      '## Доступные сцены памяти TencentDB',
      ...scenarioEntries.slice(0, 10).map((entry) => `- ${entry.path}`),
    ].join('\n'));
  }

  return {
    prepend: trimToLength(prepend, MAX_MEMORY_CHARS),
    append: trimToLength(appendParts.join('\n\n'), MAX_MEMORY_CHARS),
  };
}

function normalizeAtomicItems(data) {
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items
    .map((item) => ({
      type: trim(item?.type || item?.category || item?.kind || 'memory'),
      content: trim(item?.content || item?.text || item?.summary || ''),
    }))
    .filter((item) => item.content)
    .map((item) => ({ ...item, content: trimToLength(item.content, 500) }));
}

function normalizeScenarioEntries(data) {
  const entries = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
  return entries
    .map((entry) => ({ path: trim(entry?.path || entry?.file_path || entry?.filePath || entry) }))
    .filter((entry) => entry.path);
}

function publicMemoryRecall(memoryRecall = {}) {
  if (!memoryRecall.configured) {
    return { used: false, reason: memoryRecall.reason || 'TencentDB Memory не настроена.' };
  }
  return {
    used: Boolean(memoryRecall.used),
    atomicOk: Boolean(memoryRecall.atomic?.ok),
    coreOk: Boolean(memoryRecall.core?.ok),
    scenariosOk: Boolean(memoryRecall.scenarios?.ok),
    atomicCount: normalizeAtomicItems(memoryRecall.atomic?.data).length,
    scenarioCount: normalizeScenarioEntries(memoryRecall.scenarios?.data).length,
    failedReason: [memoryRecall.atomic, memoryRecall.core, memoryRecall.scenarios]
      .map((item) => item?.reason)
      .filter(Boolean)
      .slice(0, 2)
      .join(' '),
  };
}

function normalizeAssistantMessage(value) {
  const text = trim(value);
  if (!text) {
    throw new AssistantRequestError(400, 'Введите сообщение для AI-помощника.');
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new AssistantRequestError(413, `Сообщение слишком длинное. Максимум ${MAX_MESSAGE_LENGTH} символов.`);
  }
  return text;
}

function normalizeSessionId(value, user) {
  const text = trim(value);
  if (/^[a-zA-Z0-9:_-]{8,160}$/.test(text)) return text;
  const userId = sanitizeIsolationId(user?.id) || 'user';
  return `crmzona:${userId}:${crypto.randomUUID()}`;
}

function cleanMemoryText(value) {
  return trimToLength(trim(value)
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/data:[a-z0-9/+.-]+;base64,[a-z0-9+/=\s]+/gi, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim(), MAX_CAPTURE_CHARS);
}

function sanitizeIsolationId(value) {
  return trim(value).replace(/[^a-zA-Z0-9:_@.-]/g, '_').slice(0, 120);
}

function sanitizeMetadataValue(value) {
  return trim(value).replace(/[^a-zA-Z0-9:_@.-]/g, '_').slice(0, 64);
}

function normalizeMemoryVersion(value) {
  const text = trim(value || DEFAULT_MEMORY_VERSION).toLowerCase();
  return /^v\d+$/.test(text) ? text : DEFAULT_MEMORY_VERSION;
}

function normalizeMemoryEndpoint(value, apiVersion) {
  const endpoint = normalizeEndpoint(value);
  const suffix = `/${apiVersion}`;
  return endpoint.toLowerCase().endsWith(suffix) ? endpoint.slice(0, -suffix.length) : endpoint;
}

function normalizeEndpoint(value) {
  return trim(value).replace(/\/+$/, '');
}

function firstEnv(env, names) {
  for (const name of names) {
    const value = trim(env?.[name]);
    if (value) return value;
  }
  return '';
}

function modelSupportsReasoning(model) {
  const text = trim(model).toLowerCase();
  return /^gpt-5(\b|[.-])/.test(text) || /^o\d/.test(text) || /^o[.-]/.test(text);
}

function modelSupportsTextVerbosity(model) {
  return /^gpt-5(\b|[.-])/.test(trim(model).toLowerCase());
}

function normalizeReasoningEffort(value, model) {
  const requested = trim(value || DEFAULT_OPENAI_REASONING_EFFORT).toLowerCase();
  const modelText = trim(model).toLowerCase();
  if (modelText.includes('gpt-5-pro')) return 'high';
  if (/^gpt-5\.1(\b|[.-])/.test(modelText) && requested === 'minimal') return 'low';
  if (requested === 'none' && !/^gpt-5\.1(\b|[.-])/.test(modelText)) return DEFAULT_OPENAI_REASONING_EFFORT;
  return ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(requested)
    ? requested
    : DEFAULT_OPENAI_REASONING_EFFORT;
}

function normalizeTextVerbosity(value) {
  const requested = trim(value || DEFAULT_OPENAI_TEXT_VERBOSITY).toLowerCase();
  return ['low', 'medium', 'high'].includes(requested) ? requested : DEFAULT_OPENAI_TEXT_VERBOSITY;
}

function lowerReasoningEffort(value) {
  if (value === 'high' || value === 'medium') return 'low';
  if (value === 'low') return 'minimal';
  return value || DEFAULT_OPENAI_REASONING_EFFORT;
}

function endpointHost(value) {
  try {
    return value ? new URL(value).host : '';
  } catch {
    return value ? 'custom-endpoint' : '';
  }
}

function trim(value) {
  return String(value ?? '').trim();
}

function trimToLength(value, maxLength) {
  const text = trim(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function clampInteger(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

async function readResponseJson(response) {
  if (response && typeof response.text === 'function') {
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
  if (response && typeof response.json === 'function') {
    return response.json();
  }
  return {};
}

function unwrapTencentEnvelope(payload) {
  if (!payload || typeof payload !== 'object') return {};
  if (Object.prototype.hasOwnProperty.call(payload, 'code') && Number(payload.code) !== 0) {
    throw new AssistantRequestError(502, tencentErrorMessage(payload) || 'TencentDB Memory вернула ошибку.');
  }
  return Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
}

function tencentErrorMessage(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return trim(payload.message || payload.msg || payload.error || payload.error_message);
}

function openAiErrorMessage(payload, status) {
  if (!payload || typeof payload !== 'object') return '';
  const code = trim(payload.error?.code || payload.code);
  const type = trim(payload.error?.type || payload.type);
  if (status === 429 && /insufficient_quota|quota|credits?/i.test(`${code} ${type}`)) {
    return 'На OpenAI API Platform не хватает кредитов или квоты для этого API-ключа. Пополните баланс/лимит именно в проекте OpenAI API, который привязан к OPENAI_API_KEY.';
  }
  return trim(payload.error?.message || payload.message || payload.error_description || payload.error);
}

function openAiErrorDetails(payload) {
  if (!payload?.error || typeof payload.error !== 'object') return undefined;
  return Object.entries(payload.error)
    .filter(([key]) => key !== 'message')
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
}

function shouldRetryOpenAiEmptyResponse(payload, openAiConfig) {
  return openAiIncompleteReason(payload).includes('token') && openAiConfig.maxOutputTokens < RETRY_MAX_OUTPUT_TOKENS;
}

function openAiIncompleteReason(payload) {
  return trim(payload?.incomplete_details?.reason || payload?.incompleteDetails?.reason).toLowerCase();
}

function openAiEmptyResponseError(payload, retried) {
  const reason = openAiIncompleteReason(payload);
  const details = openAiResponseDetails(payload, retried);
  if (reason.includes('token')) {
    return new AssistantRequestError(
      502,
      'OpenAI остановил ответ по лимиту max_output_tokens до появления текста. Увеличьте OPENAI_MAX_OUTPUT_TOKENS или снизьте OPENAI_REASONING_EFFORT в Vercel.',
      details,
    );
  }
  return new AssistantRequestError(
    502,
    'OpenAI API вернул ответ без текста. Повторите запрос короче или обновите настройки модели.',
    details,
  );
}

function openAiResponseDetails(payload, retried) {
  const outputTypes = Array.isArray(payload?.output)
    ? payload.output.map((item) => trim(item?.type)).filter(Boolean).slice(0, 6)
    : [];
  const contentTypes = Array.isArray(payload?.output)
    ? payload.output
      .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
      .map((content) => trim(content?.type))
      .filter(Boolean)
      .slice(0, 6)
    : [];
  const usage = payload?.usage && typeof payload.usage === 'object' ? payload.usage : {};
  return [
    retried ? 'retry: true' : '',
    payload?.status ? `status: ${payload.status}` : '',
    openAiIncompleteReason(payload) ? `incomplete_reason: ${openAiIncompleteReason(payload)}` : '',
    Number.isFinite(usage.output_tokens) ? `output_tokens: ${usage.output_tokens}` : '',
    Number.isFinite(usage.output_tokens_details?.reasoning_tokens)
      ? `reasoning_tokens: ${usage.output_tokens_details.reasoning_tokens}`
      : '',
    outputTypes.length ? `output_types: ${outputTypes.join(',')}` : '',
    contentTypes.length ? `content_types: ${contentTypes.join(',')}` : '',
  ].filter(Boolean);
}

function isFetchNetworkError(error) {
  return error instanceof TypeError && /fetch|network|terminated|econn|enotfound|etimedout|tls/i.test(`${error.message} ${error.cause?.code || ''}`);
}

function openAiNetworkErrorDetails(error) {
  return [
    error.cause?.code ? `code: ${error.cause.code}` : '',
    error.cause?.name ? `cause: ${error.cause.name}` : '',
  ].filter(Boolean);
}

module.exports = {
  AssistantRequestError,
  assistantStatus,
  buildAssistantPrompt,
  cleanMemoryText,
  createTencentMemoryClient,
  extractOpenAiText,
  handleAssistantMessage,
  resolveAssistantConfig,
};
