"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArtFooter } from "@/components/art-footer";
import { Database, Trash2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { SavedModel } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "\u2014";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function ModelsPage() {
  const [models, setModels] = useState<(SavedModel & { size_bytes?: number; file_count?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/models");
        if (res.ok) {
          const data = await res.json();
          setModels(data);
        }
      } catch {
        // API unavailable
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
      setModels((prev) => prev.filter((m) => m.id !== id));
      toast.success("Model and adapter files deleted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  function handleDownload(model: SavedModel) {
    const path = encodeURIComponent(model.storage_path);
    window.open(`/api/files/${path}/adapter_config.json`, "_blank");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Saved Models</h1>
        <p className="mt-1 text-sm text-slate-500">
          Fine-tuned model adapters from your completed jobs
        </p>
      </div>

      {models.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto rounded-full bg-slate-50 p-4 w-fit">
            <Database className="h-8 w-8 text-slate-400" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-700">No saved models yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Complete a job to save a fine-tuned adapter here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {models.map((model) => (
            <div
              key={model.id}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4"
            >
              <div className="rounded-lg bg-indigo-50 p-2">
                <Database className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {model.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {model.job_id && (
                    <Badge variant="outline" className="font-mono text-[10px] h-5">
                      {model.job_id.slice(0, 8)}
                    </Badge>
                  )}
                  <span className="text-xs text-slate-400">
                    {formatBytes(model.size_bytes ?? 0)}
                    {model.file_count ? ` \u00b7 ${model.file_count} files` : ""}
                  </span>
                </div>
              </div>
              <span className="text-xs text-slate-400 shrink-0 hidden sm:block">
                {new Date(model.created_at).toLocaleDateString()}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Download adapter config"
                  onClick={() => handleDownload(model)}
                  className="h-8 w-8"
                >
                  <Download className="h-3.5 w-3.5 text-slate-400" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Delete model"
                  onClick={() => handleDelete(model.id)}
                  disabled={deleting === model.id}
                  className="h-8 w-8"
                >
                  {deleting === model.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ArtFooter page="models" />
    </div>
  );
}
