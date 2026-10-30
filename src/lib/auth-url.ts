// Do not remove Supabase's code/token_hash recovery parameters.
const credentialParameters = new Set([
  "email",
  "password",
  "current_password",
  "new_password",
  "confirm_password",
  "password_confirmation",
]);

export function cleanCredentialUrl(input: string): URL | null {
  const url = new URL(input);
  let changed = false;
  for (const key of [...url.searchParams.keys()]) {
    if (credentialParameters.has(key.toLowerCase())) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  return changed ? url : null;
}
