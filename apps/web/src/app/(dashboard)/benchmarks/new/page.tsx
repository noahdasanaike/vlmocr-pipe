"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArtFooter } from "@/components/art-footer";
import { ArrowLeft, ArrowRight, Loader2, Check } from "lucide-react";
import type { BenchmarkDataset, EvalModel, EvalProvider } from "@/lib/types";

type Step = "dataset" | "models" | "review";

export default function NewBenchmarkPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("dataset");
  const [name, setName] = useState("");
  const [datasets, setDatasets] = useState<BenchmarkDataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [providers, setProviders] = useState<(EvalProvider & { models: EvalModel[] })[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const [dsRes, modelsRes] = await Promise.all([
        fetch("/api/benchmarks/datasets"),
        fetch("/api/benchmarks/models"),
      ]);

      if (dsRes.ok) {
        setDatasets(await dsRes.json() as BenchmarkDataset[]);
      }
      if (modelsRes.ok) {
        const { models, providers: provs } = await modelsRes.json();
        const grouped = (provs as EvalProvider[]).map((p: EvalProvider) => ({
          ...p,
          models: (models as EvalModel[]).filter((m: EvalModel) => m.provider_id === p.id),
        })).filter((p: EvalProvider & { models: EvalModel[] }) => p.models.length > 0);
        setProviders(grouped);
      }
    }
    load();
  }, []);

  function toggleModel(id: string) {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || "Benchmark Run",
          dataset_id: selectedDataset,
          model_ids: Array.from(selectedModels),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create benchmark");
        setSubmitting(false);
        return;
      }
      const run = await res.json();
      router.push(`/benchmarks/${run.id}`);
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  const selectedDatasetObj = datasets.find((d) => d.id === selectedDataset);
  const totalCost = Array.from(selectedModels).reduce((sum, mid) => {
    const model = providers.flatMap((p) => p.models).find((m) => m.id === mid);
    return sum + (model?.cost_per_image_credits ?? 0) * (selectedDatasetObj?.sample_count ?? 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="rounded-lg">
          <Link href="/benchmarks">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">New Benchmark</h1>
          <p className="text-sm text-slate-400">Compare models on a benchmark dataset</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {(["dataset", "models", "review"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                step === s
                  ? "bg-indigo-600 text-white"
                  : (i < ["dataset", "models", "review"].indexOf(step))
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {i < ["dataset", "models", "review"].indexOf(step) ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-xs font-medium ${step === s ? "text-slate-900" : "text-slate-400"}`}>
              {s === "dataset" ? "Dataset" : s === "models" ? "Models" : "Review"}
            </span>
            {i < 2 && <div className="mx-2 h-px w-8 bg-slate-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Dataset */}
      {step === "dataset" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div>
            <Label htmlFor="name" className="text-sm font-medium">Run Name</Label>
            <Input
              id="name"
              placeholder="e.g. GPT vs Gemini on SocOCRBench"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 rounded-lg"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Select Dataset</Label>
              <Link
                href="/benchmarks/datasets/new"
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Upload your own
              </Link>
            </div>
            <div className="mt-2 space-y-2">
              {datasets.map((ds) => (
                <label
                  key={ds.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    selectedDataset === ds.id
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="dataset"
                    checked={selectedDataset === ds.id}
                    onChange={() => setSelectedDataset(ds.id)}
                    className="accent-indigo-600"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{ds.name}</p>
                    {ds.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{ds.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{ds.sample_count} samples</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => setStep("models")}
              disabled={!selectedDataset}
              className="rounded-lg"
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Select Models */}
      {step === "models" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Select Models to Compare</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose models from multiple providers. Each model will process all {selectedDatasetObj?.sample_count ?? 0} samples.
            </p>
          </div>

          {providers.map((provider) => (
            <div key={provider.id}>
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                {provider.name}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {provider.models.map((model) => (
                  <label
                    key={model.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      selectedModels.has(model.id)
                        ? "border-indigo-300 bg-indigo-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedModels.has(model.id)}
                      onChange={() => toggleModel(model.id)}
                      className="accent-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{model.name}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {model.cost_per_image_credits} cr/img
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("dataset")} className="rounded-lg">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => setStep("review")}
              disabled={selectedModels.size === 0}
              className="rounded-lg"
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Launch */}
      {step === "review" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <h3 className="text-sm font-semibold text-slate-900">Review & Launch</h3>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-400">Dataset</p>
              <p className="text-sm font-medium text-slate-900 mt-0.5">
                {selectedDatasetObj?.name ?? "\u2014"}
              </p>
              <p className="text-xs text-slate-400">{selectedDatasetObj?.sample_count} samples</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Models</p>
              <p className="text-sm font-medium text-slate-900 mt-0.5">{selectedModels.size} selected</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Estimated Cost</p>
              <p className="text-sm font-medium text-slate-900 mt-0.5">{totalCost.toFixed(0)} credits</p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-2">Selected models:</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selectedModels).map((mid) => {
                const model = providers.flatMap((p) => p.models).find((m) => m.id === mid);
                return (
                  <span
                    key={mid}
                    className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                  >
                    {model?.name ?? mid}
                  </span>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("models")} className="rounded-lg">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-lg"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Launch Benchmark
            </Button>
          </div>
        </div>
      )}

      <ArtFooter page="benchmarks/new" />
    </div>
  );
}
