const DEFAULT_ENDPOINT = 'https://slack.com/api/chat.postMessage';

function redact(value, token) {
  let safe = String(value);
  if (token) safe = safe.replaceAll(token, '[REDACTED]');
  return safe.replace(/xox[a-z]-[a-z0-9-]+/giu, '[REDACTED]');
}

function warning(code, message, token) {
  return {
    ok: false,
    warning: {
      code,
      message: redact(message, token),
    },
  };
}

function missingConfiguration({ token, channel, text }) {
  if (!token) return 'Slack publishing skipped because the bot token is missing.';
  if (!channel) return 'Slack publishing skipped because the channel ID is missing.';
  if (!text) return 'Slack publishing skipped because the message text is empty.';
  return null;
}

function safeSlackError(value) {
  if (typeof value !== 'string') return 'unknown_error';
  return /^[a-z0-9_]+$/iu.test(value) ? value : 'unknown_error';
}

async function sendMessage({
  token,
  channel,
  text,
  threadTs,
  endpoint = DEFAULT_ENDPOINT,
  fetchImpl = globalThis.fetch,
}) {
  const configurationError = missingConfiguration({ token, channel, text });
  if (configurationError) {
    return warning('missing_configuration', configurationError, token);
  }

  const body = {
    channel,
    text,
    mrkdwn: false,
    link_names: false,
    unfurl_links: false,
    unfurl_media: false,
  };
  if (threadTs) body.thread_ts = threadTs;

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return warning(
      'transport_error',
      `Slack chat.postMessage request failed: ${detail}`,
      token,
    );
  }

  if (!response.ok) {
    return warning(
      'http_error',
      `Slack chat.postMessage returned HTTP ${response.status}.`,
      token,
    );
  }

  let result;
  try {
    result = JSON.parse(await response.text());
  } catch {
    return warning(
      'invalid_response',
      'Slack chat.postMessage returned an invalid JSON response.',
      token,
    );
  }

  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return warning(
      'invalid_response',
      'Slack chat.postMessage returned an invalid JSON response.',
      token,
    );
  }

  if (result.ok !== true) {
    return warning(
      'slack_api_error',
      `Slack chat.postMessage failed: ${safeSlackError(result.error)}.`,
      token,
    );
  }

  return {
    ok: true,
    channel: typeof result.channel === 'string' && result.channel
      ? result.channel
      : channel,
    messageTs: typeof result.ts === 'string' ? result.ts : '',
  };
}

export async function openSlackThread(options) {
  const result = await sendMessage(options);
  if (!result.ok) return result;
  if (!result.messageTs) {
    return warning(
      'missing_thread_ts',
      'Slack accepted the root message without returning a thread timestamp.',
      options.token,
    );
  }

  return {
    ok: true,
    channel: result.channel,
    threadTs: result.messageTs,
  };
}

export async function postSlackReply(options) {
  if (!options.threadTs) {
    return warning(
      'missing_thread_ts',
      'Slack reply skipped because the root thread timestamp is missing.',
      options.token,
    );
  }

  const result = await sendMessage(options);
  if (!result.ok) return result;
  if (!result.messageTs) {
    return warning(
      'missing_message_ts',
      'Slack accepted the reply without returning its message timestamp.',
      options.token,
    );
  }

  return {
    ok: true,
    channel: result.channel,
    threadTs: options.threadTs,
    messageTs: result.messageTs,
  };
}
