"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArtFooter } from "@/components/art-footer";
import { ArrowLeft, Download, Loader2, BarChart3, Square } from "lucide-react";
import type { BenchmarkRun, BenchmarkRunModel, BenchmarkRunStatus } from "@/lib/types";

const statusConfig: Record<BenchmarkRunStatus, { color: string; bg: string; label: string }> = {
  pending: { color: "text-slate-600", bg: "bg-slate-100", label: "Queued" },
  running: { color: "text-indigo-700", bg: "bg-indigo-50", label: "Running" },
  complete: { color: "text-emerald-700", bg: "bg-emerald-50", label: "Complete" },
  failed: { color: "text-red-700", bg: "bg-red-50", label: "Failed" },
  cancelled: { color: "text-slate-500", bg: "bg-slate-100", label: "Cancelled" },
};

interface SampleResult {
  model: string;
  filename: string;
  ground_truth: string;
  predicted_text: string;
  nes: number | null;
  cer: number | null;
  f1: number | null;
  latency_ms: number | null;
  error: string | null;
  region: string;
  period: string;
  format: string;
  dataset: string;
}

export default function BenchmarkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [results, setResults] = useState<SampleResult[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSample, setViewerSample] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    async function fetchRun() {
      const res = await fetch(`/api/benchmarks/${id}`);
      if (res.ok) {
        const data = await res.json();
        setRun(data as BenchmarkRun);
      }
    }

    async function fetchResults() {
      const res = await fetch(`/api/benchmarks/${id}/results`);
      if (res.ok) {
        setResults(await res.json());
      }
    }

    fetchRun();
    fetchResults();

    const interval = setInterval(() => {
      fetchRun();
      fetchResults();
    }, 5000);

    return () => clearInterval(interval);
  }, [id]);

  async function cancelRun() {
    setActionLoading("cancel");
    try {
      await fetch(`/api/benchmarks/${id}`, { method: "DELETE" });
      const res = await fetch(`/api/benchmarks/${id}`);
      if (res.ok) setRun(await res.json());
    } finally {
      setActionLoading(null);
    }
  }

  if (!run) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const isActive = ["pending", "running"].includes(run.status);
  const overallProgress = run.status === "complete"
    ? 100
    : run.total_samples > 0
      ? Math.round((run.completed_samples / (run.total_samples * (run.run_models?.length ?? 1))) * 100)
      : 0;

  const cfg = statusConfig[run.status];
  const runModels = run.run_models ?? [];

  const sortedModels = [...runModels].sort((a, b) => {
    if (!sortCol) return (b.sococrbench_score ?? 0) - (a.sococrbench_score ?? 0);
    const getVal = (rm: BenchmarkRunModel): number => {
      switch (sortCol) {
        case "sococrbench": return rm.sococrbench_score ?? 0;
        case "region": return rm.macro_nes_region ?? 0;
        case "period": return rm.macro_nes_period ?? 0;
        case "format": return rm.macro_nes_format ?? 0;
        case "nes": return rm.avg_nes ?? 0;
        case "cer": return rm.avg_cer ?? 0;
        case "latency": return rm.avg_latency_ms ?? Infinity;
        case "errors": return rm.error_count ?? 0;
        default: return 0;
      }
    };
    const av = getVal(a), bv = getVal(b);
    return sortDir === "asc" ? av - bv : bv - av;
  });

  // Get unique sample filenames for the sample browser
  const uniqueSamples = [...new Set(results.map((r) => r.filename))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild className="mt-0.5 rounded-lg">
          <Link href="/benchmarks">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900 truncate">{run.name}</h1>
            <Badge
              variant="secondary"
              className={`${cfg.bg} ${cfg.color} border-0 text-xs font-medium shrink-0`}
            >
              {isActive && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {cfg.label}
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">
            {run.dataset?.name ?? "Dataset"} &middot; {runModels.length} models &middot; Created {new Date(run.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isActive && (
            <Button
              variant="outline" size="sm"
              className="rounded-lg text-xs h-8 text-slate-600"
              onClick={cancelRun}
              disabled={actionLoading !== null}
            >
              {actionLoading === "cancel" ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Square className="mr-1.5 h-3 w-3" />
              )}
              Cancel
            </Button>
          )}
          {run.status === "complete" && (
            <>
              <Button variant="outline" size="sm" asChild className="rounded-lg text-xs h-8">
                <a href={`/api/benchmarks/${id}/results?format=csv`} download>
                  <Download className="mr-1 h-3 w-3" />
                  CSV
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild className="rounded-lg text-xs h-8">
                <a href={`/api/benchmarks/${id}/results?format=json`} download>
                  <Download className="mr-1 h-3 w-3" />
                  JSON
                </a>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-600">
              {run.status === "pending" ? "Waiting to start..." : "Evaluating models on benchmark samples..."}
            </span>
            <span className="font-medium text-slate-900">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          {run.error_message && (
            <p className="mt-3 text-sm text-red-600">{run.error_message}</p>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MiniStat
          icon={<BarChart3 className="h-4 w-4 text-slate-400" />}
          label="Samples"
          value={String(run.total_samples)}
        />
        <MiniStat
          icon={<BarChart3 className="h-4 w-4 text-indigo-500" />}
          label="Models"
          value={String(runModels.length)}
        />
        <MiniStat
          icon={<BarChart3 className="h-4 w-4 text-emerald-500" />}
          label="Completed"
          value={String(run.completed_samples)}
        />
      </div>

      {/* Comparison table */}
      {runModels.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Model Comparison</h3>
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Model</TableHead>
                  <TableHead
                    className="text-xs text-right cursor-pointer hover:bg-slate-100 select-none"
                    title="Overall benchmark score. Macro-average of NES across regions (Europe, East Asia, South Asia, SE Asia, MENA, East Africa)."
                    onClick={() => {
                      if (sortCol === "sococrbench") setSortDir(sortDir === "asc" ? "desc" : "asc");
                      else { setSortCol("sococrbench"); setSortDir("desc"); }
                    }}
                  >
                    SocOCRBench {sortCol === "sococrbench" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
                  </TableHead>
                  <TableHead
                    className="text-xs text-right cursor-pointer hover:bg-slate-100 select-none"
                    title="1.0 = perfect match, 0.0 = completely different. Measures character-level similarity between prediction and ground truth."
                    onClick={() => {
                      if (sortCol === "region") setSortDir(sortDir === "asc" ? "desc" : "asc");
                      else { setSortCol("region"); setSortDir("desc"); }
                    }}
                  >
                    Region NES {sortCol === "region" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
                  </TableHead>
                  <TableHead
                    className="text-xs text-right cursor-pointer hover:bg-slate-100 select-none"
                    title="1.0 = perfect match, 0.0 = completely different. Measures character-level similarity between prediction and ground truth."
                    onClick={() => {
                      if (sortCol === "period") setSortDir(sortDir === "asc" ? "desc" : "asc");
                      else { setSortCol("period"); setSortDir("desc"); }
                    }}
                  >
                    Period NES {sortCol === "period" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
                  </TableHead>
                  <TableHead
                    className="text-xs text-right cursor-pointer hover:bg-slate-100 select-none"
                    title="1.0 = perfect match, 0.0 = completely different. Measures character-level similarity between prediction and ground truth."
                    onClick={() => {
                      if (sortCol === "format") setSortDir(sortDir === "asc" ? "desc" : "asc");
                      else { setSortCol("format"); setSortDir("desc"); }
                    }}
                  >
                    Format NES {sortCol === "format" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
                  </TableHead>
                  <TableHead
                    className="text-xs text-right cursor-pointer hover:bg-slate-100 select-none"
                    title="1.0 = perfect match, 0.0 = completely different. Measures character-level similarity between prediction and ground truth."
                    onClick={() => {
                      if (sortCol === "nes") setSortDir(sortDir === "asc" ? "desc" : "asc");
                      else { setSortCol("nes"); setSortDir("desc"); }
                    }}
                  >
                    Avg NES {sortCol === "nes" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
                  </TableHead>
                  <TableHead
                    className="text-xs text-right cursor-pointer hover:bg-slate-100 select-none"
                    title="0.0 = perfect, 1.0 = all characters wrong. Lower is better."
                    onClick={() => {
                      if (sortCol === "cer") setSortDir(sortDir === "asc" ? "desc" : "asc");
                      else { setSortCol("cer"); setSortDir("desc"); }
                    }}
                  >
                    Avg CER {sortCol === "cer" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
                  </TableHead>
                  <TableHead
                    className="text-xs text-right cursor-pointer hover:bg-slate-100 select-none"
                    title="Average time per image in milliseconds."
                    onClick={() => {
                      if (sortCol === "latency") setSortDir(sortDir === "asc" ? "desc" : "asc");
                      else { setSortCol("latency"); setSortDir("desc"); }
                    }}
                  >
                    Latency {sortCol === "latency" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
                  </TableHead>
                  <TableHead
                    className="text-xs text-right cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => {
                      if (sortCol === "errors") setSortDir(sortDir === "asc" ? "desc" : "asc");
                      else { setSortCol("errors"); setSortDir("desc"); }
                    }}
                  >
                    Errors {sortCol === "errors" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
                  </TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedModels.map((rm) => (
                  <TableRow key={rm.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-medium text-sm text-slate-900">
                      {rm.model?.name ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {rm.sococrbench_score != null ? rm.sococrbench_score.toFixed(4) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-slate-600">
                      {rm.macro_nes_region != null ? rm.macro_nes_region.toFixed(4) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-slate-600">
                      {rm.macro_nes_period != null ? rm.macro_nes_period.toFixed(4) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-slate-600">
                      {rm.macro_nes_format != null ? rm.macro_nes_format.toFixed(4) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-slate-600">
                      {rm.avg_nes != null ? rm.avg_nes.toFixed(4) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-slate-600">
                      {rm.avg_cer != null ? rm.avg_cer.toFixed(4) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-slate-500">
                      {rm.avg_latency_ms != null ? `${(rm.avg_latency_ms / 1000).toFixed(1)}s` : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-slate-500">
                      {rm.error_count}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        rm.status === "complete"
                          ? "bg-emerald-50 text-emerald-700"
                          : rm.status === "running"
                            ? "bg-indigo-50 text-indigo-700"
                            : rm.status === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-slate-100 text-slate-600"
                      }`}>
                        {rm.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Sample browser */}
      {results.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Sample Results</h3>
            <p className="text-xs text-slate-400">{uniqueSamples.length} samples, click to view details</p>
          </div>
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Filename</TableHead>
                  <TableHead className="text-xs">Region</TableHead>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs">Format</TableHead>
                  {runModels.map((rm) => (
                    <TableHead key={rm.id} className="text-xs text-right">
                      {rm.model?.name ?? "Model"}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {uniqueSamples.slice(0, 100).map((filename) => {
                  const sampleResults = results.filter((r) => r.filename === filename);
                  const first = sampleResults[0];
                  return (
                    <TableRow
                      key={filename}
                      className="hover:bg-slate-50/50 cursor-pointer"
                      onClick={() => {
                        setViewerSample(filename);
                        setViewerOpen(true);
                      }}
                    >
                      <TableCell className="font-mono text-xs text-slate-600">
                        {filename}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{first?.region}</TableCell>
                      <TableCell className="text-xs text-slate-500">{first?.period}</TableCell>
                      <TableCell className="text-xs text-slate-500">{first?.format}</TableCell>
                      {runModels.map((rm) => {
                        const r = sampleResults.find((s) => s.model === rm.model?.name);
                        return (
                          <TableCell key={rm.id} className="text-right font-mono text-xs">
                            {r?.error ? (
                              <span className="text-red-500">ERR</span>
                            ) : r?.nes != null ? (
                              <span className={r.nes >= 0.8 ? "text-emerald-600" : r.nes >= 0.5 ? "text-amber-600" : "text-red-600"}>
                                {r.nes.toFixed(3)}
                              </span>
                            ) : "\u2014"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Sample viewer dialog */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">{viewerSample}</DialogTitle>
          </DialogHeader>
          {viewerSample && (
            <SampleViewer filename={viewerSample} results={results} />
          )}
        </DialogContent>
      </Dialog>

      <ArtFooter page="benchmarks/detail" />
    </div>
  );
}

function SampleViewer({ filename, results }: { filename: string; results: SampleResult[] }) {
  const sampleResults = results.filter((r) => r.filename === filename);
  const gt = sampleResults[0]?.ground_truth ?? "";

  return (
    <div className="space-y-4">
      {/* Ground truth */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-1">Ground Truth</p>
        <pre className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap max-h-40 overflow-auto">
          {gt}
        </pre>
      </div>

      {/* Model predictions */}
      {sampleResults.map((r) => (
        <div key={r.model}>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-medium text-slate-900">{r.model}</p>
            {r.nes != null && (
              <span title="1.0 = perfect match, 0.0 = completely different. Measures character-level similarity between prediction and ground truth." className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                r.nes >= 0.8 ? "bg-emerald-50 text-emerald-700" :
                r.nes >= 0.5 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
              }`}>
                NES {r.nes.toFixed(4)}
              </span>
            )}
            {r.cer != null && (
              <span title="0.0 = perfect, 1.0 = all characters wrong. Lower is better." className="text-[10px] text-slate-400">CER {r.cer.toFixed(4)}</span>
            )}
            {r.latency_ms != null && (
              <span title="Average time per image in milliseconds." className="text-[10px] text-slate-400">{(r.latency_ms / 1000).toFixed(1)}s</span>
            )}
          </div>
          {r.error ? (
            <p className="rounded-lg bg-red-50 p-3 text-xs text-red-600">{r.error}</p>
          ) : (
            <pre className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap max-h-40 overflow-auto">
              {r.predicted_text}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] text-slate-400">{label}</span>
      </div>
      <p className="text-lg font-semibold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}
