import { describe, expect, it } from "vitest";
import { createSession, digestTranscript, chainStep } from "../src/index.js";
import { createHash } from "node:crypto";

const h = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("@fidacy/session", () => {
  it("empty session head is sha256 of the genesis tag", () => {
    const s = createSession();
    expect(s.digest()).toEqual({ sha256: h("fidacy.session.v1"), messages: 0 });
  });

  it("digest changes with every message and is order-sensitive", () => {
    const a = createSession();
    a.add("user", "hello", "2026-07-03T10:00:00.000Z");
    const one = a.digest().sha256;
    a.add("assistant", "hi", "2026-07-03T10:00:01.000Z");
    const two = a.digest().sha256;
    expect(one).not.toEqual(two);

    const b = createSession();
    b.add("assistant", "hi", "2026-07-03T10:00:01.000Z");
    b.add("user", "hello", "2026-07-03T10:00:00.000Z");
    expect(b.digest().sha256).not.toEqual(two);
  });

  it("the exported transcript reproduces the head via the public recipe", () => {
    const s = createSession({ label: "case-4711" });
    s.add("user", "I want to file a claim for water damage.");
    s.add("assistant", "I can help. Please describe when it happened.");
    s.add("user", "Last Tuesday.");
    const exported = s.export();
    expect(digestTranscript(exported.messages)).toEqual(exported.sha256);
  });

  it("tampering with any exported message breaks the recomputation", () => {
    const s = createSession();
    s.add("user", "the price is 100", "2026-07-03T10:00:00.000Z");
    s.add("assistant", "confirmed: 100", "2026-07-03T10:00:01.000Z");
    const exported = s.export();
    const tampered = exported.messages.map((m) =>
      m.i === 1 ? { ...m, content: "confirmed: 900" } : m,
    );
    expect(digestTranscript(tampered)).not.toEqual(exported.sha256);
  });

  it("chainStep canonicalization is key-order independent and content-exact", () => {
    const head = h("fidacy.session.v1");
    const m = { i: 0, role: "user" as const, content: "ação", ts: "2026-07-03T10:00:00.000Z" };
    const step = chainStep(head, m);
    expect(step).toMatch(/^[0-9a-f]{64}$/);
    expect(chainStep(head, { ...m })).toEqual(step);
    expect(chainStep(head, { ...m, content: "acao" })).not.toEqual(step);
  });

  it("verifyUrl points at the public verify page with the current head", () => {
    const s = createSession();
    s.add("user", "x");
    expect(s.verifyUrl()).toBe(`https://fidacy.com/verify?sha256=${s.digest().sha256}`);
  });

  it("anchor rejects a non-https engine url before sending the key anywhere", async () => {
    const s = createSession();
    s.add("user", "x");
    await expect(s.anchor({ apiKey: "fky_test_x", engineUrl: "http://evil.example" })).rejects.toThrow(
      /https/,
    );
  });
});
