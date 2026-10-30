import { describe, it, expect } from "vitest";
import {
  lineTotal,
  unitPrice,
  availableSlot,
  allowedTransition,
  validStaticQris,
  crc16,
  commandSchema,
  csvCell,
  type Slot,
} from "../src/lib/domain";
import { imageMime } from "../src/lib/uploads";
export const fixtureQris = () => {
  const raw =
    "00020101021126080004TEST5204581253033605802ID5904TEST6007JAKARTA6304";
  return raw + crc16(new TextEncoder().encode(raw));
};
describe("business validation", () => {
  it("base + variant, including cheaper variants", () => {
    expect(lineTotal(12000, 2000, 3)).toBe(42000);
    expect(unitPrice(12000, -1000)).toBe(11000);
  });
  it.each([0, -1, 100, 1.5, NaN])("rejects quantity %s", (qty) => {
    expect(() => lineTotal(1000, 0, qty)).toThrow();
  });
  it("rejects negative and non-integer final prices", () => {
    expect(() => unitPrice(100, -101)).toThrow();
    expect(() => unitPrice(1.5)).toThrow();
  });
  it("enforces capacity, active flag, and strict cutoff", () => {
    const slot = {
      active: true,
      cutoff_at: "2030-01-01T00:00:00Z",
      ends_at: "2030-01-01T02:00:00Z",
      capacity: 2,
      reserved_count: 1,
    } as Slot;
    const t = Date.parse(slot.cutoff_at);
    expect(availableSlot(slot, t - 1)).toBe(true);
    expect(availableSlot(slot, t)).toBe(false);
    expect(availableSlot({ ...slot, reserved_count: 2 }, t - 1)).toBe(false);
    expect(availableSlot({ ...slot, active: false }, t - 1)).toBe(false);
  });
  it("only permits sequential order states", () => {
    expect(allowedTransition("pending", "confirmed")).toBe(true);
    expect(allowedTransition("pending", "completed")).toBe(false);
    expect(allowedTransition("completed", "ready")).toBe(false);
  });
  it("validates original static payload and checksum", () => {
    const q = fixtureQris();
    expect(validStaticQris(q)).toBe(true);
    expect(validStaticQris(q.slice(0, -1) + "X")).toBe(false);
    expect(validStaticQris(q.replace("010211", "010212"))).toBe(false);
    expect(validStaticQris("")).toBe(false);
  });
  it("rejects amount insertion, duplicate tags and malformed TLV", () => {
    const q = fixtureQris();
    for (const raw of [
      q.slice(0, -8) + "5405100006304",
      q.slice(0, -8) + "5802ID6304",
      q.slice(0, -8) + "5909X6304",
    ]) {
      expect(validStaticQris(raw + crc16(new TextEncoder().encode(raw)))).toBe(
        false,
      );
    }
  });
  it("never accepts a trusted price or student paid command", () => {
    expect(
      commandSchema.safeParse({
        type: "order",
        order: crypto.randomUUID(),
        action: "paid",
      }).success,
    ).toBe(false);
    const x = commandSchema.parse({
      type: "cart",
      product: crypto.randomUUID(),
      variant: null,
      quantity: 2,
      price: 1,
    });
    expect(x).not.toHaveProperty("price");
  });
  it("neutralizes spreadsheet formulas including whitespace prefixes", () => {
    expect(csvCell("=IMPORTXML(x)")).toBe('"\'=IMPORTXML(x)"');
    expect(csvCell("  @x")).toContain("'");
    expect(csvCell('a"b')).toBe('"a""b"');
  });
  it("checks file signatures, not the client extension", () => {
    expect(imageMime(Uint8Array.from([255, 216, 255]))).toBe("image/jpeg");
    expect(imageMime(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(imageMime(new TextEncoder().encode("not an image"))).toBeNull();
  });
});
