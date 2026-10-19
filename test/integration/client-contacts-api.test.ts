import { describe, expect, it } from "vitest";
import { clientInput, clientUpdateInput } from "@/lib/api/schemas";

describe("clientInput contacts validation", () => {
  it("accepts a client with no contacts", () => {
    const parsed = clientInput.parse({ name: "Acme", contacts: [] });
    expect(parsed.contacts).toEqual([]);
  });

  it("accepts several contacts with one primary", () => {
    const parsed = clientInput.parse({
      name: "Acme",
      contacts: [
        { name: "Dana", email: "dana@example.com", is_primary: true },
        { name: "Sam", email: "", is_primary: false },
      ],
    });
    expect(parsed.contacts).toHaveLength(2);
    expect(parsed.contacts[1]?.email).toBeNull();
  });

  it("rejects two primaries", () => {
    expect(() =>
      clientInput.parse({
        name: "Acme",
        contacts: [
          { name: "Dana", email: null, is_primary: true },
          { name: "Sam", email: null, is_primary: true },
        ],
      }),
    ).toThrow();
  });

  it("rejects a contact with a blank name", () => {
    expect(() =>
      clientInput.parse({ name: "Acme", contacts: [{ name: "  ", email: null, is_primary: false }] }),
    ).toThrow();
  });

  it("rejects a malformed email", () => {
    expect(() =>
      clientInput.parse({
        name: "Acme",
        contacts: [{ name: "Dana", email: "not-an-email", is_primary: true }],
      }),
    ).toThrow();
  });

  it("defaults contacts to an empty array when omitted", () => {
    expect(clientInput.parse({ name: "Acme" }).contacts).toEqual([]);
  });
});

describe("clientUpdateInput", () => {
  it("leaves contacts out of an archive toggle, so it cannot wipe them", () => {
    expect(clientUpdateInput.parse({ archived: true })).toEqual({ archived: true });
  });
});
