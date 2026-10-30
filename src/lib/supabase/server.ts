import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export function configured() {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
export async function serverClient() {
  if (!configured())
    throw new Error("Supabase belum dikonfigurasi. Baca README.md.");
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server Components cannot write cookies; proxy refreshes them. */
          }
        },
      },
    },
  );
}
export async function identity(admin = false) {
  const db = await serverClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error("AUTH_REQUIRED");
  const { data: profile, error: pe } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (pe || !profile)
    throw new Error("Profil belum tersedia. Periksa migrasi database.");
  if (admin && profile.role !== "admin") throw new Error("ADMIN_REQUIRED");
  return { db, user, profile };
}
