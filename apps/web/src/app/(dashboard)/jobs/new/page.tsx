"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Upload,
  X,
  Plus,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
  FileImage,
  Settings2,
  Rocket,
  FolderOpen,
  FileArchive,
  Cloud,
  Globe,
  BarChart3,
  Coins,
  Zap,
} from "lucide-react";
import { ArtFooter } from "@/components/art-footer";
import type { FinetuneModel, EvalModel, EvalProvider, ExtractionSchema, JobMode } from "@/lib/types";
import { MOCK_FINETUNE_MODELS, MOCK_MODELS, MOCK_PROVIDERS } from "@/lib/mock-data";

type Step = "upload" | "configure" | "review";
type UploadMethod = "files" | "folder" | "zip" | "cloud";

/** Tracks images that will be part of the job. For cloud/zip, we don't have File objects. */
interface ImageEntry {
  filename: string;
  /** Only set for local files (drag-drop, browse, folder) */
  file?: File;
  /** Set after upload */
  path?: string;
  contentType?: string;
}

const steps: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: "upload", label: "Upload", icon: FileImage },
  { key: "configure", label: "Configure", icon: Settings2 },
  { key: "review", label: "Launch", icon: Rocket },
];

export default function NewJobPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(false);
  const [uploadMethod, setUploadMethod] = useState<UploadMethod>("files");

  // Image entries — unified across all upload methods
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [jobName, setJobName] = useState("");

  // ZIP state
  const [zipUploading, setZipUploading] = useState(false);
  const [zipProgress, setZipProgress] = useState("");

  // Cloud URL state
  const [cloudUrl, setCloudUrl] = useState("");
  const [cloudImporting, setCloudImporting] = useState(false);
  const [cloudProgress, setCloudProgress] = useState("");

  // Refs for hidden inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Set webkitdirectory via DOM API (non-standard attribute, no TS typings)
  // Must re-run when uploadMethod changes since the input is conditionally rendered
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
    }
  }, [uploadMethod]);

  // Job mode
  const [jobMode, setJobMode] = useState<JobMode>("full");

  // Eval models for inference-only mode
  const [evalProviders, setEvalProviders] = useState<(EvalProvider & { models: EvalModel[] })[]>([]);
  const [selectedEvalModel, setSelectedEvalModel] = useState("");

  // Quick Compare state
  const [qcModels, setQcModels] = useState<Set<string>>(new Set());
  const [qcRunning, setQcRunning] = useState(false);
  const [qcResults, setQcResults] = useState<{ modelId: string; modelName: string; providerSlug?: string; costPerImage?: number; costPer1k?: number; costPer1kBatch?: number; totalInputTokens?: number; totalOutputTokens?: number; outputs: { filename: string; text: string; input_tokens?: number; output_tokens?: number }[] }[] | null>(null);

  // Cost estimation state
  const [costEstimate, setCostEstimate] = useState<{
    avgOutputTokens: number;
    totalEstimatedTokens: number;
    estimatedCost: number;
    samplesUsed: number;
  } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [labelingModels, setLabelingModels] = useState<(EvalModel & { provider_name?: string; provider_slug?: string })[]>([]);
  const [finetuneModels, setFinetuneModels] = useState<FinetuneModel[]>([]);
  const [selectedLabelModel, setSelectedLabelModel] = useState("");
  const [selectedFinetuneModel, setSelectedFinetuneModel] = useState("");
  const [labelRatio, setLabelRatio] = useState(30);
  const [schema, setSchema] = useState<ExtractionSchema>({ name: "Person's full name" });

  // Model config overrides
  const [reasoningEffort, setReasoningEffort] = useState("low");
  const [mediaResolution, setMediaResolution] = useState("");
  const [structuredOutput, setStructuredOutput] = useState(false);

  useEffect(() => {
    async function loadModels() {
      try {
        const [lmRes, fmRes] = await Promise.all([
          fetch("/api/labeling-models"),
          fetch("/api/finetune-models"),
        ]);
        const lm = lmRes.ok ? await lmRes.json() : [];
        const fm = fmRes.ok ? await fmRes.json() : [];
        if (lm.length > 0) {
          setLabelingModels(lm);
          setSelectedLabelModel(lm[0].id);
        } else {
          throw new Error("No labeling models found");
        }
        if (fm.length > 0) {
          setFinetuneModels(fm);
          setSelectedFinetuneModel(fm[0].id);
        } else {
          throw new Error("No finetune models found");
        }
      } catch {
        // API unavailable — use mock data
        const lm = MOCK_MODELS.map(m => {
          const p = MOCK_PROVIDERS.find(p => p.id === m.provider_id);
          return { ...m, provider_name: p?.name, provider_slug: p?.slug } as any;
        }).filter((m: any) => m.is_active);
        const fm = MOCK_FINETUNE_MODELS as unknown as FinetuneModel[];
        setLabelingModels(lm);
        setFinetuneModels(fm);
        if (lm.length > 0) setSelectedLabelModel(lm[0].id);
        if (fm.length > 0) setSelectedFinetuneModel(fm[0].id);
      }

      // Load eval models for inference-only / quick compare
      try {
        const res = await fetch("/api/benchmarks/models");
        if (res.ok) {
          const { models, providers } = await res.json();
          const grouped = (providers as EvalProvider[])
            .map((p: EvalProvider) => ({
              ...p,
              models: (models as EvalModel[]).filter((m: EvalModel) => m.provider_id === p.id),
            }))
            .filter((p: EvalProvider & { models: EvalModel[] }) => p.models.length > 0);
          setEvalProviders(grouped);
        }
      } catch {
        // Fall back to mock data
        const grouped = MOCK_PROVIDERS.map((p) => ({
          ...p,
          models: MOCK_MODELS.filter((m) => m.provider_id === p.id) as unknown as EvalModel[],
        })).filter((p) => p.models.length > 0);
        setEvalProviders(grouped as (EvalProvider & { models: EvalModel[] })[]);
      }
    }
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- File handlers ---

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );
    setImages((prev) => [
      ...prev,
      ...dropped.map((f) => ({ filename: f.name, file: f, contentType: f.type })),
    ]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files).filter((f) =>
      f.type.startsWith("image/")
    );
    setImages((prev) => [
      ...prev,
      ...selected.map((f) => ({ filename: f.name, file: f, contentType: f.type })),
    ]);
    // Reset so same folder can be re-selected
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // --- ZIP handler ---

  async function handleZipSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setZipUploading(true);
    setZipProgress("Creating job for ZIP upload...");

    try {
      // Create a temporary job to get an ID for storage
      const tempJobRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: jobName || `Job ${new Date().toLocaleDateString()}`,
          labeling_model_id: selectedLabelModel || "placeholder",
          finetune_model_id: selectedFinetuneModel || "placeholder",
          label_ratio: labelRatio / 100,
          extraction_schema: schema,
          filenames: ["placeholder.jpg"], // Will be updated after extraction
        }),
      });

      // If we can't create job yet (no models selected), just extract locally to count
      // Actually, let's just extract the ZIP client-side to get filenames
      setZipProgress(`Extracting ${file.name}...`);

      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(file);

      const imageEntries: ImageEntry[] = [];
      const imageExts = new Set([".jpg", ".jpeg", ".png", ".tiff", ".tif", ".webp", ".bmp"]);

      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        if (path.startsWith("__MACOSX/") || path.includes("/._")) continue;
        const basename = path.split("/").pop() ?? path;
        const ext = basename.toLowerCase().slice(basename.lastIndexOf("."));
        if (!imageExts.has(ext)) continue;

        const blob = await entry.async("blob");
        const mimeMap: Record<string, string> = {
          ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
          ".tiff": "image/tiff", ".tif": "image/tiff", ".webp": "image/webp",
          ".bmp": "image/bmp",
        };
        const mime = mimeMap[ext] ?? "image/jpeg";
        const f = new File([blob], basename, { type: mime });
        imageEntries.push({ filename: basename, file: f, contentType: mime });

        if (imageEntries.length % 100 === 0) {
          setZipProgress(`Extracted ${imageEntries.length} images...`);
        }
      }

      if (imageEntries.length === 0) {
        toast.error("No image files found in ZIP");
      } else {
        setImages((prev) => [...prev, ...imageEntries]);
        toast.success(`Extracted ${imageEntries.length} images from ZIP`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process ZIP");
    } finally {
      setZipUploading(false);
      setZipProgress("");
    }
  }

  // --- Cloud import handler ---

  async function handleCloudImport() {
    if (!cloudUrl.trim()) return;

    setCloudImporting(true);
    setCloudProgress("Fetching image list from URL...");

    try {
      // Fetch the URL to discover images
      const resp = await fetch(cloudUrl.trim());
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const contentType = resp.headers.get("content-type") ?? "";
      let imageUrls: string[] = [];

      if (contentType.includes("json")) {
        const data = await resp.json();
        if (Array.isArray(data)) {
          imageUrls = data;
        } else if (data.images) {
          imageUrls = data.images;
        } else if (data.urls) {
          imageUrls = data.urls;
        }
      } else if (contentType.includes("xml")) {
        const text = await resp.text();
        const imageExts = /\.(jpg|jpeg|png|tiff|tif|webp|bmp)$/i;
        const keyMatches = text.matchAll(/<Key>([^<]+)<\/Key>/g);
        const baseUrl = cloudUrl.trim().replace(/\?.*$/, "");
        for (const match of keyMatches) {
          if (imageExts.test(match[1])) {
            imageUrls.push(
              baseUrl.endsWith("/") ? `${baseUrl}${match[1]}` : `${baseUrl}/${match[1]}`
            );
          }
        }
      } else {
        const text = await resp.text();
        imageUrls = text
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("http"));
      }

      if (imageUrls.length === 0) {
        toast.error("No image URLs found at that URL");
        return;
      }

      // Add as entries without File objects (will be downloaded server-side during job start)
      const entries: ImageEntry[] = imageUrls.map((url) => {
        const basename = new URL(url).pathname.split("/").pop() ?? "image.jpg";
        return { filename: basename, contentType: "image/jpeg" };
      });

      setImages((prev) => [...prev, ...entries]);
      setCloudProgress("");
      toast.success(`Found ${imageUrls.length} images from cloud URL`);

      // Store the cloud URL so we can pass it to the server during job creation
      setCloudUrl(cloudUrl.trim());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch URL");
    } finally {
      setCloudImporting(false);
      setCloudProgress("");
    }
  }

  // --- Schema helpers ---

  const addSchemaField = () => setSchema((prev) => ({ ...prev, "": "" }));

  const updateSchemaKey = (oldKey: string, newKey: string) => {
    const entries = Object.entries(schema);
    const updated = entries.map(([k, v]) => (k === oldKey ? [newKey, v] : [k, v]));
    setSchema(Object.fromEntries(updated));
  };

  const updateSchemaValue = (key: string, value: string) => {
    setSchema((prev) => ({ ...prev, [key]: value }));
  };

  const removeSchemaField = (key: string) => {
    const { [key]: _, ...rest } = schema;
    setSchema(rest);
  };

  // --- Computed values ---

  const allEvalModels = evalProviders.flatMap((p) => p.models);
  const selectedEvalModelObj = allEvalModels.find((m) => m.id === selectedEvalModel);
  const selectedEvalProvider = evalProviders.find((p) => p.models.some((m) => m.id === selectedEvalModel));

  // Determine if the active model is Google (to show thinking/resolution controls)
  const activeProviderSlug = jobMode === "inference_only"
    ? selectedEvalProvider?.slug
    : labelingModels.find((m) => m.id === selectedLabelModel)?.provider_slug;
  const isGoogleModel = activeProviderSlug === "google";
  const supportsStructuredOutput = ["google", "openrouter", "deepinfra", "dashscope", "novita", "vllm"].includes(activeProviderSlug ?? "");

  const labelCount = jobMode === "inference_only" ? 0 : Math.ceil(images.length * (labelRatio / 100));
  const inferCount = jobMode === "inference_only" ? images.length : images.length - labelCount;
  const selectedLM = labelingModels.find((m) => m.id === selectedLabelModel);
  const selectedFM = finetuneModels.find((m) => m.id === selectedFinetuneModel);
  const currentStepIdx = steps.findIndex((s) => s.key === step);
  const hasLocalFiles = images.some((img) => img.file);

  // --- Submit ---

  async function handleSubmit() {
    if (jobMode === "full" && (!selectedLabelModel || !selectedFinetuneModel)) return;
    if (jobMode === "inference_only" && !selectedEvalModel) return;
    if (Object.keys(schema).length === 0) {
      toast.error("Add at least one extraction field");
      return;
    }

    setLoading(true);
    try {
      const jobPayload = {
        name: jobName || `Job ${new Date().toLocaleDateString()}`,
        mode: jobMode,
        labeling_model_id: selectedLabelModel,
        finetune_model_id: selectedFinetuneModel,
        label_ratio: jobMode === "inference_only" ? 0 : labelRatio / 100,
        extraction_schema: schema,
        ...(jobMode === "inference_only" && selectedEvalModelObj && selectedEvalProvider ? {
          eval_model_id: selectedEvalModelObj.id,
          eval_model_api_id: selectedEvalModelObj.api_model_id,
          eval_model_provider_slug: selectedEvalProvider.slug,
          eval_model_provider_base_url: selectedEvalProvider.base_url,
        } : {}),
        model_config: {
          ...(reasoningEffort !== "low" ? { reasoning_effort: reasoningEffort } : {}),
          ...(mediaResolution && mediaResolution !== "default" ? { media_resolution: mediaResolution } : {}),
          ...(structuredOutput ? { structured_output: true } : {}),
        },
      };

      // Create job
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...jobPayload,
          filenames: images.map((f) => f.filename),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create job");
      }

      const { job } = await res.json();

      // Upload local files via /api/upload/images
      const localFiles = images.filter((img) => img.file);
      if (localFiles.length > 0) {
        toast.info(`Uploading ${localFiles.length} images...`);
        const BATCH_SIZE = 20;
        const allUploaded: { path: string; filename: string; contentType: string }[] = [];

        for (let batch = 0; batch < localFiles.length; batch += BATCH_SIZE) {
          const slice = localFiles.slice(batch, batch + BATCH_SIZE);
          const fd = new FormData();
          fd.append("jobId", job.id);
          for (const img of slice) {
            fd.append("images", img.file!);
          }

          const uploadRes = await fetch("/api/upload/images", {
            method: "POST",
            body: fd,
          });

          if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({ error: "Upload failed" }));
            throw new Error(err.error || "Failed to upload images");
          }

          const { files } = await uploadRes.json();
          allUploaded.push(...files);

          const uploaded = Math.min(batch + BATCH_SIZE, localFiles.length);
          if (uploaded < localFiles.length) {
            toast.info(`Uploaded ${uploaded.toLocaleString()}/${localFiles.length.toLocaleString()}...`);
          }
        }

        await fetch(`/api/jobs/${job.id}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: allUploaded }),
        });
      } else {
        // All cloud — use cloud-import API to download server-side
        toast.info("Server is downloading images from cloud URL...");
        const cloudRes = await fetch("/api/upload/cloud-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: cloudUrl, jobId: job.id }),
        });
        const cloudData = await cloudRes.json();

        if (!cloudRes.ok) throw new Error(cloudData.error);

        await fetch(`/api/jobs/${job.id}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: cloudData.files }),
        });
      }

      toast.success("Job created and pipeline started!");
      router.push(`/jobs/${job.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create job");
    } finally {
      setLoading(false);
    }
  }

  // --- Render ---

  const methodTabs: { key: UploadMethod; label: string; icon: React.ElementType }[] = [
    { key: "files", label: "Browse Files", icon: FileImage },
    { key: "folder", label: "Select Folder", icon: FolderOpen },
    { key: "zip", label: "Upload ZIP", icon: FileArchive },
    { key: "cloud", label: "Cloud URL", icon: Globe },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">New Extraction Job</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload images, configure your pipeline, and launch
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isDone = i < currentStepIdx;
          const isCurrent = s.key === step;
          return (
            <div key={s.key} className="flex items-center gap-1">
              {i > 0 && (
                <div className={`h-px w-8 ${i <= currentStepIdx ? "bg-slate-900" : "bg-slate-200"}`} />
              )}
              <button
                onClick={() => { if (i < currentStepIdx) setStep(s.key); }}
                disabled={i > currentStepIdx}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isCurrent
                    ? "bg-slate-900 text-white"
                    : isDone
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : "bg-slate-50 text-slate-400"
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                {s.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">Job Name</Label>
            <Input
              placeholder="e.g., Invoice Extraction Batch 1"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              className="rounded-lg"
            />
          </div>

          {/* Upload method tabs */}
          <div>
            <Label className="text-sm font-medium text-slate-700 mb-2 block">
              Add Images
            </Label>
            <div className="flex gap-1.5 mb-4">
              {methodTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setUploadMethod(tab.key)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      uploadMethod === tab.key
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Browse files / Drag-drop */}
            {uploadMethod === "files" && (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 transition-colors hover:border-slate-300 hover:bg-slate-50"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="rounded-full bg-slate-100 p-3 mb-3">
                  <Upload className="h-5 w-5 text-slate-500" />
                </div>
                <p className="text-sm font-medium text-slate-700">
                  Drop images here or click to browse
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  PNG, JPG, TIFF, WebP supported
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            )}

            {/* Folder select */}
            {uploadMethod === "folder" && (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 min-h-[160px]">
                <div className="rounded-full bg-slate-100 p-3 mb-3">
                  <FolderOpen className="h-5 w-5 text-slate-500" />
                </div>
                <p className="text-sm font-medium text-slate-700 mb-1">
                  Select an entire folder of images
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  All images in the folder (and subfolders) will be added
                </p>
                <Button
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Choose Folder
                </Button>
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            )}

            {/* ZIP upload */}
            {uploadMethod === "zip" && (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 min-h-[160px]">
                <div className="rounded-full bg-slate-100 p-3 mb-3">
                  <FileArchive className="h-5 w-5 text-slate-500" />
                </div>
                <p className="text-sm font-medium text-slate-700 mb-1">
                  Upload a ZIP archive of images
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  Images will be extracted automatically. Nested folders are supported.
                </p>
                {zipUploading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {zipProgress}
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => zipInputRef.current?.click()}
                  >
                    <FileArchive className="mr-2 h-4 w-4" />
                    Choose ZIP File
                  </Button>
                )}
                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={handleZipSelect}
                />
              </div>
            )}

            {/* Cloud URL */}
            {uploadMethod === "cloud" && (
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 min-h-[160px]">
                <div className="flex justify-center mb-3">
                  <div className="rounded-full bg-slate-100 p-3">
                    <Cloud className="h-5 w-5 text-slate-500" />
                  </div>
                </div>
                <p className="text-sm font-medium text-slate-700 text-center mb-1">
                  Import from cloud storage
                </p>
                <p className="text-xs text-slate-400 text-center mb-4">
                  Provide a URL to a JSON manifest, S3/GCS bucket listing, or text file with image URLs
                </p>
                <div className="flex gap-2 max-w-lg mx-auto">
                  <Input
                    placeholder="https://bucket.s3.amazonaws.com/images/ or manifest.json URL"
                    value={cloudUrl}
                    onChange={(e) => setCloudUrl(e.target.value)}
                    className="rounded-lg text-sm flex-1"
                    disabled={cloudImporting}
                  />
                  <Button
                    variant="outline"
                    className="rounded-lg shrink-0"
                    onClick={handleCloudImport}
                    disabled={cloudImporting || !cloudUrl.trim()}
                  >
                    {cloudImporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Globe className="mr-2 h-4 w-4" />
                        Import
                      </>
                    )}
                  </Button>
                </div>
                {cloudProgress && (
                  <p className="text-xs text-slate-400 text-center mt-2">{cloudProgress}</p>
                )}
                <div className="mt-4 text-center">
                  <p className="text-[11px] text-slate-400">
                    Supported formats: JSON array of URLs, S3 XML listing, or one URL per line
                  </p>
                </div>
              </div>
            )}

          </div>

          {/* Image count / file list */}
          {images.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">
                  {images.length.toLocaleString()} image{images.length > 1 ? "s" : ""} ready
                </p>
                <button
                  onClick={() => setImages([])}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                >
                  Clear all
                </button>
              </div>
              {images.length <= 200 ? (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
                  {images.map((img, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span className="truncate text-slate-600">{img.filename}</span>
                      <button
                        onClick={() => removeImage(i)}
                        className="ml-2 shrink-0"
                      >
                        <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  {images.length.toLocaleString()} images selected — too many to list individually.
                  First: <span className="font-mono text-xs">{images[0]?.filename}</span>,
                  Last: <span className="font-mono text-xs">{images[images.length - 1]?.filename}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => setStep("configure")}
              disabled={images.length === 0}
              className="rounded-lg"
            >
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Configure */}
      {step === "configure" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
          {/* Mode toggle */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Pipeline Mode</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setJobMode("full")}
                className={`rounded-lg border-2 p-4 text-left transition-colors ${
                  jobMode === "full"
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="text-sm font-medium text-slate-900">Full Pipeline</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Auto-label, fine-tune, then infer
                </p>
              </button>
              <button
                onClick={() => setJobMode("inference_only")}
                className={`rounded-lg border-2 p-4 text-left transition-colors ${
                  jobMode === "inference_only"
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="text-sm font-medium text-slate-900">Inference Only</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Run an existing model on all images directly
                </p>
              </button>
            </div>
          </div>

          {/* Full pipeline settings */}
          {jobMode === "full" && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Labeling Model</Label>
                  <Select value={selectedLabelModel} onValueChange={setSelectedLabelModel}>
                    <SelectTrigger className="rounded-lg">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {labelingModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.provider_name ? `${m.provider_name} / ${m.name}` : m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Fine-Tune Model</Label>
                  <Select value={selectedFinetuneModel} onValueChange={setSelectedFinetuneModel}>
                    <SelectTrigger className="rounded-lg">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {finetuneModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-slate-700">Label Ratio</Label>
                  <span className="text-sm font-semibold text-slate-900">{labelRatio}%</span>
                </div>
                <Slider
                  value={[labelRatio]}
                  onValueChange={([v]) => setLabelRatio(v)}
                  min={10}
                  max={80}
                  step={5}
                />
                <p className="text-xs text-slate-400">
                  {labelCount.toLocaleString()} images auto-labeled,{" "}
                  {inferCount.toLocaleString()} for model inference. 20-40% is typical.
                </p>
              </div>
            </>
          )}

          {/* Inference-only: eval model picker */}
          {jobMode === "inference_only" && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-slate-700">Inference Model</Label>
              <p className="text-xs text-slate-400">
                Choose an off-the-shelf model to run on all {images.length.toLocaleString()} images.
              </p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {evalProviders
                  .flatMap((provider) =>
                    provider.models.map((model) => ({ ...model, providerName: provider.name }))
                  )
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((model) => (
                    <label
                      key={model.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                        selectedEvalModel === model.id
                          ? "border-indigo-300 bg-indigo-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="eval_model"
                        checked={selectedEvalModel === model.id}
                        onChange={() => setSelectedEvalModel(model.id)}
                        className="accent-indigo-600"
                      />
                      <span className="flex-1 text-sm text-slate-900">{model.name}</span>
                      <span className="text-[10px] text-slate-400">{model.providerName}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}

          {/* Google model config: reasoning effort + media resolution */}
          {isGoogleModel && (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Gemini Settings</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Thinking Level</Label>
                  <Select value={reasoningEffort} onValueChange={setReasoningEffort}>
                    <SelectTrigger className="rounded-lg text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-slate-400">Higher = better accuracy, more cost + latency</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Image Resolution</Label>
                  <Select value={mediaResolution} onValueChange={setMediaResolution}>
                    <SelectTrigger className="rounded-lg text-sm h-9">
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="low">Low (280 tokens)</SelectItem>
                      <SelectItem value="medium">Medium (560 tokens)</SelectItem>
                      <SelectItem value="high">High (1120 tokens)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-slate-400">Higher = better for fine text / small details</p>
                </div>
              </div>
            </div>
          )}

          {/* Structured Outputs toggle — shown for providers that support it */}
          {supportsStructuredOutput && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <div>
                <p className="text-sm font-medium text-slate-700">Structured Outputs</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Force model to return valid JSON matching your schema. Not all models support this.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={structuredOutput}
                onClick={() => setStructuredOutput(!structuredOutput)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${structuredOutput ? "bg-indigo-600" : "bg-slate-300"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${structuredOutput ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
              </button>
            </div>
          )}

          <div className="border-t border-slate-100 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-slate-700">Extraction Schema</Label>
              <Button variant="outline" size="sm" onClick={addSchemaField} className="rounded-lg text-xs h-7">
                <Plus className="mr-1 h-3 w-3" />
                Add Field
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Define what data to extract from each document.
            </p>
            <div className="space-y-2">
              {Object.entries(schema).map(([key, desc], i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="Field name"
                    value={key}
                    onChange={(e) => updateSchemaKey(key, e.target.value)}
                    className="w-1/3 rounded-lg text-sm"
                  />
                  <Input
                    placeholder="Description"
                    value={desc}
                    onChange={(e) => updateSchemaValue(key, e.target.value)}
                    className="flex-1 rounded-lg text-sm"
                  />
                  <button onClick={() => removeSchemaField(key)} className="px-2">
                    <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Compare — only when local files available */}
          {hasLocalFiles && (
            <div className="border-t border-slate-100 pt-5 space-y-4">
              <button
                onClick={() => setQcResults(null)}
                className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                <BarChart3 className="h-4 w-4" />
                Quick Compare
                <span className="text-[10px] text-slate-400 font-normal ml-1">Preview model outputs before committing</span>
              </button>

              {/* Model multi-select — alphabetical flat list with provider */}
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Select 1–4 models to compare on your images:</p>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {evalProviders
                    .flatMap((provider) =>
                      provider.models.map((model) => ({ ...model, providerName: provider.name }))
                    )
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((model) => (
                      <label
                        key={model.id}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 cursor-pointer transition-colors text-sm ${
                          qcModels.has(model.id)
                            ? "border-indigo-300 bg-indigo-50"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={qcModels.has(model.id)}
                          onChange={() => {
                            setQcModels((prev) => {
                              const next = new Set(prev);
                              if (next.has(model.id)) next.delete(model.id);
                              else if (next.size < 4) next.add(model.id);
                              return next;
                            });
                          }}
                          className="accent-indigo-600"
                        />
                        <span className="flex-1 text-slate-900">{model.name}</span>
                        <span className="text-[10px] text-slate-400">{model.providerName}</span>
                      </label>
                    ))}
                </div>
              </div>

              {/* Run button */}
              <Button
                variant="outline"
                className="rounded-lg w-full"
                disabled={qcModels.size < 1 || qcRunning || Object.keys(schema).length === 0}
                onClick={async () => {
                  setQcRunning(true);
                  setQcResults(null);
                  try {
                    const sampleFiles = images.filter((img) => img.file).slice(0, 5);
                    const fd = new FormData();
                    fd.append("model_ids", JSON.stringify(Array.from(qcModels)));
                    fd.append("extraction_schema", JSON.stringify(schema));
                    for (const img of sampleFiles) {
                      fd.append("images", img.file!);
                    }
                    const res = await fetch("/api/quick-compare", { method: "POST", body: fd });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({ error: res.statusText }));
                      throw new Error(err.error || "Quick compare failed");
                    }
                    const data = await res.json();
                    setQcResults(data.results);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Quick compare failed");
                  } finally {
                    setQcRunning(false);
                  }
                }}
              >
                {qcRunning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running comparison…
                  </>
                ) : (
                  <>
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Run Quick Compare ({qcModels.size} model{qcModels.size !== 1 ? "s" : ""})
                  </>
                )}
              </Button>

              {/* Results table */}
              {qcResults && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-slate-700">Results</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-3 py-2 font-medium text-slate-600 border-b">File</th>
                          {qcResults.map((r) => (
                            <th key={r.modelId} className="text-left px-3 py-2 font-medium text-slate-600 border-b">
                              <div>{r.modelName}</div>
                              {r.costPer1k != null && r.costPer1k > 0 && (
                                <div className="font-normal text-[10px] text-slate-400 mt-0.5">
                                  ${r.costPer1k.toFixed(4)}/1k images
                                  {r.providerSlug === "google" && r.costPer1kBatch != null && (
                                    <span className="text-emerald-500 ml-1">(batch: ${r.costPer1kBatch.toFixed(4)})</span>
                                  )}
                                </div>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {qcResults[0]?.outputs.map((_, idx) => {
                          const fname = qcResults[0].outputs[idx].filename;
                          const imgEntry = images.find((img) => img.filename === fname);
                          const thumbUrl = imgEntry?.file ? URL.createObjectURL(imgEntry.file) : undefined;
                          return (
                            <tr key={idx} className="border-b border-slate-100 last:border-0">
                              <td className="px-3 py-2 align-top">
                                <div className="flex items-start gap-2">
                                  {thumbUrl && (
                                    <img src={thumbUrl} alt="" className="h-12 w-12 rounded object-cover flex-shrink-0" />
                                  )}
                                  <span className="font-mono text-slate-500 text-[11px] break-all">{fname}</span>
                                </div>
                              </td>
                              {qcResults.map((r) => (
                                <td key={r.modelId} className="px-3 py-2 text-slate-800 align-top max-w-[300px] whitespace-pre-wrap break-words text-[11px]">
                                  {r.outputs[idx]?.text ?? "\u2014"}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* CTAs */}
                  <div className="flex gap-2 flex-wrap">
                    {qcResults.map((r) => (
                      <Button
                        key={r.modelId}
                        variant="outline"
                        size="sm"
                        className="rounded-lg text-xs"
                        onClick={() => {
                          setJobMode("inference_only");
                          setSelectedEvalModel(r.modelId);
                          toast.success(`Mode set to Inference Only with ${r.modelName}`);
                        }}
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Use {r.modelName}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-xs"
                      onClick={() => {
                        setJobMode("full");
                        toast.info("Mode set to Full Pipeline for fine-tuning");
                      }}
                    >
                      Fine-tune instead
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep("upload")} className="rounded-lg">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => setStep("review")}
              disabled={
                (jobMode === "full" && (!selectedLabelModel || !selectedFinetuneModel)) ||
                (jobMode === "inference_only" && !selectedEvalModel) ||
                Object.keys(schema).length === 0
              }
              className="rounded-lg"
            >
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === "review" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          {/* Upload banner */}
          {images.length > 0 && (
            <div className="flex gap-3 rounded-lg bg-emerald-50 border border-emerald-100 p-4">
              <Rocket className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-emerald-900">
                  {images.length.toLocaleString()} images ready to upload
                </p>
                <p className="text-xs text-emerald-700">
                  Images will be uploaded and the pipeline will start immediately.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <ReviewItem label="Job Name" value={jobName || `Job ${new Date().toLocaleDateString()}`} />
            <ReviewItem
              label="Mode"
              value={jobMode === "inference_only" ? "Inference Only" : "Full Pipeline"}
            />
            <ReviewItem
              label="Images"
              value={images.length.toLocaleString()}
            />
            {jobMode === "full" ? (
              <>
                <ReviewItem label="Labeling Model" value={selectedLM?.name ?? ""} />
                <ReviewItem label="Fine-Tune Model" value={selectedFM?.name ?? ""} />
                <ReviewItem
                  label="Label Split"
                  value={`${labelCount.toLocaleString()} labeled / ${inferCount.toLocaleString()} inference`}
                />
              </>
            ) : (
              <ReviewItem label="Inference Model" value={selectedEvalModelObj?.name ?? ""} />
            )}
          </div>

          {(reasoningEffort !== "low" || (mediaResolution && mediaResolution !== "default") || structuredOutput) && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-400 mb-2">Model Config</p>
              <div className="flex flex-wrap gap-2">
                {reasoningEffort !== "low" && (
                  <ReviewItem label="Thinking Level" value={reasoningEffort} />
                )}
                {mediaResolution && mediaResolution !== "default" && (
                  <ReviewItem label="Image Resolution" value={mediaResolution} />
                )}
                {structuredOutput && (
                  <ReviewItem label="Structured Outputs" value="Enabled" />
                )}
              </div>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-400 mb-2">Extraction Schema</p>
            <pre className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 overflow-auto">
              {JSON.stringify(schema, null, 2)}
            </pre>
          </div>

          {/* Cost estimation */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-500" />
              <p className="text-xs font-medium text-slate-700">Cost Estimate</p>
            </div>

            {/* Static estimate from cost_per_image_credits + real $ pricing */}
            {(() => {
              const activeModel = jobMode === "inference_only"
                ? selectedEvalModelObj
                : labelingModels.find((m) => m.id === selectedLabelModel);
              const em = activeModel as EvalModel | undefined;
              const costPerImg = em?.cost_per_image_credits ?? 0;
              const inputCostPer1m = em?.input_cost_per_1m ?? 0;
              const outputCostPer1m = em?.output_cost_per_1m ?? 0;
              const tokensPerImage = em?.tokens_per_image ?? 1000;
              const totalImages = images.length;
              const staticCost = costPerImg * totalImages;

              // Static $ estimate: image tokens as input + estimated ~200 output tokens per image
              const estOutputTokens = 200;
              const staticDollarPerImage = (tokensPerImage * inputCostPer1m + estOutputTokens * outputCostPer1m) / 1_000_000;
              const staticDollarTotal = staticDollarPerImage * totalImages;

              // Check if active provider is Google (for batch discount)
              const activeProvider = evalProviders.flatMap(p => p.models.map(m => ({ model: m, slug: p.slug }))).find(x => x.model.id === em?.id);
              const isGoogle = activeProvider?.slug === "google";

              return (
                <div className="rounded-lg bg-amber-50/50 border border-amber-100 p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{totalImages} images × {costPerImg} credits/image</span>
                    <span className="font-semibold text-slate-900">{staticCost.toFixed(1)} credits</span>
                  </div>
                  {inputCostPer1m > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Estimated cost ({totalImages.toLocaleString()} images)</span>
                      <span className="font-semibold text-slate-900">
                        ~${staticDollarTotal.toFixed(4)}
                        {isGoogle && <span className="text-emerald-600 ml-1">(batch: ~${(staticDollarTotal * 0.5).toFixed(4)})</span>}
                      </span>
                    </div>
                  )}

                  {/* Preview batch results */}
                  {costEstimate && (
                    <div className="border-t border-amber-100 pt-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Avg output tokens (from {costEstimate.samplesUsed} samples)</span>
                        <span className="font-medium text-slate-700">{costEstimate.avgOutputTokens.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Estimated total output tokens</span>
                        <span className="font-medium text-slate-700">{costEstimate.totalEstimatedTokens.toLocaleString()}</span>
                      </div>
                      {inputCostPer1m > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Refined cost estimate</span>
                          <span className="font-semibold text-emerald-700">
                            ~${((tokensPerImage * inputCostPer1m + costEstimate.avgOutputTokens * outputCostPer1m) / 1_000_000 * totalImages).toFixed(4)}
                            {isGoogle && (
                              <span className="text-emerald-500 ml-1">
                                (batch: ~${((tokensPerImage * inputCostPer1m + costEstimate.avgOutputTokens * outputCostPer1m) / 1_000_000 * totalImages * 0.5).toFixed(4)})
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Run preview button */}
                  {hasLocalFiles && !costEstimate && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-xs h-7 w-full"
                      disabled={estimating}
                      onClick={async () => {
                        setEstimating(true);
                        try {
                          const sampleFiles = images.filter((img) => img.file).slice(0, 3);
                          if (sampleFiles.length === 0) return;

                          const activeModelId = jobMode === "inference_only"
                            ? selectedEvalModel
                            : selectedLabelModel;
                          if (!activeModelId) return;

                          const fd = new FormData();
                          fd.append("model_ids", JSON.stringify([activeModelId]));
                          fd.append("extraction_schema", JSON.stringify(schema));
                          for (const img of sampleFiles) {
                            fd.append("images", img.file!);
                          }
                          const res = await fetch("/api/quick-compare", { method: "POST", body: fd });
                          if (!res.ok) throw new Error("Preview failed");
                          const data = await res.json();
                          const result = data.results?.[0];
                          if (result) {
                            const totalOut = result.totalOutputTokens ?? result.outputs.reduce((s: number, o: { output_tokens?: number }) => s + (o.output_tokens ?? 0), 0);
                            const avgOut = Math.round(totalOut / sampleFiles.length);
                            setCostEstimate({
                              avgOutputTokens: avgOut,
                              totalEstimatedTokens: avgOut * images.length,
                              estimatedCost: staticCost,
                              samplesUsed: sampleFiles.length,
                            });
                          }
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Preview failed");
                        } finally {
                          setEstimating(false);
                        }
                      }}
                    >
                      {estimating ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Running preview on 3 samples...
                        </>
                      ) : (
                        <>
                          <Zap className="mr-1 h-3 w-3" />
                          Estimate Output Tokens (3 sample images)
                        </>
                      )}
                    </Button>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep("configure")} className="rounded-lg">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button onClick={handleSubmit} disabled={loading} className="rounded-lg">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Launching...
                </>
              ) : (
                <>
                  <Rocket className="mr-2 h-4 w-4" />
                  Launch Job
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <ArtFooter page="jobs/new" />
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-medium text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}
