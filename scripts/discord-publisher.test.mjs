import { describe, expect, it, vi } from "vitest";

import {
  openDiscordThread,
  postDiscordReply,
} from "./discord-publisher.mjs";

const WEBHOOK = "https://discord.example/api/webhooks/123/release-secret";

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

describe("Discord release publisher", () => {
  it("opens a no-mentions Discord thread from reviewed release text", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(response(200, { channel_id: "thread-123" }));

    await expect(
      openDiscordThread({
        content: "- Cross-court dink homework stays in place.",
        fetchImpl,
        threadName: "ShotStep v0.1.9",
        webhook: WEBHOOK,
      }),
    ).resolves.toEqual({ ok: true, threadId: "thread-123" });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${WEBHOOK}?wait=true`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      allowed_mentions: { parse: [] },
      content: "- Cross-court dink homework stays in place.",
      thread_name: "ShotStep v0.1.9",
    });
  });

  it("redacts the webhook from Discord failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error(`Could not reach ${WEBHOOK}`));

    const result = await openDiscordThread({
      content: "- Serve practice is ready.",
      fetchImpl,
      threadName: "Personal project v0.1.9",
      webhook: WEBHOOK,
    });

    expect(result).toEqual({
      ok: false,
      warning: {
        code: "transport_error",
        message: "Discord webhook request failed: Could not reach [REDACTED]",
      },
    });
    expect(JSON.stringify(result)).not.toContain(WEBHOOK);
  });

  it("does not post a reply when the root thread ID is missing", async () => {
    const fetchImpl = vi.fn();

    await expect(
      postDiscordReply({
        content: "✅ [Website] deployment completed",
        fetchImpl,
        threadId: "",
        webhook: WEBHOOK,
      }),
    ).resolves.toEqual({
      ok: false,
      warning: {
        code: "missing_thread_id",
        message: "Discord reply skipped because the root thread ID is missing.",
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
