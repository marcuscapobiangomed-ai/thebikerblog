#!/usr/bin/env node
import assert from "node:assert/strict";
import { ProviderClients } from "./src/ai/provider-clients.js";
import { AIProvider } from "./src/gemini.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.DEEPSEEK_API_KEY;
const originalMaxTokens = process.env.DEEPSEEK_MAX_TOKENS;
const originalTimeout = process.env.AI_HTTP_TIMEOUT_MS;

const requests = [];
globalThis.fetch = async (_url, init) => {
  requests.push(JSON.parse(init.body));
  return new Response(JSON.stringify({
    model: "deepseek-v4-flash",
    choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
  }), { status: 200, headers: { "content-type": "application/json" } });
};

try {
  const clients = new ProviderClients({
    DEEPSEEK_API_KEY: "test-key",
    DEEPSEEK_MAX_TOKENS: "14000",
    AI_HTTP_TIMEOUT_MS: "90000",
  });
  await clients.generate("deepseek", "system", "user", { maxTokens: 1600, attempts: 1 });
  assert.equal(requests.at(-1).max_tokens, 1600, "limite da etapa deve prevalecer sobre o teto global");

  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_MAX_TOKENS = "14000";
  process.env.AI_HTTP_TIMEOUT_MS = "90000";
  const runtime = {
    assertDeepSeekBudget: async () => ({}),
    addDeepSeekCost: async () => ({ cost: 0, budget: { spent: 0 } }),
    record: async () => {},
  };
  const legacy = new AIProvider({ pipeline: { runtime } });
  await legacy._tryDeepSeek("system", "user", { maxTokens: 2500 });
  assert.equal(requests.at(-1).max_tokens, 2500, "cliente legado deve respeitar o limite da etapa");

  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: "{\"partial\":" }, finish_reason: "length" }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  await assert.rejects(
    () => clients.generate("deepseek", "system", "user", { maxTokens: 20, attempts: 1 }),
    /resposta truncada/,
  );
  await assert.rejects(
    () => legacy._tryDeepSeek("system", "user", { maxTokens: 20 }),
    /resposta truncada/,
  );
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = originalKey;
  if (originalMaxTokens === undefined) delete process.env.DEEPSEEK_MAX_TOKENS;
  else process.env.DEEPSEEK_MAX_TOKENS = originalMaxTokens;
  if (originalTimeout === undefined) delete process.env.AI_HTTP_TIMEOUT_MS;
  else process.env.AI_HTTP_TIMEOUT_MS = originalTimeout;
}

console.log("DeepSeek request resilience tests passed.");
