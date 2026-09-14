import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Analytics event ingestion endpoint.
 *
 * Receives events from the client-side tracking abstraction.
 * In production, this would forward to an analytics provider or
 * store in a database table for the growth dashboard.
 *
 * For MVP, we log and store in a lightweight events table.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate minimum structure
    if (!body || typeof body.event !== "string") {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }

    // In a full implementation, this would:
    // 1. Insert into an analytics_events table
    // 2. Forward to PostHog/Mixpanel/etc.
    // 3. Update aggregation tables

    // For now, just acknowledge receipt
    // TODO: Wire to analytics provider when configured
    if (process.env.NODE_ENV === "development") {
      console.log("[analytics]", body.event, body.properties ?? {});
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
