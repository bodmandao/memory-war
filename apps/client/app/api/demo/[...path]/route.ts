/**
 * Server-side proxy for the demo/agent driver. The browser calls this
 * same-origin route, never the real demo server URL — that URL and the
 * shared secret that guards it (DEMO_UPSTREAM_URL / DEMO_API_KEY) are
 * server-only env vars, never NEXT_PUBLIC_*, so neither is ever visible
 * in the client bundle or network tab. Both DEMO_UPSTREAM_URL and
 * DEMO_API_KEY must match what demo/server.ts is deployed with.
 */
import { NextRequest, NextResponse } from "next/server";

const UPSTREAM = process.env.DEMO_UPSTREAM_URL ?? "http://localhost:4401";
const API_KEY = process.env.DEMO_API_KEY;

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const target = `${UPSTREAM}/${params.path.join("/")}`;
  let body: string | undefined;
  try {
    body = await req.text();
  } catch {
    body = undefined;
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(API_KEY ? { "x-demo-key": API_KEY } : {}),
      },
      body: body && body.length > 0 ? body : undefined,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: `could not reach the demo service` }, { status: 502 });
  }

  const payload = await upstreamRes.text();
  return new NextResponse(payload, {
    status: upstreamRes.status,
    headers: { "content-type": upstreamRes.headers.get("content-type") ?? "application/json" },
  });
}
