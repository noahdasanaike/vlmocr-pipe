"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArtFooter } from "@/components/art-footer";
import { Key, Check, X, Eye, EyeOff, Loader2, CircleDot, Zap, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface ProviderConfig {
  name: string;
  settingKey: string;
  description: string;
  testUrl: string;
  testModel: string;
  signupUrl: string;
  required?: boolean;
}

const providers: ProviderConfig[] = [
  {
    name: "Google AI Studio",
    settingKey: "GEMINI_API_KEY",
    description: "Required for Gemini models (labeling + inference). Most jobs use this.",
    testUrl: "https://generativelanguage.googleapis.com/v1beta/openai/models",
    testModel: "gemini-2.5-flash",
    signupUrl: "https://aistudio.google.com/apikey",
    required: true,
  },
  {
    name: "OpenRouter",
    settingKey: "OPENROUTER_API_KEY",
    description: "Access GPT, Claude, Qwen, Llama, and 100+ other models via one key.",
    testUrl: "https://openrouter.ai/api/v1/models",
    testModel: "",
    signupUrl: "https://openrouter.ai/keys",
    required: true,
  },
  {
    name: "DeepInfra",
    settingKey: "DEEPINFRA_API_KEY",
    description: "Cheap inference for open models (olmOCR, DeepSeek-OCR, PaddleOCR).",
    testUrl: "https://api.deepinfra.com/v1/openai/models",
    testModel: "",
    signupUrl: "https://deepinfra.com/dash/api_keys",
  },
  {
    name: "Novita",
    settingKey: "NOVITA_API_KEY",
    description: "Alternative provider for open models.",
    testUrl: "https://api.novita.ai/openai/models",
    testModel: "",
    signupUrl: "https://novita.ai/dashboard/key",
  },
  {
    name: "DashScope",
    settingKey: "DASHSCOPE_API_KEY",
    description: "Alibaba Cloud for Qwen models (cheapest Qwen pricing).",
    testUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
    testModel: "",
    signupUrl: "https://dashscope.console.aliyun.com/apiKey",
  },
  {
    name: "Replicate",
    settingKey: "REPLICATE_API_TOKEN",
    description: "Replicate API for running models on demand.",
    testUrl: "https://api.replicate.com/v1/models",
    testModel: "",
    signupUrl: "https://replicate.com/account/api-tokens",
  },
  {
    name: "Qubrid",
    settingKey: "QUBRID_API_KEY",
    description: "Qubrid API for HunyuanOCR.",
    testUrl: "https://platform.qubrid.com/v1/models",
    testModel: "",
    signupUrl: "https://platform.qubrid.com/settings",
  },
  {
    name: "ZenMux",
    settingKey: "ZENMUX_API_KEY",
    description: "ZenMux API for ByteDance Seed 2.0 models.",
    testUrl: "https://zenmux.ai/api/v1/models",
    testModel: "",
    signupUrl: "https://zenmux.ai/dashboard",
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, "ok" | "fail">>({});
  const [workerAlive, setWorkerAlive] = useState<boolean | null>(null);

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

  // Check worker status
  const checkWorker = useCallback(async () => {
    try {
      const res = await fetch("/api/worker-status");
      if (res.ok) {
        const data = await res.json();
        setWorkerAlive(data.alive);
      }
    } catch {
      setWorkerAlive(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    checkWorker();
    const interval = setInterval(checkWorker, 10_000);
    return () => clearInterval(interval);
  }, [fetchSettings, checkWorker]);

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
        setTestResults((prev) => { const n = { ...prev }; delete n[settingKey]; return n; });
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
        setTestResults((prev) => { const n = { ...prev }; delete n[settingKey]; return n; });
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

  async function handleTest(provider: ProviderConfig) {
    setTesting((prev) => ({ ...prev, [provider.settingKey]: true }));
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settingKey: provider.settingKey, testUrl: provider.testUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResults((prev) => ({ ...prev, [provider.settingKey]: "ok" }));
        toast.success(`${provider.name}: key is valid`);
      } else {
        setTestResults((prev) => ({ ...prev, [provider.settingKey]: "fail" }));
        toast.error(`${provider.name}: ${data.error || "key is invalid"}`);
      }
    } catch {
      setTestResults((prev) => ({ ...prev, [provider.settingKey]: "fail" }));
      toast.error(`${provider.name}: test failed`);
    } finally {
      setTesting((prev) => ({ ...prev, [provider.settingKey]: false }));
    }
  }

  function toggleVisibility(settingKey: string) {
    setVisibleKeys((prev) => ({ ...prev, [settingKey]: !prev[settingKey] }));
  }

  function maskKey(value: string): string {
    if (value.length <= 8) return "****";
    return value.slice(0, 4) + "..." + value.slice(-4);
  }

  const configuredCount = providers.filter((p) => settings[p.settingKey]).length;
  const requiredMissing = providers.filter((p) => p.required && !settings[p.settingKey]);

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

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Worker status */}
        <div className={`rounded-xl border p-4 ${
          workerAlive === true ? "border-emerald-200 bg-emerald-50/50" :
          workerAlive === false ? "border-red-200 bg-red-50/50" :
          "border-slate-200 bg-slate-50/50"
        }`}>
          <div className="flex items-center gap-2">
            <CircleDot className={`h-4 w-4 ${
              workerAlive === true ? "text-emerald-500" :
              workerAlive === false ? "text-red-500" :
              "text-slate-400"
            }`} />
            <span className="text-sm font-medium text-slate-900">Worker</span>
            <span className={`text-xs font-medium ${
              workerAlive === true ? "text-emerald-700" :
              workerAlive === false ? "text-red-600" :
              "text-slate-400"
            }`}>
              {workerAlive === true ? "Running" : workerAlive === false ? "Not detected" : "Checking..."}
            </span>
          </div>
          {workerAlive === false && (
            <p className="text-xs text-red-500 mt-1.5">
              The worker process is not running. Jobs will not be processed. Run <code className="bg-red-100 px-1 rounded">start.bat</code> or <code className="bg-red-100 px-1 rounded">start.sh</code> to start it.
            </p>
          )}
        </div>

        {/* API key summary */}
        <div className={`rounded-xl border p-4 ${
          requiredMissing.length > 0 ? "border-amber-200 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/50"
        }`}>
          <div className="flex items-center gap-2">
            <Key className={`h-4 w-4 ${requiredMissing.length > 0 ? "text-amber-500" : "text-emerald-500"}`} />
            <span className="text-sm font-medium text-slate-900">API Keys</span>
            <span className="text-xs text-slate-500">{configuredCount}/{providers.length} configured</span>
          </div>
          {requiredMissing.length > 0 && (
            <p className="text-xs text-amber-600 mt-1.5">
              <AlertTriangle className="h-3 w-3 inline mr-1" />
              Add at least <strong>{requiredMissing.map((p) => p.name).join(" or ")}</strong> to start running jobs.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {providers.map((provider) => {
          const hasKey = !!settings[provider.settingKey];
          const isVisible = visibleKeys[provider.settingKey];
          const isSaving = saving[provider.settingKey];
          const isDeleting = deleting[provider.settingKey];
          const isTesting = testing[provider.settingKey];
          const testResult = testResults[provider.settingKey];
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
                  {provider.required && (
                    <span className="text-[10px] text-amber-600 font-medium">recommended</span>
                  )}
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
                  {testResult === "ok" && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      <Zap className="h-3 w-3" />
                      Valid
                    </span>
                  )}
                  {testResult === "fail" && (
                    <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                      <X className="h-3 w-3" />
                      Invalid
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-3">
                {provider.description}
                {" "}
                <a
                  href={provider.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:text-indigo-700 font-medium"
                >
                  Get key &rarr;
                </a>
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
                    onClick={() => handleTest(provider)}
                    disabled={isTesting}
                    className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700"
                    title="Test this key"
                  >
                    {isTesting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <><Zap className="h-3 w-3 mr-1" />Test</>
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
