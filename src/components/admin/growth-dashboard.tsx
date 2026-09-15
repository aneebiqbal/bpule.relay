"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Target,
  PenLine,
  Briefcase,
  Activity,
  Zap,
  TrendingUp,
  Calendar,
} from "lucide-react";

interface OrganizationData {
  id: string;
  name: string;
  plan: string;
  joinedAt: string;
  lastActive: string;
  repCount: number;
  leadCount: number;
  messageCount: number;
  jobCount: number;
}

interface FunnelData {
  totalReps: number;
  totalLeads: number;
  totalMessages: number;
  totalJobs: number;
  activated: boolean;
  weeklyActive: boolean;
  monthlyActive: boolean;
}

interface GrowthResponse {
  funnel: FunnelData;
  organization: OrganizationData;
}

export function GrowthDashboard() {
  const [data, setData] = useState<GrowthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/growth")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-line border-t-orange" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-status-danger/30 bg-status-danger/5 p-6 text-center">
        <p className="text-sm text-status-danger">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { funnel, organization } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-heading text-2xl text-ink">Organization Overview</h1>
          <p className="mt-1 text-[14px] text-graphite">
            {organization.name} · {organization.plan} plan
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-bone-raised px-3 py-1">
          <span
            className={`size-1.5 rounded-full ${
              funnel.weeklyActive ? "bg-status-success" : "bg-stone"
            }`}
          />
          <span className="text-mono-regular text-[11px] text-stone">
            {funnel.weeklyActive ? "Active this week" : "Inactive this week"}
          </span>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Team Members"
          value={funnel.totalReps}
          sub={`${organization.repCount} registered`}
        />
        <MetricCard
          icon={Target}
          label="Leads"
          value={funnel.totalLeads}
          sub={`${organization.leadCount} total`}
        />
        <MetricCard
          icon={Activity}
          label="Outreach Sent"
          value={funnel.totalMessages}
          sub={`${organization.messageCount} messages`}
        />
        <MetricCard
          icon={Briefcase}
          label="Jobs"
          value={funnel.totalJobs}
          sub={`${organization.jobCount} evaluated`}
        />
      </div>

      {/* Activity status */}
      <div className="rounded-xl border border-line bg-bone-raised p-5">
        <h2 className="text-[13px] font-medium text-ink">Activity Status</h2>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <StatusItem
            label="Activation"
            active={funnel.activated}
            description={funnel.activated ? "Has activity" : "No activity yet"}
          />
          <StatusItem
            label="Weekly Active"
            active={funnel.weeklyActive}
            description={funnel.weeklyActive ? "Active this week" : "Inactive"}
          />
          <StatusItem
            label="Monthly Active"
            active={funnel.monthlyActive}
            description={funnel.monthlyActive ? "Active this month" : "Inactive"}
          />
        </div>
      </div>

      {/* Organization details */}
      <div className="rounded-xl border border-line bg-bone-raised p-5">
        <h2 className="text-[13px] font-medium text-ink">Organization Details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <DetailItem
            icon={Calendar}
            label="Joined"
            value={new Date(organization.joinedAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          />
          <DetailItem
            icon={TrendingUp}
            label="Last Active"
            value={timeAgo(organization.lastActive)}
          />
          <DetailItem
            icon={Users}
            label="Plan"
            value={organization.plan}
          />
          <DetailItem
            icon={Zap}
            label="Total Actions"
            value={String(
              funnel.totalLeads + funnel.totalMessages + funnel.totalJobs,
            )}
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-bone-raised p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-stone" />
        <span className="text-label text-stone">{label}</span>
      </div>
      <p className="mt-2 text-mono-medium text-2xl font-semibold text-ink">
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] text-stone">{sub}</p>
    </div>
  );
}

function StatusItem({
  label,
  active,
  description,
}: {
  label: string;
  active: boolean;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span
        className={`size-3 rounded-full ${
          active ? "bg-status-success" : "bg-stone"
        }`}
      />
      <span className="text-[12px] font-medium text-ink">{label}</span>
      <span className="text-[11px] text-stone">{description}</span>
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-4 text-stone" />
      <div>
        <p className="text-[11px] text-stone">{label}</p>
        <p className="text-[13px] font-medium text-ink">{value}</p>
      </div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
