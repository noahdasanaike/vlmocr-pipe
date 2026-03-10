"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArtFooter } from "@/components/art-footer";
import { ArrowLeft, Upload, Loader2, FileArchive } from "lucide-react";
import { toast } from "sonner";

export default function NewDatasetPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file || !name.trim()) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name.trim());
      formData.append("description", description.trim());

      const res = await fetch("/api/benchmarks/datasets/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      toast.success("Dataset uploaded successfully!");
      router.push("/benchmarks/new");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

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
          <h1 className="text-xl font-semibold text-slate-900">Upload Dataset</h1>
          <p className="text-sm text-slate-400">Upload your own images as a benchmark dataset</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-slate-700">Dataset Name</Label>
          <Input
            placeholder="e.g., My Census Records"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-slate-700">Description</Label>
          <Input
            placeholder="Optional description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-lg"
          />
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium text-slate-700">ZIP File</Label>
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6">
            <div className="flex flex-col items-center text-center">
              <div className="rounded-full bg-slate-100 p-3 mb-3">
                <FileArchive className="h-5 w-5 text-slate-500" />
              </div>
              <p className="text-sm font-medium text-slate-700 mb-1">
                Upload a ZIP with images and manifest
              </p>
              <p className="text-xs text-slate-400 mb-4">
                Include a <code className="font-mono bg-slate-100 px-1 rounded">manifest.json</code> file mapping filenames to ground truth text.
              </p>
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block text-xs text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200 file:cursor-pointer"
              />
              {file && (
                <p className="text-xs text-slate-500 mt-2">
                  Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-4 space-y-2">
          <p className="text-xs font-medium text-slate-600">manifest.json format:</p>
          <pre className="text-[11px] text-slate-500 font-mono overflow-auto">{`{
  "samples": [
    {
      "filename": "image_001.jpg",
      "ground_truth": "John Smith, born 1892"
    },
    {
      "filename": "image_002.jpg",
      "ground_truth": "Jane Doe, born 1905"
    }
  ]
}`}</pre>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleUpload}
            disabled={!file || !name.trim() || uploading}
            className="rounded-lg"
          >
            {uploading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</>
            ) : (
              <><Upload className="mr-2 h-4 w-4" />Upload Dataset</>
            )}
          </Button>
        </div>
      </div>

      <ArtFooter page="benchmarks/datasets/new" />
    </div>
  );
}
