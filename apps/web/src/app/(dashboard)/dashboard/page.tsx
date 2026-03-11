"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArtFooter } from "@/components/art-footer";
import { Plus, FileImage, Clock, CheckCircle2, DollarSign, CircleDot, Settings, ArrowRight, Search, X, Trash2, Loader2 } from "lucide-react";
import type { Job, JobStatus } from "@/lib/types";

const statusConfig: Record<JobStatus, { color: string; bg: string }> = {
  pending: { color: "text-slate-600", bg: "bg-slate-100" },
  uploading: { color: "text-blue-700", bg: "bg-blue-50" },
  labeling: { color: "text-amber-700", bg: "bg-amber-50" },
  training: { color: "text-violet-700", bg: "bg-violet-50" },
  inferring: { color: "text-indigo-700", bg: "bg-indigo-50" },
  complete: { color: "text-emerald-700", bg: "bg-emerald-50" },
  failed: { color: "text-red-700", bg: "bg-red-50" },
  cancelled: { color: "text-slate-500", bg: "bg-slate-100" },
  paused: { color: "text-orange-700", bg: "bg-orange-50" },
};

function formatCost(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [workerAlive, setWorkerAlive] = useState<boolean | null>(null);
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch {
      // API unavailable — show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    // Check worker + keys status
    fetch("/api/worker-status").then((r) => r.json()).then((d) => setWorkerAlive(d.alive)).catch(() => setWorkerAlive(false));
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      const keyNames = ["GEMINI_API_KEY", "OPENROUTER_API_KEY", "DEEPINFRA_API_KEY", "NOVITA_API_KEY", "DASHSCOPE_API_KEY"];
      setHasKeys(keyNames.some((k) => !!d[k]));
    }).catch(() => setHasKeys(false));

    // Auto-refresh every 5s for active job progress
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  function toggleJobSelection(jobId: string, e: React.MouseEvent) {
    e.preventDefault(); // prevent Link navigation
    e.stopPropagation();
    setSelectedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  async function bulkDelete() {
    if (selectedJobs.size === 0) return;
    setBulkDeleting(true);
    try {
      await Promise.all(
        Array.from(selectedJobs).map((jobId) =>
          fetch(`/api/jobs/${jobId}?purge=true`, { method: "DELETE" })
        )
      );
      setSelectedJobs(new Set());
      await fetchJobs();
    } finally {
      setBulkDeleting(false);
    }
  }

  const activeJobs = jobs.filter((j) =>
    ["labeling", "training", "inferring"].includes(j.status)
  );
  const completedJobs = jobs.filter((j) => j.status === "complete");
  const totalSpend = jobs.reduce((s, j) => s + (j.total_cost ?? 0), 0);

  const filteredJobs = jobs.filter((j) => {
    if (statusFilter !== "all" && j.status !== statusFilter) return false;
    if (search && !j.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your OCR extraction jobs at a glance
          </p>
        </div>
        <Button asChild className="rounded-lg">
          <Link href="/jobs/new">
            <Plus className="mr-2 h-4 w-4" />
            New Job
          </Link>
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Jobs"
          value={String(jobs.length)}
          icon={<FileImage className="h-4 w-4 text-slate-400" />}
        />
        <StatCard
          label="In Progress"
          value={String(activeJobs.length)}
          icon={<Clock className="h-4 w-4 text-amber-500" />}
        />
        <StatCard
          label="Completed"
          value={String(completedJobs.length)}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        />
        <StatCard
          label="Total Spend"
          value={formatCost(totalSpend)}
          icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
        />
      </div>

      {/* Jobs list */}
      {jobs.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider shrink-0">
              Job History
            </h2>
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search jobs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-48 rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="labeling">Labeling</option>
              <option value="training">Training</option>
              <option value="inferring">Inferring</option>
              <option value="complete">Complete</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          {selectedJobs.size > 0 && (
            <div className="flex items-center gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2">
              <span className="text-xs font-medium text-red-800">
                {selectedJobs.size} job{selectedJobs.size !== 1 ? "s" : ""} selected
              </span>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-xs h-7 text-slate-600"
                onClick={() => setSelectedJobs(new Set())}
              >
                Clear
              </Button>
              <Button
                size="sm"
                className="rounded-lg text-xs h-7 bg-red-600 hover:bg-red-700"
                onClick={bulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1.5 h-3 w-3" />}
                Delete Selected
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {filteredJobs.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No jobs match your filters.</p>
            ) : filteredJobs.map((job) => {
              const progress =
                job.status === "complete"
                  ? 100
                  : job.status === "labeling"
                    ? Math.round(
                        (job.labeled_count / Math.max(job.label_images, 1)) * 50
                      )
                    : job.status === "inferring"
                      ? 50 +
                        Math.round(
                          (job.inferred_count / Math.max(job.infer_images, 1)) * 50
                        )
                      : job.status === "training"
                        ? 50
                        : 0;
              const cfg = statusConfig[job.status];
              const jobCost = job.total_cost ?? 0;

              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-all hover:border-slate-300 hover:shadow-sm"
                >
                  <div
                    className="shrink-0"
                    onClick={(e) => toggleJobSelection(job.id, e)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedJobs.has(job.id)}
                      readOnly
                      className="accent-red-600 cursor-pointer"
                    />
                  </div>

                  {/* Progress ring */}
                  <div className="relative h-10 w-10 shrink-0">
                    <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                      <circle
                        cx="18" cy="18" r="15.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className="text-slate-100"
                      />
                      <circle
                        cx="18" cy="18" r="15.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeDasharray={`${progress * 0.975} 100`}
                        strokeLinecap="round"
                        className={
                          job.status === "complete"
                            ? "text-emerald-500"
                            : job.status === "failed"
                              ? "text-red-400"
                              : "text-indigo-500"
                        }
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-600">
                      {progress}%
                    </span>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                      {job.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {job.total_images} images
                      {job.finetune_model ? ` \u00b7 ${job.finetune_model.name}` : ""}
                    </p>
                  </div>

                  {/* Cost */}
                  {jobCost > 0 && (
                    <span className="text-xs font-medium text-slate-600 shrink-0 hidden sm:block">
                      {formatCost(jobCost)}
                    </span>
                  )}

                  {/* Status badge */}
                  <Badge
                    variant="secondary"
                    className={`${cfg.bg} ${cfg.color} border-0 text-xs font-medium`}
                  >
                    {job.status}
                  </Badge>

                  {/* Date */}
                  <span className="text-xs text-slate-400 shrink-0 hidden sm:block">
                    {new Date(job.created_at).toLocaleDateString()}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        /* Empty state with setup guidance */
        <div className="space-y-4">
          {/* Setup checklist */}
          {(workerAlive === false || hasKeys === false) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Setup Checklist</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center ${
                    workerAlive ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500"
                  }`}>
                    {workerAlive ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}
                  </div>
                  <span className={workerAlive ? "text-slate-500" : "text-slate-900 font-medium"}>
                    {workerAlive ? "Worker process is running" : "Start the worker process (run start.bat or start.sh)"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center ${
                    hasKeys ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                  }`}>
                    {hasKeys ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Settings className="h-3.5 w-3.5" />}
                  </div>
                  {hasKeys ? (
                    <span className="text-slate-500">API keys configured</span>
                  ) : (
                    <Link href="/settings" className="text-slate-900 font-medium hover:text-indigo-600 flex items-center gap-1">
                      Add API keys in Settings <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-dashed border-slate-300 bg-white overflow-hidden">
            <div className="px-8 py-10 text-center">
              <h3 className="text-lg font-semibold text-slate-900">
                No jobs yet
              </h3>
              <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
                Upload document images and let AI extract structured data for you.
              </p>
              <Button asChild className="mt-4 rounded-lg">
                <Link href="/jobs/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Job
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <ArtFooter page="dashboard" />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
