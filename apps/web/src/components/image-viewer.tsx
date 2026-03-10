"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Transcription {
  label: string;
  text: string;
  nes?: number | null;
  cer?: number | null;
}

interface ImageViewerProps {
  imageUrl?: string;
  imageId?: string;
  transcriptions: Transcription[];
  groundTruth?: string;
}

export function ImageViewer({
  imageUrl,
  imageId,
  transcriptions,
  groundTruth,
}: ImageViewerProps) {
  const [url, setUrl] = useState(imageUrl ?? "");
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(!imageUrl);

  useEffect(() => {
    if (imageUrl) {
      setUrl(imageUrl);
      setLoading(false);
      return;
    }
    if (!imageId) return;

    async function fetchUrl() {
      try {
        const res = await fetch(`/api/images/${imageId}/signed-url`);
        if (res.ok) {
          const data = await res.json();
          setUrl(data.signed_url);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchUrl();
  }, [imageUrl, imageId]);

  return (
    <div className="flex gap-4 min-h-[400px]">
      {/* Left: Image panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-1 mb-2">
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7"
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-slate-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : url ? (
            <img
              src={url}
              alt="Document"
              style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
              className="max-w-none"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-slate-400">
              No image available
            </div>
          )}
        </div>
      </div>

      {/* Right: Transcriptions panel */}
      <div className="w-[45%] flex flex-col min-w-0">
        {transcriptions.length > 0 && (
          <Tabs defaultValue={transcriptions[0]?.label} className="flex-1 flex flex-col">
            <TabsList className="mb-2 h-8">
              {transcriptions.map((t) => (
                <TabsTrigger key={t.label} value={t.label} className="text-xs px-3 h-7">
                  {t.label}
                  {t.nes != null && (
                    <span className={`ml-1.5 text-[10px] font-medium px-1 py-0.5 rounded ${
                      t.nes >= 0.8 ? "bg-emerald-50 text-emerald-700" :
                      t.nes >= 0.5 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                    }`}>
                      {t.nes.toFixed(3)}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            {transcriptions.map((t) => (
              <TabsContent
                key={t.label}
                value={t.label}
                className="flex-1 mt-0"
              >
                <div className="h-full flex flex-col gap-2">
                  {/* Metrics badges */}
                  {(t.nes != null || t.cer != null) && (
                    <div className="flex gap-2">
                      {t.nes != null && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          t.nes >= 0.8 ? "bg-emerald-50 text-emerald-700" :
                          t.nes >= 0.5 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                        }`}>
                          NES {t.nes.toFixed(4)}
                        </span>
                      )}
                      {t.cer != null && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          CER {t.cer.toFixed(4)}
                        </span>
                      )}
                    </div>
                  )}
                  <pre className="flex-1 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 whitespace-pre-wrap overflow-auto">
                    {t.text || "\u2014"}
                  </pre>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Ground truth */}
        {groundTruth && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">
              Ground Truth
            </p>
            <pre className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-xs text-slate-700 whitespace-pre-wrap max-h-32 overflow-auto">
              {groundTruth}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
