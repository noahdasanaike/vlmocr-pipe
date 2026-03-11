"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Upload,
  X,
  Plus,
  Loader2,
  BarChart3,
  ImageIcon,
} from "lucide-react";
import type { EvalProvider, EvalModel } from "@/lib/types";

type CompareResult = {
  modelId: string;
  modelName: string;
  outputs: { filename: string; text: string }[];
};

type FlatModel = EvalModel & { providerName: string };

export default function ComparePage() {
  const [images, setImages] = useState<File[]>([]);
  const [models, setModels] = useState<FlatModel[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [schema, setSchema] = useState<Record<string, string>>({});
  const [useSchema, setUseSchema] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CompareResult[] | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Load models
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/benchmarks/models");
        if (!res.ok) return;
        const { models: m, providers: p } = await res.json();
        const excludeSlugs = ["ollama", "vllm", "replicate"];
        const flat = (p as EvalProvider[])
          .filter((prov) => !excludeSlugs.includes(prov.slug))
          .flatMap((prov) =>
            (m as EvalModel[])
              .filter((mod) => mod.provider_id === prov.id)
              .map((mod) => ({ ...mod, providerName: prov.name }))
          )
          .sort((a, b) => a.name.localeCompare(b.name));
        setModels(flat);
      } catch {
        /* ignore */
      }
    }
    load();
  }, []);

  function addImages(files: FileList | File[]) {
    const newFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/")
    );
    setImages((prev) => [...prev, ...newFiles]);
    setResults(null);
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setResults(null);
  }

  function toggleModel(id: string) {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  }

  function addSchemaField() {
    const key = `field${Object.keys(schema).length + 1}`;
    setSchema((prev) => ({ ...prev, [key]: "" }));
  }

  function updateSchemaKey(oldKey: string, newKey: string) {
    if (newKey === oldKey) return;
    setSchema((prev) => {
      const entries = Object.entries(prev);
      const updated: Record<string, string> = {};
      for (const [k, v] of entries) {
        updated[k === oldKey ? newKey : k] = v;
      }
      return updated;
    });
  }

  function updateSchemaValue(key: string, value: string) {
    setSchema((prev) => ({ ...prev, [key]: value }));
  }

  function removeSchemaField(key: string) {
    setSchema((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function runCompare() {
    if (images.length === 0 || selectedModels.size === 0) return;
    setRunning(true);
    setResults(null);
    try {
      const fd = new FormData();
      fd.append("model_ids", JSON.stringify(Array.from(selectedModels)));
      if (useSchema && Object.keys(schema).length > 0) {
        fd.append("extraction_schema", JSON.stringify(schema));
      }
      for (const img of images) {
        fd.append("images", img);
      }
      const res = await fetch("/api/quick-compare", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Compare failed");
      }
      const data = await res.json();
      setResults(data.results);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Compare failed");
    } finally {
      setRunning(false);
    }
  }

  const canRun = images.length > 0 && selectedModels.size >= 1 && !running;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Compare Models</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload images and compare model outputs side by side — no job needed.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left: images + results */}
        <div className="space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length > 0) addImages(e.dataTransfer.files);
            }}
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver
                ? "border-indigo-400 bg-indigo-50"
                : "border-slate-200 bg-slate-50/50"
            }`}
          >
            <Upload className="mx-auto h-8 w-8 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">
              Drag & drop images here, or{" "}
              <label className="text-indigo-600 hover:text-indigo-700 cursor-pointer font-medium">
                browse
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addImages(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </p>
          </div>

          {/* Image previews */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {images.map((file, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="h-24 w-24 rounded-lg object-cover border border-slate-200"
                  />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-800 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <p className="text-[9px] text-slate-400 mt-0.5 max-w-[96px] truncate">
                    {file.name}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-900">Results</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600 border-b min-w-[140px]">
                        Image
                      </th>
                      {results.map((r) => (
                        <th
                          key={r.modelId}
                          className="text-left px-4 py-2.5 font-medium text-slate-600 border-b min-w-[200px]"
                        >
                          {r.modelName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results[0]?.outputs.map((_, idx) => {
                      const fname = results[0].outputs[idx].filename;
                      const file = images.find((f) => f.name === fname);
                      return (
                        <tr
                          key={idx}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-start gap-2">
                              {file && (
                                <img
                                  src={URL.createObjectURL(file)}
                                  alt=""
                                  className="h-16 w-16 rounded object-cover flex-shrink-0 border border-slate-100"
                                />
                              )}
                              <span className="font-mono text-slate-500 text-[10px] break-all mt-1">
                                {fname}
                              </span>
                            </div>
                          </td>
                          {results.map((r) => (
                            <td
                              key={r.modelId}
                              className="px-4 py-3 text-slate-800 align-top max-w-[350px] whitespace-pre-wrap break-words text-[11px] leading-relaxed"
                            >
                              {r.outputs[idx]?.text ?? "\u2014"}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar: model selection + schema + run */}
        <div className="space-y-5">
          {/* Model selection */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Models</h3>
              <span className="text-[10px] text-slate-400">
                {selectedModels.size}/4 selected
              </span>
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {models.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 cursor-pointer transition-colors text-sm ${
                    selectedModels.has(model.id)
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-100 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedModels.has(model.id)}
                    onChange={() => toggleModel(model.id)}
                    className="accent-indigo-600"
                  />
                  <span className="flex-1 text-slate-900 text-xs">
                    {model.name}
                  </span>
                  <span className="text-[9px] text-slate-400">
                    {model.providerName}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Extraction schema (optional) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Extraction Schema
              </h3>
              <button
                type="button"
                role="switch"
                aria-checked={useSchema}
                onClick={() => {
                  setUseSchema(!useSchema);
                  if (!useSchema && Object.keys(schema).length === 0) {
                    setSchema({ name: "Person's full name" });
                  }
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  useSchema ? "bg-indigo-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    useSchema ? "translate-x-[18px]" : "translate-x-[2px]"
                  }`}
                />
              </button>
            </div>
            {useSchema && (
              <div className="space-y-2">
                <p className="text-[10px] text-slate-400">
                  Define fields to extract as JSON.
                </p>
                {Object.entries(schema).map(([key, desc]) => (
                  <div key={key} className="flex gap-1.5">
                    <Input
                      placeholder="Field"
                      value={key}
                      onChange={(e) => updateSchemaKey(key, e.target.value)}
                      className="w-1/3 rounded-lg text-xs h-8"
                    />
                    <Input
                      placeholder="Description"
                      value={desc}
                      onChange={(e) => updateSchemaValue(key, e.target.value)}
                      className="flex-1 rounded-lg text-xs h-8"
                    />
                    <button
                      onClick={() => removeSchemaField(key)}
                      className="px-1.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addSchemaField}
                  className="rounded-lg text-xs h-7 w-full"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Field
                </Button>
              </div>
            )}
            {!useSchema && (
              <p className="text-[10px] text-slate-400">
                Off = raw transcription. Enable to extract structured fields.
              </p>
            )}
          </div>

          {/* Run button */}
          <Button
            className="w-full rounded-xl h-10"
            disabled={!canRun}
            onClick={runCompare}
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Comparing...
              </>
            ) : (
              <>
                <BarChart3 className="mr-2 h-4 w-4" />
                Compare {selectedModels.size} model{selectedModels.size !== 1 ? "s" : ""} on{" "}
                {images.length} image{images.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
