import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.rep.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await createServerSupabase();

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    const orgId = user.rep.organizationId;

    const [orgResult, repsResult, leadsResult, jobsResult, messagesResult] =
      await Promise.all([
        db
          .from("organizations")
          .select("id, name, plan, created_at")
          .eq("id", orgId)
          .single(),
        db
          .from("reps")
          .select("id, name, role, created_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("leads")
          .select("id, status, created_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(500),
        db
          .from("upwork_jobs")
          .select("id, verdict, created_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("messages")
          .select("id, created_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

    if (orgResult.error) {
      return NextResponse.json({ error: "Failed to load organization." }, { status: 500 });
    }

    const org = orgResult.data;
    const allReps = repsResult.data ?? [];
    const allLeads = leadsResult.data ?? [];
    const allJobs = jobsResult.data ?? [];
    const allMessages = messagesResult.data ?? [];

    const hasLeadAction = allLeads.length > 0;
    const hasOutreach = allMessages.length > 0;
    const hasJobs = allJobs.length > 0;
    const isActivated = hasLeadAction || hasOutreach || hasJobs;

    const allTimestamps = [
      org.created_at,
      ...allLeads.map((l) => l.created_at),
      ...allJobs.map((j) => j.created_at),
      ...allMessages.map((m) => m.created_at),
    ].filter(Boolean);
    const lastActive = allTimestamps.length
      ? allTimestamps.sort().reverse()[0]
      : org.created_at;

    const lastActiveDate = new Date(lastActive);
    const isWeeklyActive = lastActiveDate >= sevenDaysAgo;
    const isMonthlyActive = lastActiveDate >= thirtyDaysAgo;

    return NextResponse.json({
      funnel: {
        totalReps: allReps.length,
        totalLeads: allLeads.length,
        totalMessages: allMessages.length,
        totalJobs: allJobs.length,
        activated: isActivated,
        weeklyActive: isWeeklyActive,
        monthlyActive: isMonthlyActive,
      },
      organization: {
        id: org.id,
        name: org.name,
        plan: org.plan,
        joinedAt: org.created_at,
        lastActive,
        repCount: allReps.length,
        leadCount: allLeads.length,
        messageCount: allMessages.length,
        jobCount: allJobs.length,
      },
    });
  } catch (error) {
    console.error("[admin/growth] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch growth data" },
      { status: 500 },
    );
  }
}
