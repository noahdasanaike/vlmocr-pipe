"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArtFooter } from "@/components/art-footer";
import { Key, Check, X, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ProviderConfig {
  name: string;
  settingKey: string;
  description: string;
}

const providers: ProviderConfig[] = [
  {
    name: "Google AI Studio",
    settingKey: "GEMINI_API_KEY",
    description: "Google AI Studio API key for Gemini models.",
  },
  {
    name: "OpenRouter",
    settingKey: "OPENROUTER_API_KEY",
    description: "OpenRouter API key for accessing hosted models.",
  },
  {
    name: "DeepInfra",
    settingKey: "DEEPINFRA_API_KEY",
    description: "DeepInfra API key for inference endpoints.",
  },
  {
    name: "Novita",
    settingKey: "NOVITA_API_KEY",
    description: "Novita AI API key.",
  },
  {
    name: "DashScope",
    settingKey: "DASHSCOPE_API_KEY",
    description: "Alibaba DashScope API key.",
  },
  {
    name: "Replicate",
    settingKey: "REPLICATE_API_TOKEN",
    description: "Replicate API token for running models.",
  },
  {
    name: "Qubrid",
    settingKey: "QUBRID_API_KEY",
    description: "Qubrid API key for HunyuanOCR and other models.",
  },
  {
    name: "ZenMux",
    settingKey: "ZENMUX_API_KEY",
    description: "ZenMux API key for Seed 2.0 models.",
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch {
      // API unavailable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave(settingKey: string) {
    const value = inputValues[settingKey];
    if (!value || !value.trim()) return;

    setSaving((prev) => ({ ...prev, [settingKey]: true }));
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey, value: value.trim() }),
      });
      if (res.ok) {
        const v = value.trim();
        const masked = v.length <= 8 ? "••••••••" : v.slice(0, 4) + "••••" + v.slice(-4);
        setSettings((prev) => ({ ...prev, [settingKey]: masked }));
        setInputValues((prev) => ({ ...prev, [settingKey]: "" }));
        toast.success("API key saved");
      } else {
        toast.error("Failed to save API key");
      }
    } catch {
      toast.error("Failed to save API key");
    } finally {
      setSaving((prev) => ({ ...prev, [settingKey]: false }));
    }
  }

  async function handleDelete(settingKey: string) {
    setDeleting((prev) => ({ ...prev, [settingKey]: true }));
    try {
      const res = await fetch("/api/settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey }),
      });
      if (res.ok) {
        setSettings((prev) => {
          const next = { ...prev };
          delete next[settingKey];
          return next;
        });
        toast.success("API key removed");
      } else {
        toast.error("Failed to remove API key");
      }
    } catch {
      toast.error("Failed to remove API key");
    } finally {
      setDeleting((prev) => ({ ...prev, [settingKey]: false }));
    }
  }

  function toggleVisibility(settingKey: string) {
    setVisibleKeys((prev) => ({ ...prev, [settingKey]: !prev[settingKey] }));
  }

  function maskKey(value: string): string {
    if (value.length <= 8) return "****";
    return value.slice(0, 4) + "..." + value.slice(-4);
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
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure provider API keys for labeling and inference
        </p>
      </div>

      <div className="space-y-4">
        {providers.map((provider) => {
          const hasKey = !!settings[provider.settingKey];
          const isVisible = visibleKeys[provider.settingKey];
          const isSaving = saving[provider.settingKey];
          const isDeleting = deleting[provider.settingKey];
          const inputValue = inputValues[provider.settingKey] ?? "";

          return (
            <div
              key={provider.settingKey}
              className="rounded-xl bg-white p-5 shadow-sm border border-slate-100"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <Key className="h-4 w-4 text-slate-500" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    {provider.name}
                  </h2>
                  {hasKey ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      <Check className="h-3 w-3" />
                      Enabled
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                      <X className="h-3 w-3" />
                      Not set
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-3">
                {provider.description}
              </p>

              {/* Current key display */}
              {hasKey && (
                <div className="flex items-center gap-2 mb-3 rounded-lg bg-slate-50 px-3 py-2">
                  <code className="flex-1 text-xs font-mono text-slate-600">
                    {isVisible
                      ? settings[provider.settingKey]
                      : maskKey(settings[provider.settingKey])}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleVisibility(provider.settingKey)}
                    className="h-7 w-7 p-0"
                    title={isVisible ? "Hide key" : "Show key"}
                  >
                    {isVisible ? (
                      <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(provider.settingKey)}
                    disabled={isDeleting}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                    title="Remove key"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              )}

              {/* Set / replace key */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor={provider.settingKey} className="sr-only">
                    {provider.name} API Key
                  </Label>
                  <Input
                    id={provider.settingKey}
                    type="password"
                    placeholder={hasKey ? "Replace with new key..." : "Enter API key..."}
                    value={inputValue}
                    onChange={(e) =>
                      setInputValues((prev) => ({
                        ...prev,
                        [provider.settingKey]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave(provider.settingKey);
                    }}
                    className="text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => handleSave(provider.settingKey)}
                  disabled={isSaving || !inputValue.trim()}
                  className="shrink-0"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : null}
                  {hasKey ? "Update" : "Save"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <ArtFooter page="settings" />
    </div>
  );
}
