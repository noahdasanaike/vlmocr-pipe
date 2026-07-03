"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Boxes, Plus, X, Loader2, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface CatalogModel {
  api_model_id: string;
  name: string;
  input_cost_per_1m: number;
  output_cost_per_1m: number;
  context_length: number | null;
}

interface EvalModel {
  id: string;
  name: string;
  api_model_id: string;
  input_cost_per_1m: number;
  output_cost_per_1m: number;
  provider_id: string;
}

interface Provider {
  id: string;
  slug: string;
  name: string;
  has_api_key?: boolean;
}

function priceLabel(m: { input_cost_per_1m: number; output_cost_per_1m: number }): string {
  const fmt = (n: number) => (n === 0 ? "0" : n < 1 ? n.toFixed(3) : n.toFixed(2));
  return `$${fmt(m.input_cost_per_1m)} in / $${fmt(m.output_cost_per_1m)} out per 1M`;
}

export function OpenRouterModels() {
  const [custom, setCustom] = useState<EvalModel[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  const [catalog, setCatalog] = useState<CatalogModel[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const refreshModels = useCallback(async () => {
    try {
      const res = await fetch("/api/benchmarks/models");
      if (!res.ok) return;
      const { models, providers } = (await res.json()) as { models: EvalModel[]; providers: Provider[] };
      const orProvider = providers.find((p) => p.slug === "openrouter");
      setCustom(models.filter((m) => m.id.startsWith("custom-")));
      // Track every api_model_id already registered under OpenRouter so the
      // catalog can mark them as added.
      setAddedIds(
        new Set(
          models
            .filter((m) => !orProvider || m.provider_id === orProvider.id)
            .map((m) => m.api_model_id)
        )
      );
    } catch {
      /* API unavailable */
    }
  }, []);

  useEffect(() => {
    refreshModels();
    // The OpenRouter key is stored as OPENROUTER_API_KEY; check it directly
    // rather than the server's provider flag (which keys off a different name).
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : {}))
      .then((s) => setHasKey(!!s?.OPENROUTER_API_KEY))
      .catch(() => setHasKey(null));
  }, [refreshModels]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const loadCatalog = useCallback(async () => {
    if (catalog || loadingCatalog) return;
    setLoadingCatalog(true);
    setCatalogError(null);
    try {
      const res = await fetch("/api/benchmarks/models/openrouter");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load catalog");
      setCatalog(data.models as CatalogModel[]);
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : "Failed to load catalog");
    } finally {
      setLoadingCatalog(false);
    }
  }, [catalog, loadingCatalog]);

  async function addModel(m: { api_model_id: string; name?: string; input_cost_per_1m?: number; output_cost_per_1m?: number }) {
    setAdding(m.api_model_id);
    try {
      const res = await fetch("/api/benchmarks/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_slug: "openrouter", ...m }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add model");
      toast.success(`Added ${data.model?.name ?? m.api_model_id}`);
      setQuery("");
      setOpen(false);
      await refreshModels();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add model");
    } finally {
      setAdding(null);
    }
  }

  async function removeModel(id: string, name: string) {
    setRemoving(id);
    try {
      const res = await fetch(`/api/benchmarks/models?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to remove");
      toast.success(`Removed ${name}`);
      await refreshModels();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setRemoving(null);
    }
  }

  const q = query.trim().toLowerCase();
  const matches = (catalog ?? [])
    .filter(
      (m) =>
        q === "" ||
        m.name.toLowerCase().includes(q) ||
        m.api_model_id.toLowerCase().includes(q)
    )
    .slice(0, 40);

  // Allow adding a raw id that isn't in the catalog (brand-new models).
  const isExactId = q.length > 0 && q.includes("/");
  const catalogHasQuery =
    q.length > 0 && (catalog ?? []).some((m) => m.api_model_id.toLowerCase() === q);

  const missingKey = hasKey === false;

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
      <div className="flex items-center gap-2.5 mb-1.5">
        <Boxes className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">OpenRouter Models</h2>
        <span className="text-[11px] text-slate-400">{custom.length} added</span>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Add any vision model from OpenRouter&apos;s live catalog. Added models appear
        everywhere you pick an inference model (jobs, quick compare, benchmarks).
        Pricing is pulled automatically.
      </p>

      {missingKey && (
        <p className="text-xs text-amber-600 mb-3">
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          Add your OpenRouter API key above to actually run these models.
        </p>
      )}

      {/* Search / add */}
      <div className="relative" ref={boxRef}>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 focus-within:border-slate-400">
          <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <Input
            placeholder="Search models or paste an id (e.g. openai/gpt-5.2)…"
            value={query}
            onFocus={() => {
              setOpen(true);
              loadCatalog();
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            className="border-0 shadow-none focus-visible:ring-0 px-0 text-sm h-10"
          />
          {loadingCatalog && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />}
        </div>

        {open && (
          <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {catalogError && (
              <div className="px-3 py-3 text-xs text-red-500">{catalogError}</div>
            )}
            {!catalogError && loadingCatalog && !catalog && (
              <div className="px-3 py-3 text-xs text-slate-400">Loading catalog…</div>
            )}
            {!catalogError && catalog && matches.length === 0 && !isExactId && (
              <div className="px-3 py-3 text-xs text-slate-400">No matching vision models.</div>
            )}
            {matches.map((m) => {
              const already = addedIds.has(m.api_model_id);
              return (
                <button
                  key={m.api_model_id}
                  disabled={already || adding === m.api_model_id}
                  onClick={() => addModel(m)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent flex items-center gap-2 border-b border-slate-50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{m.name}</p>
                    <p className="text-[10px] text-slate-400 truncate font-mono">{m.api_model_id}</p>
                    <p className="text-[10px] text-slate-400">{priceLabel(m)}</p>
                  </div>
                  {already ? (
                    <span className="text-[10px] text-emerald-600 shrink-0">Added</span>
                  ) : adding === m.api_model_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  )}
                </button>
              );
            })}
            {/* Raw-id escape hatch for models not yet in the catalog */}
            {isExactId && !catalogHasQuery && !addedIds.has(query.trim()) && (
              <button
                disabled={adding === query.trim()}
                onClick={() => addModel({ api_model_id: query.trim() })}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">
                    Add &quot;{query.trim()}&quot;
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Not in the catalog — added with $0 pricing (edit later if needed).
                  </p>
                </div>
                {adding === query.trim() ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Added models */}
      {custom.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {custom.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{m.name}</p>
                <p className="text-[10px] text-slate-400 truncate font-mono">{m.api_model_id}</p>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0 hidden sm:block">
                {priceLabel(m)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeModel(m.id, m.name)}
                disabled={removing === m.id}
                className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 shrink-0"
                title="Remove model"
              >
                {removing === m.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
