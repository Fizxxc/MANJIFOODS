type PolicyOptions = {
  nonce: string;
  development: boolean;
  requestUrl: string;
  supabaseUrl?: string;
};

export function contentSecurityPolicy({
  nonce,
  development,
  requestUrl,
  supabaseUrl,
}: PolicyOptions) {
  const backend = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const connections = ["'self'"];
  if (backend) connections.push(backend, backend.replace(/^http/, "ws"));
  if (development) {
    // Fast Refresh connects to the same dev server over WebSocket.
    const socket = new URL(requestUrl);
    socket.protocol = socket.protocol === "https:" ? "wss:" : "ws:";
    connections.push(socket.origin);
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // React/Next generate inline styles (including streamed loading states).
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${backend}`.trim(),
    "font-src 'self'",
    `connect-src ${[...new Set(connections)].join(" ")}`,
    // Only /sw.js is used. Supabase's optional blob heartbeat worker is off;
    // the installed webpack Fast Refresh client does not require blob workers.
    "worker-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
