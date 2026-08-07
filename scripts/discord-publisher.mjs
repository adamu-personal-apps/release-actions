function redact(value, webhook) {
  return String(value).replaceAll(webhook, "[REDACTED]");
}

function warning(code, message, webhook) {
  return {
    ok: false,
    warning: {
      code,
      message: redact(message, webhook),
    },
  };
}

function webhookUrl(webhook, search) {
  if (!webhook) {
    return null;
  }
  try {
    const url = new URL(webhook);
    if (url.protocol !== "https:") {
      return null;
    }
    for (const [name, value] of Object.entries(search)) {
      url.searchParams.set(name, value);
    }
    return url.toString();
  } catch {
    return null;
  }
}

async function sendDiscordMessage({
  content,
  fetchImpl = globalThis.fetch,
  search,
  threadName,
  webhook,
}) {
  const endpoint = webhookUrl(webhook, search);
  if (!endpoint || !content) {
    return warning(
      "missing_configuration",
      "Discord publishing skipped because the webhook or message is missing.",
      webhook,
    );
  }

  const payload = {
    allowed_mentions: { parse: [] },
    content,
    ...(threadName ? { thread_name: threadName } : {}),
  };
  let response;
  try {
    response = await fetchImpl(endpoint, {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json; charset=utf-8" },
      method: "POST",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return warning(
      "transport_error",
      `Discord webhook request failed: ${detail}`,
      webhook,
    );
  }

  if (!response.ok) {
    return warning(
      "http_error",
      `Discord webhook returned HTTP ${response.status}.`,
      webhook,
    );
  }

  try {
    return { ok: true, response: JSON.parse(await response.text()) };
  } catch {
    return warning(
      "invalid_response",
      "Discord webhook returned an invalid JSON response.",
      webhook,
    );
  }
}

export async function openDiscordThread({
  content,
  fetchImpl,
  threadName,
  webhook,
}) {
  const result = await sendDiscordMessage({
    content,
    fetchImpl,
    search: { wait: "true" },
    threadName,
    webhook,
  });
  if (!result.ok) {
    return result;
  }
  if (typeof result.response?.channel_id !== "string" || !result.response.channel_id) {
    return warning(
      "missing_thread_id",
      "Discord accepted the root message without returning a thread ID.",
      webhook,
    );
  }
  return { ok: true, threadId: result.response.channel_id };
}

export async function postDiscordReply({
  content,
  fetchImpl,
  threadId,
  webhook,
}) {
  if (!threadId) {
    return warning(
      "missing_thread_id",
      "Discord reply skipped because the root thread ID is missing.",
      webhook,
    );
  }
  const result = await sendDiscordMessage({
    content,
    fetchImpl,
    search: { thread_id: threadId },
    webhook,
  });
  return result.ok ? { ok: true, threadId } : result;
}
