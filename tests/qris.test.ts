import { beforeEach, describe, expect, it, vi } from "vitest";
import { crc16 } from "../src/lib/domain";
const qr = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("qrcode", () => ({ toDataURL: qr.render }));
import { generateStaticQris } from "../src/lib/qris";
const payload = () => {
  // Test merchant only, never application configuration.
  const raw =
    "00020101021126080004TEST5204581253033605802ID5904TEST6007JAKARTA6304";
  return raw + crc16(new TextEncoder().encode(raw));
};
beforeEach(() => {
  qr.render.mockReset();
});
describe("original static merchant QRIS", () => {
  it("passes the exact configured payload to the QR encoder without inserting an amount", async () => {
    const original = payload();
    qr.render.mockResolvedValue("data:image/png;base64,test-only");
    expect(await generateStaticQris(original)).toBe(
      "data:image/png;base64,test-only",
    );
    expect(qr.render).toHaveBeenCalledExactlyOnceWith(original, {
      width: 320,
      margin: 4,
      errorCorrectionLevel: "M",
    });
    expect(original).toBe(payload());
  });
  it.each([
    "",
    "not a QRIS payload",
    payload().slice(0, -4) + "FFFF",
    payload().replace("010211", "010212"),
  ])(
    "rejects missing, corrupted or dynamic configuration before rendering %s",
    async (raw) => {
      await expect(generateStaticQris(raw)).rejects.toThrow("format/CRC");
      expect(qr.render).not.toHaveBeenCalled();
    },
  );
  it("rejects an amount-bearing payload even with a recomputed checksum", async () => {
    const raw = payload().slice(0, -8) + "5405120006304";
    await expect(
      generateStaticQris(raw + crc16(new TextEncoder().encode(raw))),
    ).rejects.toThrow();
    expect(qr.render).not.toHaveBeenCalled();
  });
  it("surfaces encoder failure and supports a read-only retry", async () => {
    qr.render
      .mockRejectedValueOnce(new Error("encoder failure"))
      .mockResolvedValueOnce("data:image/png;base64,retry");
    await expect(generateStaticQris(payload())).rejects.toThrow(
      "encoder failure",
    );
    expect(await generateStaticQris(payload())).toContain("retry");
    expect(qr.render).toHaveBeenCalledTimes(2);
  });
  it("generates a real PNG with a quiet zone from the unchanged payload", async () => {
    const actual = await vi.importActual<typeof import("qrcode")>("qrcode");
    qr.render.mockImplementation(actual.toDataURL);
    const url = await generateStaticQris(payload());
    const png = Buffer.from(url.split(",")[1], "base64");
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(320);
    expect(png.readUInt32BE(20)).toBe(320);
    expect(url).toBe(
      await actual.toDataURL(payload(), {
        width: 320,
        margin: 4,
        errorCorrectionLevel: "M",
      }),
    );
  });
});
