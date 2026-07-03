"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArtFooter } from "@/components/art-footer";
import { OpenRouterModels } from "@/components/openrouter-models";
import { Key, Check, X, Eye, EyeOff, Loader2, CircleDot, Zap, AlertTriangle, Cloud } from "lucide-react";
import { toast } from "sonner";

const VERTEX_KEYS = {
  enabled: "GOOGLE_USE_VERTEX_FLEX",
  project: "GOOGLE_VERTEX_PROJECT",
  location: "GOOGLE_VERTEX_LOCATION",
  saJson: "GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON",
} as const;

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

  // Vertex Flex
  const [vertexProject, setVertexProject] = useState("");
  const [vertexLocation, setVertexLocation] = useState("");
  const [vertexSaJson, setVertexSaJson] = useState("");
  const [vertexEnabled, setVertexEnabled] = useState(false);
  const [vertexSaving, setVertexSaving] = useState(false);
  const [vertexJsonVisible, setVertexJsonVisible] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        // Project + location are not sensitive; show them. JSON is masked
        // server-side, so we only know whether it's set — not its contents.
        setVertexProject(data[VERTEX_KEYS.project] ?? "");
        setVertexLocation(data[VERTEX_KEYS.location] ?? "");
        setVertexEnabled((data[VERTEX_KEYS.enabled] ?? "") === "1");
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

  async function saveVertex() {
    if (vertexEnabled) {
      if (!vertexProject.trim()) {
        toast.error("Project ID is required when Flex is enabled");
        return;
      }
      // SA JSON is masked once saved, so an empty input on an already-set
      // key means "keep existing"; only block if neither is present.
      if (!vertexSaJson.trim() && !settings[VERTEX_KEYS.saJson]) {
        toast.error("Service account JSON is required when Flex is enabled");
        return;
      }
    }
    setVertexSaving(true);
    try {
      const writes: [string, string][] = [
        [VERTEX_KEYS.enabled, vertexEnabled ? "1" : "0"],
        [VERTEX_KEYS.project, vertexProject.trim()],
        [VERTEX_KEYS.location, vertexLocation.trim() || "global"],
      ];
      if (vertexSaJson.trim()) {
        try {
          JSON.parse(vertexSaJson);
        } catch {
          toast.error("Service account JSON is not valid JSON");
          setVertexSaving(false);
          return;
        }
        writes.push([VERTEX_KEYS.saJson, vertexSaJson.trim()]);
      }
      for (const [k, v] of writes) {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: k, value: v }),
        });
        if (!res.ok) throw new Error(`save ${k} failed`);
      }
      toast.success(vertexEnabled ? "Vertex Flex saved (Gemini calls will use Flex)" : "Vertex Flex saved");
      setVertexSaJson("");
      fetchSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setVertexSaving(false);
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

      {/* Add inference models from OpenRouter's live catalog */}
      <OpenRouterModels />

      {/* Vertex Flex (alternative auth for Google) */}
      <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <Cloud className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              Google Vertex AI (Flex)
            </h2>
            <span className="text-[10px] text-slate-400 font-medium">advanced</span>
            {vertexEnabled && settings[VERTEX_KEYS.project] && settings[VERTEX_KEYS.saJson] ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <Check className="h-3 w-3" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                <X className="h-3 w-3" />
                Off
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Route Gemini calls through your project&apos;s shared Flex capacity instead of the personal Google AI Studio API key.
          When active, this takes priority over <code className="bg-slate-100 px-1 py-0.5 rounded">GEMINI_API_KEY</code> for all Gemini models.
          Requires a service-account JSON with <code className="bg-slate-100 px-1 py-0.5 rounded">aiplatform.user</code> on the project.
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="vertex-project" className="text-xs text-slate-600">Project ID</Label>
              <Input
                id="vertex-project"
                placeholder="my-gcp-project"
                value={vertexProject}
                onChange={(e) => setVertexProject(e.target.value)}
                className="text-sm mt-1"
              />
            </div>
            <div>
              <Label htmlFor="vertex-location" className="text-xs text-slate-600">Location</Label>
              <Input
                id="vertex-location"
                placeholder="global"
                value={vertexLocation}
                onChange={(e) => setVertexLocation(e.target.value)}
                className="text-sm mt-1"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="vertex-sa" className="text-xs text-slate-600">
                Service Account JSON
                {settings[VERTEX_KEYS.saJson] && (
                  <span className="ml-2 text-[11px] text-emerald-600 font-medium">(saved — leave blank to keep)</span>
                )}
              </Label>
              {vertexSaJson && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVertexJsonVisible((v) => !v)}
                  className="h-6 px-2 text-xs text-slate-400"
                >
                  {vertexJsonVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              )}
            </div>
            <textarea
              id="vertex-sa"
              placeholder={settings[VERTEX_KEYS.saJson] ? "{...} (saved — paste a new key to replace)" : '{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
              value={vertexSaJson}
              onChange={(e) => setVertexSaJson(e.target.value)}
              rows={6}
              className={`w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-mono ${vertexJsonVisible ? "" : "[-webkit-text-security:disc] [text-security:disc]"} focus:border-slate-400 focus:outline-none`}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={vertexEnabled}
                onChange={(e) => setVertexEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Use Vertex Flex for Gemini calls
            </label>
            <Button
              size="sm"
              onClick={saveVertex}
              disabled={vertexSaving}
              className="shrink-0"
            >
              {vertexSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Save
            </Button>
          </div>
        </div>
      </div>

      <ArtFooter page="settings" />
    </div>
  );
}
