import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Guard for drift D28 — `/contact` rendering a success state while sending
 * nothing.
 *
 * The interesting assertions here are not "does a valid submission return 200".
 * They are the two that encode the actual defect: a submission must not report
 * success when delivery failed, and the page must not show its tick without
 * having called the endpoint. Both were true of the page this replaces.
 */

const sendEmail = vi.fn();
vi.mock("@/lib/resend", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}));

import { POST, GET } from "../route";

const post = (body: unknown) =>
  POST(
    new Request("https://www.maanta.app/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify(body),
    })
  );

const VALID = { contact: "shopper@example.com", message: "My code did not work." };

beforeEach(() => {
  sendEmail.mockReset();
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue(true);
  sendEmail.mockResolvedValue(true);
});

describe("POST /api/contact", () => {
  it("delivers the enquiry to the monitored inbox", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(200);

    const enquiry = sendEmail.mock.calls[0][0];
    expect(enquiry.to).toBe("admin@maanta.app");
    expect(enquiry.text).toContain("My code did not work.");
    // Replying in the inbox must reach the sender, not MAANTA's own from-address.
    expect(enquiry.replyTo).toBe("shopper@example.com");
  });

  it("autoresponds to the sender — the proof the message arrived", async () => {
    await post(VALID);
    const auto = sendEmail.mock.calls[1][0];
    expect(auto.to).toBe("shopper@example.com");
    expect(auto.subject).toMatch(/got your message/i);
  });

  // The defect, restated as a test: never claim receipt for an undelivered message.
  it("reports failure instead of faking success when delivery fails", async () => {
    sendEmail.mockResolvedValue(false);
    const res = await post(VALID);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBeUndefined();
    expect(body.error).toMatch(/could not send/i);
  });

  // The enquiry is already in the inbox; failing the request would tell the
  // sender to write in again for a message that arrived.
  it("still succeeds when only the autoresponder fails", async () => {
    sendEmail.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, autoresponded: false });
  });

  it("does not autorespond to a phone number, and still delivers", async () => {
    const res = await post({ contact: "+254700000000", message: "Hello" });
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].replyTo).toBeUndefined();
  });

  it("rejects an empty message and an empty contact", async () => {
    expect((await post({ contact: "a@b.com", message: "   " })).status).toBe(400);
    expect((await post({ contact: "", message: "hi" })).status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("swallows honeypot submissions without sending", async () => {
    const res = await post({ ...VALID, hp_url: "http://spam.example" });
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rate limits by client, pointing at WhatsApp instead", async () => {
    checkRateLimit.mockResolvedValue(false);
    const res = await post(VALID);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/WhatsApp/i);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("escapes HTML in the message so the inbox copy cannot inject markup", async () => {
    await post({ contact: "a@b.com", message: "<script>alert(1)</script>" });
    const html = sendEmail.mock.calls[0][0].html as string;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("exposes config presence without leaking values", async () => {
    const res = await GET(new Request("https://www.maanta.app/api/contact?healthz=1"));
    const body = await res.json();
    expect(Object.values(body).every((v) => typeof v === "boolean")).toBe(true);
  });
});

describe("/contact page", () => {
  const page = readFileSync(
    path.resolve(__dirname, "..", "..", "..", "(marketing)", "contact", "page.tsx"),
    "utf8"
  );

  it("posts to /api/contact rather than faking a success state", () => {
    expect(page).toContain("/api/contact");
    // The original bug: setSent(true) reached directly from the submit handler.
    expect(
      /preventDefault\(\);\s*setSent\(true\)/.test(page),
      "the form must not set the success state without awaiting delivery (drift D28)"
    ).toBe(false);
  });

  it("does not promise a response time that has not been committed to", () => {
    // A held claim: website-handoff.md §9 — publish only what can be met.
    //
    // Checked against code with comments stripped, not the raw file: the doc
    // comment above the component quotes the removed promise to explain what was
    // wrong with it, and a scanner that cannot tell copy from commentary teaches
    // the next author to delete the explanation rather than keep the guard.
    const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(/within 24 hours/i.test(code)).toBe(false);
  });
});
