import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMENT_MARKER,
  buildPullRequestComment,
  upsertPullRequestComment,
} from "../dist/github.js";

test("builds an identifiable, bounded pull request comment", () => {
  const body = buildPullRequestComment("x".repeat(70_000));
  assert.ok(body.startsWith(COMMENT_MARKER));
  assert.ok(body.includes("report truncated"));
  assert.ok(body.length < 61_000);
});

test("updates an existing bot comment instead of duplicating it", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (!init.method) {
      return new Response(JSON.stringify([
        { id: 42, body: `${COMMENT_MARKER}\nold`, user: { type: "Bot" } },
      ]), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  };

  const outcome = await upsertPullRequestComment({
    apiUrl: "https://api.github.test",
    repository: "owner/repo",
    pullRequestNumber: 7,
    token: "test-token",
    body: "new report",
    fetchImpl,
  });

  assert.equal(outcome, "updated");
  assert.equal(calls[1].url, "https://api.github.test/repos/owner/repo/issues/comments/42");
  assert.equal(calls[1].init.method, "PATCH");
});

test("creates a comment when no previous report exists", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    return new Response(init.method ? "{}" : "[]", { status: init.method ? 201 : 200 });
  };

  const outcome = await upsertPullRequestComment({
    apiUrl: "https://api.github.test",
    repository: "owner/repo",
    pullRequestNumber: 7,
    token: "test-token",
    body: "new report",
    fetchImpl,
  });

  assert.equal(outcome, "created");
  assert.equal(calls[1].url, "https://api.github.test/repos/owner/repo/issues/7/comments");
  assert.equal(calls[1].init.method, "POST");
});
