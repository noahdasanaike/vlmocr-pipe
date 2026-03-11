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
import { ImageViewer } from "@/components/image-viewer";
import { ArtFooter } from "@/components/art-footer";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2, Images, Tag, Cpu, Terminal, Play, Check, Square, Trash2, RotateCcw, Eye, BarChart3, Database, Pause } from "lucide-react";
import type { Job, JobImage, JobStatus } from "@/lib/types";
import { toast } from "sonner";

const statusConfig: Record<JobStatus, { color: string; bg: string; label: string }> = {
  pending: { color: "text-slate-600", bg: "bg-slate-100", label: "Queued" },
  uploading: { color: "text-blue-700", bg: "bg-blue-50", label: "Uploading" },
  labeling: { color: "text-amber-700", bg: "bg-amber-50", label: "Labeling" },
  training: { color: "text-violet-700", bg: "bg-violet-50", label: "Training" },
  inferring: { color: "text-indigo-700", bg: "bg-indigo-50", label: "Inferring" },
  complete: { color: "text-emerald-700", bg: "bg-emerald-50", label: "Complete" },
  failed: { color: "text-red-700", bg: "bg-red-50", label: "Failed" },
  cancelled: { color: "text-slate-500", bg: "bg-slate-100", label: "Cancelled" },
  paused: { color: "text-orange-700", bg: "bg-orange-50", label: "Paused" },
};

const statusMessages: Record<JobStatus, string> = {
  pending: "Job is queued and waiting to start...",
  uploading: "Images are being uploaded...",
  labeling: "Labeling your training images...",
  training: "Fine-tuning the model locally (this may take 10-30 min)...",
  inferring: "Running inference on remaining images...",
  complete: "All done! Your results are ready.",
  failed: "Something went wrong.",
  cancelled: "Job was cancelled.",
  paused: "Job is paused. Resume to continue processing.",
};

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [images, setImages] = useState<JobImage[]>([]);
  const [starting, setStarting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [viewerImage, setViewerImage] = useState<JobImage | null>(null);

  async function fetchJob() {
    const res = await fetch(`/api/jobs/${id}`);
    if (res.ok) {
      const data = await res.json();
      setJob(data as Job);
    }
  }

  async function fetchImages() {
    const res = await fetch(`/api/jobs/${id}/images`);
    if (res.ok) {
      const data = await res.json();
      setImages(data as JobImage[]);
    }
  }

  async function cancelJob() {
    setActionLoading("cancel");
    try {
      await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      await fetchJob();
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteJob() {
    setActionLoading("delete");
    try {
      await fetch(`/api/jobs/${id}?purge=true`, { method: "DELETE" });
      router.push("/dashboard");
    } catch {
      setActionLoading(null);
    }
  }

  async function retryJob() {
    setActionLoading("retry");
    try {
      const res = await fetch(`/api/jobs/${id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await fetchJob();
      }
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    fetchJob();
    fetchImages();

    const interval = setInterval(() => {
      fetchJob();
      fetchImages();
    }, 5000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!job) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const isActive = ["pending", "uploading", "labeling", "training", "inferring"].includes(
    job.status
  );

  const isInferenceOnly = job.mode === "inference_only";

  const overallProgress =
    job.status === "complete"
      ? 100
      : isInferenceOnly
        ? (job.status === "inferring"
          ? Math.round((job.inferred_count / Math.max(job.infer_images, 1)) * 100)
          : 0)
        : job.status === "labeling"
          ? Math.round((job.labeled_count / Math.max(job.label_images, 1)) * 40)
          : job.status === "training"
            ? 60
            : job.status === "inferring"
              ? 60 +
                Math.round(
                  (job.inferred_count / Math.max(job.infer_images, 1)) * 40
                )
              : 0;

  const completedImages = images.filter(
    (img) => img.predicted_result !== null || img.gemini_label !== null
  );

  const cfg = statusConfig[job.status];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild className="mt-0.5 rounded-lg">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900 truncate">
              {job.name}
            </h1>
            <Badge
              variant="secondary"
              className={`${cfg.bg} ${cfg.color} border-0 text-xs font-medium shrink-0`}
            >
              {isActive && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {cfg.label}
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">
            Created {new Date(job.created_at).toLocaleString()}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Cancel — for active jobs */}
          {isActive && job.status !== "uploading" && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs h-8 text-slate-600"
              onClick={cancelJob}
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

          {/* Pause — for labeling/inferring jobs */}
          {["labeling", "inferring"].includes(job.status) && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs h-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50 hover:border-orange-200"
              onClick={async () => {
                setActionLoading("pause");
                try {
                  await fetch(`/api/jobs/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "pause" }),
                  });
                  await fetchJob();
                } finally {
                  setActionLoading(null);
                }
              }}
              disabled={actionLoading !== null}
            >
              {actionLoading === "pause" ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Pause className="mr-1.5 h-3 w-3" />
              )}
              Pause
            </Button>
          )}

          {/* Resume — for paused jobs */}
          {job.status === "paused" && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200"
              onClick={async () => {
                setActionLoading("resume");
                try {
                  await fetch(`/api/jobs/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "resume" }),
                  });
                  await fetchJob();
                } finally {
                  setActionLoading(null);
                }
              }}
              disabled={actionLoading !== null}
            >
              {actionLoading === "resume" ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3 w-3" />
              )}
              Resume
            </Button>
          )}

          {/* Retry — for failed jobs */}
          {job.status === "failed" && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs h-8 text-slate-600"
              onClick={retryJob}
              disabled={actionLoading !== null}
            >
              {actionLoading === "retry" ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-3 w-3" />
              )}
              Retry
            </Button>
          )}

          {/* Delete — always available */}
          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs h-8 text-red-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={actionLoading !== null}
            >
              <Trash2 className="mr-1.5 h-3 w-3" />
              Delete
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-red-600 font-medium">Sure?</span>
              <Button
                size="sm"
                className="rounded-lg text-xs h-7 bg-red-600 hover:bg-red-700"
                onClick={deleteJob}
                disabled={actionLoading !== null}
              >
                {actionLoading === "delete" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Yes, delete"
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg text-xs h-7"
                onClick={() => setShowDeleteConfirm(false)}
              >
                No
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-slate-600">{statusMessages[job.status]}</span>
          <span className="font-medium text-slate-900">{overallProgress}%</span>
        </div>
        <Progress value={overallProgress} className="h-2 mb-3" />

        {/* Per-stage breakdown for full pipeline */}
        {!isInferenceOnly && job.status !== "pending" && job.status !== "uploading" && (
          <div className="flex gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${
                job.status === "labeling" ? "bg-amber-400 animate-pulse" :
                job.labeled_count > 0 ? "bg-emerald-400" : "bg-slate-200"
              }`} />
              <span>Label {job.labeled_count}/{job.label_images}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${
                job.status === "training" ? "bg-violet-400 animate-pulse" :
                ["inferring", "complete"].includes(job.status) ? "bg-emerald-400" : "bg-slate-200"
              }`} />
              <span>Train</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${
                job.status === "inferring" ? "bg-indigo-400 animate-pulse" :
                job.status === "complete" ? "bg-emerald-400" : "bg-slate-200"
              }`} />
              <span>Infer {job.inferred_count}/{job.infer_images}</span>
            </div>
          </div>
        )}

        {/* Elapsed time */}
        {job.started_at && (
          <p className="text-xs text-slate-400 mt-2">
            {job.completed_at ? (
              <>Completed in {formatDuration(new Date(job.started_at), new Date(job.completed_at))}</>
            ) : isActive ? (
              <>Running for {formatDuration(new Date(job.started_at), new Date())}</>
            ) : job.status === "paused" ? (
              <>Paused after {formatDuration(new Date(job.started_at), new Date())}</>
            ) : null}
          </p>
        )}

        {job.error_message && !job.error_message.startsWith("paused_from:") && (
          <p className="mt-3 text-sm text-red-600">{job.error_message}</p>
        )}
      </div>

      {/* Awaiting images — show CLI instructions + start button */}
      {job.status === "uploading" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Upload Images</h3>
          </div>

          {images.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{images.length.toLocaleString()}</span> images uploaded.
                You can upload more or start the job.
              </p>
              <Button
                onClick={async () => {
                  setStarting(true);
                  try {
                    const res = await fetch(`/api/jobs/${id}/start`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({}),
                    });
                    if (!res.ok) {
                      const err = await res.json();
                      alert(err.error || "Failed to start job");
                    }
                  } finally {
                    setStarting(false);
                  }
                }}
                disabled={starting}
                className="rounded-lg"
              >
                {starting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Start Job
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                This job has no images yet. Go to the new job page to upload images.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className={`grid grid-cols-2 gap-3 ${isInferenceOnly ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        <MiniStat
          icon={<Images className="h-4 w-4 text-slate-400" />}
          label="Images"
          value={String(job.total_images)}
        />
        {!isInferenceOnly && (
          <MiniStat
            icon={<Tag className="h-4 w-4 text-amber-500" />}
            label="Labeled"
            value={`${job.labeled_count}/${job.label_images}`}
          />
        )}
        <MiniStat
          icon={<Cpu className="h-4 w-4 text-indigo-500" />}
          label="Inferred"
          value={`${job.inferred_count}/${job.infer_images}`}
        />
      </div>

      {/* Metrics summary — shown when ground truth exists */}
      {(() => {
        const withNes = images.filter((img) => img.nes != null);
        if (withNes.length === 0) return null;
        const avgNes = withNes.reduce((s, img) => s + Number(img.nes), 0) / withNes.length;
        const avgCer = withNes.reduce((s, img) => s + Number(img.cer ?? 0), 0) / withNes.length;
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat
              icon={<BarChart3 className="h-4 w-4 text-emerald-500" />}
              label="Avg NES"
              value={avgNes.toFixed(4)}
            />
            <MiniStat
              icon={<BarChart3 className="h-4 w-4 text-amber-500" />}
              label="Avg CER"
              value={avgCer.toFixed(4)}
            />
            <MiniStat
              icon={<BarChart3 className="h-4 w-4 text-slate-400" />}
              label="With GT"
              value={`${withNes.length}/${images.length}`}
            />
          </div>
        );
      })()}

      {/* Create Benchmark Dataset — shown for complete full-pipeline jobs with labeled images */}
      {job.status === "complete" && !isInferenceOnly && images.some((img) => img.gemini_label) && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-medium text-slate-900 mb-2">Create Benchmark Dataset</h3>
          <p className="text-xs text-slate-500 mb-3">
            Use this job&apos;s labeled images as a benchmark dataset. Auto-labels will serve as ground truth.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg text-xs"
            onClick={async () => {
              try {
                const res = await fetch("/api/benchmarks/datasets", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: `${job.name} Dataset`,
                    description: `Created from job "${job.name}" with ${images.filter((i) => i.gemini_label).length} labeled images.`,
                    job_id: id,
                  }),
                });
                if (!res.ok) throw new Error((await res.json()).error || "Failed");
                toast.success("Dataset created! View it in Benchmarks.");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to create dataset");
              }
            }}
          >
            <Database className="mr-1.5 h-3 w-3" />
            Create Benchmark Dataset
          </Button>
        </div>
      )}

      {/* Upload Ground Truth — shown when job is complete and no GT yet */}
      {job.status === "complete" && !images.some((img) => img.ground_truth) && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-medium text-slate-900 mb-2">Upload Ground Truth</h3>
          <p className="text-xs text-slate-500 mb-3">
            Upload a CSV with columns: filename, ground_truth. NES and CER will be computed for each matched image.
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const formData = new FormData();
              formData.append("file", file);
              const res = await fetch(`/api/jobs/${id}/metrics`, {
                method: "POST",
                body: formData,
              });
              if (res.ok) {
                // Refresh images to show metrics
                await fetchImages();
              }
            }}
            className="block text-xs text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200 file:cursor-pointer"
          />
        </div>
      )}

      {/* Config section */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">
          Configuration
        </h3>
        <div className="grid gap-4 sm:grid-cols-3 text-sm">
          {isInferenceOnly ? (
            <>
              <div>
                <p className="text-slate-400 text-xs">Mode</p>
                <p className="font-medium text-slate-900 mt-0.5">Inference Only</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">Inference Model</p>
                <p className="font-medium text-slate-900 mt-0.5">
                  {job.eval_model_api_id ?? "\u2014"}
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-slate-400 text-xs">Labeling Model</p>
                <p className="font-medium text-slate-900 mt-0.5">
                  {job.labeling_model?.name ?? "\u2014"}
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">Fine-Tune Model</p>
                <p className="font-medium text-slate-900 mt-0.5">
                  {job.finetune_model?.name ?? "\u2014"}
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">Label Ratio</p>
                <p className="font-medium text-slate-900 mt-0.5">
                  {Math.round(job.label_ratio * 100)}%
                </p>
              </div>
            </>
          )}
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-slate-400 text-xs mb-1.5">Extraction Schema</p>
          <pre className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 overflow-auto">
            {JSON.stringify(job.extraction_schema, null, 2)}
          </pre>
        </div>
        {job.model_config && Object.keys(job.model_config).length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-slate-400 text-xs mb-1.5">Model Config</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(job.model_config).map(([k, v]) => (
                <span key={k} className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">
                  <span className="font-medium text-slate-500 mr-1">{k}:</span> {String(v)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {completedImages.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Results</h3>
              <p className="text-xs text-slate-400">{completedImages.length} images processed</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild className="rounded-lg text-xs h-8">
                <a href={`/api/jobs/${id}/results?format=csv`} download>
                  <Download className="mr-1 h-3 w-3" />
                  CSV
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild className="rounded-lg text-xs h-8">
                <a href={`/api/jobs/${id}/results?format=json`} download>
                  <Download className="mr-1 h-3 w-3" />
                  JSON
                </a>
              </Button>
            </div>
          </div>
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs w-8"></TableHead>
                  <TableHead className="text-xs">Filename</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  {Object.keys(job.extraction_schema).map((field) => (
                    <TableHead key={field} className="text-xs">{field}</TableHead>
                  ))}
                  {images.some((img) => img.nes != null) && (
                    <TableHead className="text-xs text-right">NES</TableHead>
                  )}
                  {images.some((img) => img.cer != null) && (
                    <TableHead className="text-xs text-right">CER</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedImages.map((img) => {
                  const result = img.predicted_result ?? img.gemini_label;
                  return (
                    <TableRow key={img.id} className="hover:bg-slate-50/50">
                      <TableCell className="w-8 px-2">
                        <button
                          onClick={() => setViewerImage(img)}
                          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {img.filename}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          img.role === "label_source"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-indigo-50 text-indigo-700"
                        }`}>
                          {img.role === "label_source" ? "Label" : "Model"}
                        </span>
                      </TableCell>
                      {Object.keys(job.extraction_schema).map((field) => (
                        <TableCell key={field} className="text-sm text-slate-700">
                          {result?.[field] ?? "\u2014"}
                        </TableCell>
                      ))}
                      {images.some((i) => i.nes != null) && (
                        <TableCell className="text-right font-mono text-xs">
                          {img.nes != null ? (
                            <span className={img.nes >= 0.8 ? "text-emerald-600" : img.nes >= 0.5 ? "text-amber-600" : "text-red-600"}>
                              {Number(img.nes).toFixed(3)}
                            </span>
                          ) : "\u2014"}
                        </TableCell>
                      )}
                      {images.some((i) => i.cer != null) && (
                        <TableCell className="text-right font-mono text-xs text-slate-500">
                          {img.cer != null ? Number(img.cer).toFixed(3) : "\u2014"}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Image viewer dialog */}
      <Dialog open={viewerImage !== null} onOpenChange={(open) => { if (!open) setViewerImage(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">{viewerImage?.filename}</DialogTitle>
          </DialogHeader>
          {viewerImage && (
            <ImageViewer
              imageId={viewerImage.id}
              transcriptions={[
                ...(viewerImage.gemini_label ? [{
                  label: "Auto Label",
                  text: JSON.stringify(viewerImage.gemini_label, null, 2),
                }] : []),
                ...(viewerImage.predicted_result ? [{
                  label: "Model Prediction",
                  text: JSON.stringify(viewerImage.predicted_result, null, 2),
                  nes: viewerImage.nes != null ? Number(viewerImage.nes) : null,
                  cer: viewerImage.cer != null ? Number(viewerImage.cer) : null,
                }] : []),
              ]}
              groundTruth={viewerImage.ground_truth ?? undefined}
            />
          )}
        </DialogContent>
      </Dialog>

      <ArtFooter page="jobs/detail" />
    </div>
  );
}

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainSec}s`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}h ${remainMin}m`;
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
