import { validStaticQris } from "./domain";

// Encode the original merchant string verbatim. Static QRIS has no order
// amount; the student must enter the separately displayed total in their app.
export async function generateStaticQris(payload: string) {
  if (!validStaticQris(payload))
    throw new Error(
      "QRIS merchant belum tersedia atau format/CRC tidak valid. Hubungi kantin.",
    );
  const qrcode = await import("qrcode");
  return qrcode.toDataURL(payload, {
    width: 320,
    margin: 4,
    errorCorrectionLevel: "M",
  });
}
