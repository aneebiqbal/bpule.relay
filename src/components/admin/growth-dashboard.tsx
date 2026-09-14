"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Building2,
  Target,
  PenLine,
  Briefcase,
  TrendingUp,
  Activity,
  Zap,
} from "lucide-react";

interface FunnelData {
  totalOrganizations: number;
  activatedOrganizations: number;
  activationRate: number;
  weeklyActive: number;
  monthlyActive: number;
  totalLeads: number;
  totalDrafts: number;
  totalMessages: number;
  totalJobs: number;
}

interface Customer {
  id: string;
  name: string;
  plan: string;
  joinedAt: string;
  repCount: number;
  leadCount: number;
  messageCount: number;
  draftCount: number;
  jobCount: number;
  lastActive: string;
  isActivated: boolean;
  isWeeklyActive: boolean;
  isMonthlyActive: boolean;
  meaningfulActions: number;
}

interface GrowthResponse {
  funnel: FunnelData;
  weeklySignups: { week: string; count: number }[];
  customers: Customer[];
  retention: { d1: number; d7: number; d30: number };
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

  const { funnel, weeklySignups, customers, retention } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-heading text-2xl text-ink">Growth</h1>
          <p className="mt-1 text-[14px] text-graphite">
            Visitors to signups to activation to retention.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-bone-raised px-3 py-1">
          <span className="size-1.5 rounded-full bg-status-success" />
          <span className="text-mono-regular text-[11px] text-stone">
            {funnel.monthlyActive} active this month
          </span>
        </div>
      </div>

      {/* Funnel */}
      <div className="rounded-xl border border-line bg-bone-raised p-5">
        <h2 className="text-[13px] font-medium text-ink">Acquisition Funnel</h2>
        <div className="mt-4 flex items-center gap-2">
          <FunnelStep
            label="Signups"
            value={funnel.totalOrganizations}
            icon={Building2}
          />
          <FunnelArrow />
          <FunnelStep
            label="Activated"
            value={funnel.activatedOrganizations}
            icon={Zap}
            pct={funnel.activationRate}
          />
          <FunnelArrow />
          <FunnelStep
            label="Weekly Active"
            value={funnel.weeklyActive}
            icon={Activity}
          />
          <FunnelArrow />
          <FunnelStep
            label="Monthly Active"
            value={funnel.monthlyActive}
            icon={TrendingUp}
          />
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Target}
          label="Leads"
          value={funnel.totalLeads}
          sub={`${funnel.totalMessages} messages sent`}
        />
        <MetricCard
          icon={PenLine}
          label="Studio Drafts"
          value={funnel.totalDrafts}
          sub="content ideas generated"
        />
        <MetricCard
          icon={Briefcase}
          label="Jobs"
          value={funnel.totalJobs}
          sub="opportunities evaluated"
        />
        <MetricCard
          icon={Users}
          label="Users"
          value={customers.reduce((sum, c) => sum + c.repCount, 0)}
          sub={`${customers.length} organizations`}
        />
      </div>

      {/* Retention + Signups trend */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Retention */}
        <div className="rounded-xl border border-line bg-bone-raised p-5">
          <h2 className="text-[13px] font-medium text-ink">Retention</h2>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <RetentionBucket label="Day 1" value={retention.d1} />
            <RetentionBucket label="Day 7" value={retention.d7} />
            <RetentionBucket label="Day 30" value={retention.d30} />
          </div>
          <p className="mt-4 text-[12px] text-stone">
            Users with meaningful activity in the period.
          </p>
        </div>

        {/* Weekly Signups */}
        <div className="rounded-xl border border-line bg-bone-raised p-5">
          <h2 className="text-[13px] font-medium text-ink">
            Signups (8 weeks)
          </h2>
          <div className="mt-4 flex items-end gap-2" style={{ height: 100 }}>
            {weeklySignups.map((week) => {
              const max = Math.max(...weeklySignups.map((w) => w.count), 1);
              const pct = (week.count / max) * 100;
              return (
                <div
                  key={week.week}
                  className="flex flex-1 flex-col items-center justify-end gap-1"
                  style={{ height: "100%" }}
                >
                  <div
                    className="w-full rounded-t bg-orange/60 transition-all"
                    style={{ height: `${Math.max(pct, 4)}%` }}
                  />
                  <span className="text-mono-regular text-[8px] text-stone">
                    {week.week.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Customer list */}
      <div className="rounded-xl border border-line bg-bone-raised">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[13px] font-medium text-ink">Customers</h2>
          <span className="text-mono-regular text-[11px] text-stone">
            Sorted by last active
          </span>
        </div>
        {customers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[14px] text-stone">
              No customers yet. Share your launch link to get started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {customers.map((customer) => (
              <div
                key={customer.id}
                className="flex items-center justify-between px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {customer.name}
                    </p>
                    <StatusBadge
                      activated={customer.isActivated}
                      active={customer.isWeeklyActive}
                    />
                  </div>
                  <p className="text-[11px] text-stone">
                    {customer.isActivated ? "Activated" : "Not activated"} ·{" "}
                    {customer.meaningfulActions} actions ·{" "}
                    {customer.isWeeklyActive ? "active this week" : `last ${timeAgo(customer.lastActive)}`}
                  </p>
                </div>
                <div className="flex items-center gap-5 text-right">
                  <MiniStat label="plan" value={customer.plan} />
                  <MiniStat label="users" value={String(customer.repCount)} />
                  <MiniStat label="leads" value={String(customer.leadCount)} />
                  <MiniStat
                    label="outreach"
                    value={String(customer.messageCount)}
                  />
                  <MiniStat label="drafts" value={String(customer.draftCount)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function FunnelStep({
  label,
  value,
  icon: Icon,
  pct,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  pct?: number;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2 rounded-lg border border-line bg-bone p-3">
      <Icon className="size-4 text-stone" />
      <span className="text-mono-medium text-lg font-semibold text-ink">
        {value}
      </span>
      <span className="text-[11px] text-stone">{label}</span>
      {pct !== undefined && (
        <span className="text-mono-medium text-[10px] text-orange">
          {pct}%
        </span>
      )}
    </div>
  );
}

function FunnelArrow() {
  return (
    <svg className="size-4 shrink-0 text-line" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

function RetentionBucket({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-mono-medium text-xl font-semibold text-ink">
        {value}
      </span>
      <span className="text-[11px] text-stone">{label}</span>
    </div>
  );
}

function StatusBadge({ activated, active }: { activated: boolean; active: boolean }) {
  if (!activated) {
    return (
      <span className="rounded bg-bone-raised px-1.5 py-0.5 text-mono-medium text-[9px] text-stone">
        trial
      </span>
    );
  }
  if (active) {
    return (
      <span className="rounded bg-status-success/10 px-1.5 py-0.5 text-mono-medium text-[9px] text-status-success">
        active
      </span>
    );
  }
  return (
    <span className="rounded bg-bone-raised px-1.5 py-0.5 text-mono-medium text-[9px] text-stone">
      activated
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-10 text-right">
      <p className="text-mono-medium text-[13px] text-ink">{value}</p>
      <p className="text-[9px] text-stone">{label}</p>
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
