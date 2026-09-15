import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

/**
 * Admin Growth Dashboard API.
 *
 * Returns behavioral metrics:
 * - Funnel: signups → activation → activity
 * - Retention indicators
 * - Per-customer activity + activation state
 *
 * Accessible only to admin-role users.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.rep.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createServiceSupabase();

  // Date ranges
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    // Fetch tables separately to avoid FK relationship issues with service role
    const [orgsResult, repsResult, leadsResult, draftsResult, jobsResult, messagesResult] =
      await Promise.all([
        db
          .from("organizations")
          .select("id, name, plan, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        db
          .from("reps")
          .select("id, name, role, organization_id, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("leads")
          .select("id, organization_id, status, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        db
          .from("content_drafts")
          .select("id, status, created_at, posted_at")
          .order("created_at", { ascending: false })
          .limit(500),
        db
          .from("upwork_jobs")
          .select("id, organization_id, verdict, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("messages")
          .select("id, organization_id, created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

    const orgs = orgsResult.data ?? [];
    const allReps = repsResult.data ?? [];
    const allLeads = leadsResult.data ?? [];
    const allDrafts = draftsResult.data ?? [];
    const allJobs = jobsResult.data ?? [];
    const allMessages = messagesResult.data ?? [];

    // Build per-customer profiles
    const customers = orgs.map((org) => {
      const orgReps = allReps.filter((r) => r.organization_id === org.id);
      const orgLeads = allLeads.filter((l) => l.organization_id === org.id);
      const orgJobs = allJobs.filter((j) => j.organization_id === org.id);
      const orgMessages = allMessages.filter((m) => m.organization_id === org.id);

      // Activation: has at least one lead with outreach OR one draft OR one job
      const hasLeadAction = orgLeads.length > 0;
      const hasOutreach = orgMessages.length > 0;
      const hasDraft = allDrafts.length > 0; // Approximate without persona join
      const hasJobs = orgJobs.length > 0;
      const isActivated = hasLeadAction || hasOutreach || hasDraft || hasJobs;

      // Last active: most recent activity across all surfaces
      const allTimestamps = [
        org.created_at,
        ...orgLeads.map((l) => l.created_at),
        ...orgJobs.map((j) => j.created_at),
        ...orgMessages.map((m) => m.created_at),
      ].filter(Boolean);
      const lastActive = allTimestamps.length
        ? allTimestamps.sort().reverse()[0]
        : org.created_at;

      // Retention: had activity in last 7/30 days
      const lastActiveDate = new Date(lastActive);
      const isWeeklyActive = lastActiveDate >= sevenDaysAgo;
      const isMonthlyActive = lastActiveDate >= thirtyDaysAgo;

      // Meaningful actions count
      const meaningfulActions =
        orgLeads.length +
        orgMessages.length +
        (hasDraft ? allDrafts.length : 0) +
        orgJobs.length;

      return {
        id: org.id,
        name: org.name,
        plan: org.plan,
        joinedAt: org.created_at,
        repCount: orgReps.length,
        leadCount: orgLeads.length,
        messageCount: orgMessages.length,
        draftCount: hasDraft ? allDrafts.length : 0,
        jobCount: orgJobs.length,
        lastActive,
        isActivated,
        isWeeklyActive,
        isMonthlyActive,
        meaningfulActions,
      };
    });

    // Funnel metrics
    const totalOrgs = orgs.length;
    const activatedOrgs = customers.filter((c) => c.isActivated).length;
    const weeklyActiveOrgs = customers.filter((c) => c.isWeeklyActive).length;
    const monthlyActiveOrgs = customers.filter((c) => c.isMonthlyActive).length;

    // Signups by week (last 8 weeks)
    const eightWeeksAgo = now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000;
    const weeklySignups = Array.from({ length: 8 }, (_, i) => {
      const weekStart = new Date(eightWeeksAgo + i * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      return {
        week: weekStart.toISOString().slice(0, 10),
        count: orgs.filter((o) => {
          const t = new Date(o.created_at).getTime();
          return t >= weekStart.getTime() && t < weekEnd.getTime();
        }).length,
      };
    });

    return NextResponse.json({
      funnel: {
        totalOrganizations: totalOrgs,
        activatedOrganizations: activatedOrgs,
        activationRate:
          totalOrgs > 0 ? Math.round((activatedOrgs / totalOrgs) * 100) : 0,
        weeklyActive: weeklyActiveOrgs,
        monthlyActive: monthlyActiveOrgs,
        totalLeads: allLeads.length,
        totalDrafts: allDrafts.length,
        totalMessages: allMessages.length,
        totalJobs: allJobs.length,
      },
      weeklySignups,
      customers: customers.sort(
        (a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime(),
      ),
      retention: {
        d1: customers.filter((c) => {
          const d = new Date(c.lastActive);
          return d >= new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }).length,
        d7: weeklyActiveOrgs,
        d30: monthlyActiveOrgs,
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
