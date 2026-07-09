import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Exercises the route's own behavior — validation wiring, honeypot
// stealth-success, duplicate handling, consent stamping — with the service
// client mocked. Validation logic itself is covered in
// src/lib/__tests__/waitlist.test.ts.

const insertMock = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== "waitlist_signups") {
        throw new Error(`Unexpected table in test double: ${table}`);
      }
      return { insert: insertMock };
    },
  }),
}));

function makeRequest(body: unknown, ip = "203.0.113.10"): Request {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Unique IP per test run avoids tripping the in-memory rate limiter
      // across tests.
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

const validShopper = {
  segmentType: "shopper",
  email: "test@example.com",
  phone: "0712345678",
  city: "Nairobi",
  consent: true,
};

beforeEach(() => {
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
});

describe("POST /api/waitlist", () => {
  it("inserts a valid signup with a server-side consent timestamp", async () => {
    const before = Date.now();
    const res = await POST(makeRequest(validShopper, nextIp()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ joined: true });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0][0];
    expect(row.segment_type).toBe("shopper");
    expect(row.email).toBe("test@example.com");
    expect(row.phone).toBe("+254712345678");
    const consentAt = Date.parse(row.consent_at);
    expect(consentAt).toBeGreaterThanOrEqual(before);
    expect(consentAt).toBeLessThanOrEqual(Date.now());
  });

  it("returns 400 with the validation message for bad input", async () => {
    const res = await POST(
      makeRequest({ ...validShopper, email: "nope" }, nextIp())
    );
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("reports success without inserting when the honeypot is filled", async () => {
    const res = await POST(
      makeRequest({ ...validShopper, website: "spam" }, nextIp())
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ joined: true });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("treats a duplicate (unique_violation) as an idempotent success", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505" } });
    const res = await POST(makeRequest(validShopper, nextIp()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ joined: true, alreadyJoined: true });
  });

  it("returns 500 on other database errors", async () => {
    insertMock.mockResolvedValue({ error: { code: "XX000", message: "boom" } });
    const res = await POST(makeRequest(validShopper, nextIp()));
    expect(res.status).toBe(500);
  });

  it("rate limits repeated submissions from one IP", async () => {
    const ip = nextIp();
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(makeRequest(validShopper, ip));
      expect(res.status).toBe(200);
    }
    const res = await POST(makeRequest(validShopper, ip));
    expect(res.status).toBe(429);
  });
});
