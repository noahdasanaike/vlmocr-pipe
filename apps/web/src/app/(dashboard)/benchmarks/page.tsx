"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArtFooter } from "@/components/art-footer";
import { Plus, BarChart3, Clock, CheckCircle2, Loader2, Upload } from "lucide-react";
import type { BenchmarkRun, BenchmarkRunStatus } from "@/lib/types";

const statusConfig: Record<BenchmarkRunStatus, { color: string; bg: string; label: string }> = {
  pending: { color: "text-slate-600", bg: "bg-slate-100", label: "Queued" },
  running: { color: "text-indigo-700", bg: "bg-indigo-50", label: "Running" },
  complete: { color: "text-emerald-700", bg: "bg-emerald-50", label: "Complete" },
  failed: { color: "text-red-700", bg: "bg-red-50", label: "Failed" },
  cancelled: { color: "text-slate-500", bg: "bg-slate-100", label: "Cancelled" },
};

export default function BenchmarksPage() {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRuns() {
      try {
        const res = await fetch("/api/benchmarks");
        if (res.ok) {
          const data = await res.json();
          setRuns(data as BenchmarkRun[]);
        }
      } catch {
        // ignore
      }
      setLoading(false);
    }
    fetchRuns();
    const interval = setInterval(fetchRuns, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeRuns = runs.filter((r) => ["pending", "running"].includes(r.status));
  const completedRuns = runs.filter((r) => r.status === "complete");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Benchmarks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Compare VLM models on standard OCR benchmarks
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild className="rounded-lg">
            <Link href="/benchmarks/datasets/new">
              <Upload className="mr-2 h-4 w-4" />
              Upload Dataset
            </Link>
          </Button>
          <Button asChild className="rounded-lg">
            <Link href="/benchmarks/new">
              <Plus className="mr-2 h-4 w-4" />
              New Benchmark
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Total Runs</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{runs.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-medium text-slate-500">In Progress</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{activeRuns.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium text-slate-500">Completed</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{completedRuns.length}</p>
        </div>
      </div>

      {/* Runs list */}
      {runs.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider">
            Benchmark Runs
          </h2>
          <div className="space-y-2">
            {runs.map((run) => {
              const progress = run.status === "complete"
                ? 100
                : run.total_samples > 0
                  ? Math.round((run.completed_samples / run.total_samples) * 100)
                  : 0;
              const cfg = statusConfig[run.status];
              const isActive = ["pending", "running"].includes(run.status);

              return (
                <Link
                  key={run.id}
                  href={`/benchmarks/${run.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-all hover:border-slate-300 hover:shadow-sm"
                >
                  {/* Progress ring */}
                  <div className="relative h-10 w-10 shrink-0">
                    <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                      <circle
                        cx="18" cy="18" r="15.5"
                        fill="none" stroke="currentColor" strokeWidth="2.5"
                        className="text-slate-100"
                      />
                      <circle
                        cx="18" cy="18" r="15.5"
                        fill="none" stroke="currentColor" strokeWidth="2.5"
                        strokeDasharray={`${progress * 0.975} 100`}
                        strokeLinecap="round"
                        className={
                          run.status === "complete" ? "text-emerald-500" :
                          run.status === "failed" ? "text-red-400" : "text-indigo-500"
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
                      {run.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {run.total_samples} samples
                      {run.dataset ? ` \u00b7 ${run.dataset.name}` : ""}
                    </p>
                  </div>

                  {/* Status badge */}
                  <Badge
                    variant="secondary"
                    className={`${cfg.bg} ${cfg.color} border-0 text-xs font-medium`}
                  >
                    {isActive && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    {cfg.label}
                  </Badge>

                  {/* Date */}
                  <span className="text-xs text-slate-400 shrink-0 hidden sm:block">
                    {new Date(run.created_at).toLocaleDateString()}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No benchmarks yet</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            Run a benchmark to compare OCR models on standard datasets.
          </p>
          <Button asChild className="mt-4 rounded-lg">
            <Link href="/benchmarks/new">
              <Plus className="mr-2 h-4 w-4" />
              Run Your First Benchmark
            </Link>
          </Button>
        </div>
      )}

      <ArtFooter page="benchmarks" />
    </div>
  );
}
