import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "../src/lib/csp";
import { cleanCredentialUrl } from "../src/lib/auth-url";

const options = {
  nonce: "fresh-random-nonce",
  requestUrl: "http://localhost:3000/login",
  supabaseUrl: "https://backend.example.invalid/path",
};
const directives = (policy: string) =>
  Object.fromEntries(
    policy.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name, values];
    }),
  );

describe("CSP environment boundaries", () => {
  it("production uses nonce scripts, exact backend origins and same-origin workers", () => {
    const csp = directives(
      contentSecurityPolicy({ ...options, development: false }),
    );
    expect(csp["script-src"]).toEqual([
      "'self'",
      "'nonce-fresh-random-nonce'",
      "'strict-dynamic'",
    ]);
    expect(csp["script-src-attr"]).toEqual(["'none'"]);
    expect(csp["connect-src"]).toEqual([
      "'self'",
      "https://backend.example.invalid",
      "wss://backend.example.invalid",
    ]);
    expect(csp["worker-src"]).toEqual(["'self'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
  });

  it("development alone permits eval and the dev server's exact HMR socket", () => {
    const csp = directives(
      contentSecurityPolicy({ ...options, development: true }),
    );
    expect(csp["script-src"]).toContain("'unsafe-eval'");
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
    expect(csp["connect-src"]).toContain("ws://localhost:3000");
    expect(csp["worker-src"]).toEqual(["'self'"]);
  });

  it("works without a configured backend and does not permit arbitrary connections", () => {
    const policy = contentSecurityPolicy({
      ...options,
      supabaseUrl: undefined,
      development: false,
    });
    expect(directives(policy)["connect-src"]).toEqual(["'self'"]);
    expect(policy).not.toMatch(/unsafe-eval|blob:|\*/);
  });
});

describe("legacy credential URLs", () => {
  it("removes every repeated credential key case-insensitively and preserves recovery links", () => {
    const clean = cleanCredentialUrl(
      "https://app.invalid/login?email=a&Email=b&PASSWORD=c&password=d&new_password=e&error=link&code=pkce&token_hash=otp#help",
    );
    expect(clean?.href).toBe(
      "https://app.invalid/login?error=link&code=pkce&token_hash=otp#help",
    );
  });
  it("leaves safe URLs alone", () => {
    expect(
      cleanCredentialUrl(
        "https://app.invalid/auth/callback?code=pkce&next=/reset-password",
      ),
    ).toBeNull();
  });
});
