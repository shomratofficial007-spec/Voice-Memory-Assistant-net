import test from "node:test";
import assert from "node:assert/strict";
import { handleApiRequest } from "./[[path]].js";

test("OPTIONS /api/assistant/chat returns 204 CORS preflight", async () => {
  const req = new Request("https://example.com/api/assistant/chat", {
    method: "OPTIONS",
  });
  const res = await handleApiRequest(req, {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
});

test("POST /api/assistant/chat/ (with trailing slash) matches route", async () => {
  const req = new Request("https://example.com/api/assistant/chat/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Hello" }),
  });
  const res = await handleApiRequest(req, {});
  // Without API key, it should return 503 (not 404!)
  assert.equal(res.status, 503);
  const data = (await res.json()) as { code?: string };
  assert.equal(data.code, "AI_NOT_CONFIGURED");
});

test("POST /api/unknown returns 404", async () => {
  const req = new Request("https://example.com/api/unknown", {
    method: "POST",
  });
  const res = await handleApiRequest(req, {});
  assert.equal(res.status, 404);
  const data = (await res.json()) as { error?: string };
  assert.equal(data.error, "Endpoint not found.");
});

test("GET /api/assistant/chat returns 405 Method Not Allowed", async () => {
  const req = new Request("https://example.com/api/assistant/chat", {
    method: "GET",
  });
  const res = await handleApiRequest(req, {});
  assert.equal(res.status, 405);
});

test("POST /api/assistant/chat with invalid payload returns 400", async () => {
  const req = new Request("https://example.com/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "" }),
  });
  const res = await handleApiRequest(req, { OPENROUTER_API_KEY: "test-key" });
  assert.equal(res.status, 400);
});

test("POST /api/assistant/chat streams response when configured", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr.includes("openrouter.ai")) {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"হ্যালো"}}]}\n\n')
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }
    return originalFetch(url);
  }) as typeof fetch;

  try {
    const req = new Request("https://example.com/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "কেমন আছেন?" }),
    });
    const res = await handleApiRequest(req, { OPENROUTER_API_KEY: "test-key" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "text/event-stream");

    const text = await res.text();
    assert.ok(text.includes('{"content":"হ্যালো"}'));
    assert.ok(text.includes("[DONE]"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
