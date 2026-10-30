import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/server";
import { assertOrigin, apiError, boundedBody } from "@/lib/security";
import { imageMime, imageExtensions } from "@/lib/uploads";
import { uuid } from "@/lib/domain";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (Number(request.headers.get("content-length")) > 4400000)
      throw new Error("Ukuran maksimal 4 MB.");
    const { db, user, profile } = await identity();
    const { error: rate } = await db.rpc("consume_rate_limit");
    if (rate) throw new Error(rate.message);
    const body = await boundedBody(request, 4400000);
    const form = await new Response(body, {
        headers: { "Content-Type": request.headers.get("Content-Type") || "" },
      }).formData(),
      file = form.get("file"),
      kind = form.get("kind"),
      oid = form.get("order");
    if (!(file instanceof File) || file.size > 4194304 || file.size < 12)
      throw new Error("Pilih JPG, PNG, atau WebP maksimal 4 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer()),
      mime = imageMime(bytes);
    if (!mime || mime !== file.type)
      throw new Error("Isi dan jenis berkas gambar tidak sesuai.");
    let path: string, bucket: string;
    if (kind === "product") {
      if (profile.role !== "admin") throw new Error("ADMIN_REQUIRED");
      path = crypto.randomUUID() + "." + imageExtensions[mime];
      bucket = "product-images";
    } else {
      if (!uuid.safeParse(oid).success)
        throw new Error("ID pesanan tidak valid.");
      path =
        user.id +
        "/" +
        oid +
        "/" +
        crypto.randomUUID() +
        "." +
        imageExtensions[mime];
      bucket = "payment-proofs";
    }
    const { error } = await db.storage
      .from(bucket)
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error)
      throw new Error("Unggah belum berhasil. Periksa akses dan batas ukuran.");
    if (bucket === "payment-proofs") {
      const { error } = await db.rpc("attach_proof", {
        p_order: oid,
        p_path: path,
      });
      if (error)
        throw new Error(
          "Gambar tersimpan, tetapi belum terlampir: " + error.message,
        );
    }
    return NextResponse.json(
      { path },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function GET(request: Request) {
  try {
    const { db } = await identity();
    const id = new URL(request.url).searchParams.get("proof");
    if (!uuid.safeParse(id).success) throw new Error("ID bukti tidak valid.");
    const { data: proof } = await db
      .from("payment_proofs")
      .select("storage_path")
      .eq("id", id)
      .single();
    if (!proof) throw new Error("Bukti tidak ditemukan atau akses ditolak.");
    const { data, error } = await db.storage
      .from("payment-proofs")
      .createSignedUrl(proof.storage_path, 60);
    if (error) throw new Error("Bukti belum dapat dibuka.");
    return NextResponse.redirect(data.signedUrl, {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
