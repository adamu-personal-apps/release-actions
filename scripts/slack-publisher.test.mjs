import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  openSlackThread,
  postSlackReply,
} from './slack-publisher.mjs';

const TOKEN = 'xoxb-test-only-secret';
const CHANNEL = 'C_RELEASES';

const servers = new Set();

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve) => {
    server.close(resolve);
  })));
  servers.clear();
});

async function startFakeSlack(responder) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let rawBody = '';
    for await (const chunk of request) rawBody += chunk;
    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      rawBody,
      body: JSON.parse(rawBody),
    });
    await responder({ request, response, requests });
  });
  servers.add(server);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    endpoint: `http://127.0.0.1:${address.port}/api/chat.postMessage`,
    requests,
  };
}

function jsonResponse(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

describe('openSlackThread', () => {
  it('posts only the required root-message fields and captures its timestamp', async () => {
    const fake = await startFakeSlack(({ response }) => {
      jsonResponse(response, 200, {
        ok: true,
        channel: CHANNEL,
        ts: '1750000000.000100',
      });
    });

    const result = await openSlackThread({
      token: TOKEN,
      channel: CHANNEL,
      text: 'ShotStep v0.1.8\nCoach says "work on the third-shot drop."',
      endpoint: fake.endpoint,
    });

    expect(result).toEqual({
      ok: true,
      channel: CHANNEL,
      threadTs: '1750000000.000100',
    });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/chat.postMessage',
      body: {
        channel: CHANNEL,
        text: 'ShotStep v0.1.8\nCoach says "work on the third-shot drop."',
        mrkdwn: false,
        link_names: false,
        unfurl_links: false,
        unfurl_media: false,
      },
    });
    expect(Object.keys(fake.requests[0].body).sort()).toEqual([
      'channel',
      'link_names',
      'mrkdwn',
      'text',
      'unfurl_links',
      'unfurl_media',
    ]);
    expect(fake.requests[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(fake.requests[0].headers['content-type'])
      .toBe('application/json; charset=utf-8');
    expect(fake.requests[0].rawBody).toContain('\\"work on the third-shot drop.\\"');
    expect(fake.requests[0].rawBody).toContain('\\n');
  });

  it('returns a structured warning when a successful response has no parent timestamp', async () => {
    const fake = await startFakeSlack(({ response }) => {
      jsonResponse(response, 200, { ok: true, channel: CHANNEL });
    });

    await expect(openSlackThread({
      token: TOKEN,
      channel: CHANNEL,
      text: 'ShotStep release',
      endpoint: fake.endpoint,
    })).resolves.toEqual({
      ok: false,
      warning: {
        code: 'missing_thread_ts',
        message: 'Slack accepted the root message without returning a thread timestamp.',
      },
    });
  });

  it('returns structured warnings for HTTP, invalid JSON, and Slack API failures', async () => {
    const httpFake = await startFakeSlack(({ response }) => {
      jsonResponse(response, 503, { ok: false, error: 'temporarily_unavailable' });
    });
    const invalidFake = await startFakeSlack(({ response }) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('not json');
    });
    const apiFake = await startFakeSlack(({ response }) => {
      jsonResponse(response, 200, { ok: false, error: 'channel_not_found' });
    });

    await expect(openSlackThread({
      token: TOKEN,
      channel: CHANNEL,
      text: 'ShotStep release',
      endpoint: httpFake.endpoint,
    })).resolves.toEqual({
      ok: false,
      warning: {
        code: 'http_error',
        message: 'Slack chat.postMessage returned HTTP 503.',
      },
    });
    await expect(openSlackThread({
      token: TOKEN,
      channel: CHANNEL,
      text: 'ShotStep release',
      endpoint: invalidFake.endpoint,
    })).resolves.toEqual({
      ok: false,
      warning: {
        code: 'invalid_response',
        message: 'Slack chat.postMessage returned an invalid JSON response.',
      },
    });
    await expect(openSlackThread({
      token: TOKEN,
      channel: CHANNEL,
      text: 'ShotStep release',
      endpoint: apiFake.endpoint,
    })).resolves.toEqual({
      ok: false,
      warning: {
        code: 'slack_api_error',
        message: 'Slack chat.postMessage failed: channel_not_found.',
      },
    });
  });

  it('redacts tokens from unexpected transport errors', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(
      new Error(`request failed with bearer ${TOKEN}`),
    );

    const result = await openSlackThread({
      token: TOKEN,
      channel: CHANNEL,
      text: 'ShotStep release',
      fetchImpl,
    });

    expect(result).toEqual({
      ok: false,
      warning: {
        code: 'transport_error',
        message: 'Slack chat.postMessage request failed: request failed with bearer [REDACTED]',
      },
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});

describe('postSlackReply', () => {
  it('posts lifecycle updates into the captured parent thread', async () => {
    const fake = await startFakeSlack(({ response }) => {
      jsonResponse(response, 200, {
        ok: true,
        channel: CHANNEL,
        ts: '1750000000.000200',
      });
    });

    const result = await postSlackReply({
      token: TOKEN,
      channel: CHANNEL,
      threadTs: '1750000000.000100',
      text: '✅ [iOS] EAS build completed',
      endpoint: fake.endpoint,
    });

    expect(result).toEqual({
      ok: true,
      channel: CHANNEL,
      threadTs: '1750000000.000100',
      messageTs: '1750000000.000200',
    });
    expect(fake.requests[0].body).toMatchObject({
      channel: CHANNEL,
      thread_ts: '1750000000.000100',
      text: '✅ [iOS] EAS build completed',
    });
  });

  it('refuses to post a reply without the root timestamp', async () => {
    const fetchImpl = vi.fn();

    const result = await postSlackReply({
      token: TOKEN,
      channel: CHANNEL,
      threadTs: '',
      text: '✅ [iOS] EAS build completed',
      fetchImpl,
    });

    expect(result).toEqual({
      ok: false,
      warning: {
        code: 'missing_thread_ts',
        message: 'Slack reply skipped because the root thread timestamp is missing.',
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('warns when Slack accepts a reply without returning its timestamp', async () => {
    const fake = await startFakeSlack(({ response }) => {
      jsonResponse(response, 200, { ok: true, channel: CHANNEL });
    });

    const result = await postSlackReply({
      token: TOKEN,
      channel: CHANNEL,
      threadTs: '1750000000.000100',
      text: '✅ [iOS] EAS build completed',
      endpoint: fake.endpoint,
    });

    expect(result).toEqual({
      ok: false,
      warning: {
        code: 'missing_message_ts',
        message: 'Slack accepted the reply without returning its message timestamp.',
      },
    });
  });
});
