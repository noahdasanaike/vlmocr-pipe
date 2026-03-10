"""
OCR evaluation metrics.

Extracted from vlms/scripts/benchmark_eval.py.
Pure functions — no I/O, no state, no dependencies beyond stdlib.
"""
import re
from collections import defaultdict


# ── Edit distance (Levenshtein) ──────────────────────────────────────

def edit_distance(s1: str, s2: str) -> int:
    """Space-optimised Levenshtein distance."""
    m, n = len(s1), len(s2)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, n + 1):
            temp = dp[j]
            if s1[i - 1] == s2[j - 1]:
                dp[j] = prev
            else:
                dp[j] = 1 + min(prev, dp[j], dp[j - 1])
            prev = temp
    return dp[n]


# ── Core metrics ─────────────────────────────────────────────────────

def compute_nes(pred: str, gt: str) -> float:
    """Normalised Edit Similarity: 1 - edit_distance / max(len(pred), len(gt)).
    Bounded [0, 1] where 1 = perfect match."""
    if not pred and not gt:
        return 1.0
    d = edit_distance(pred, gt)
    return 1.0 - d / max(len(pred), len(gt))


def compute_cer(pred: str, gt: str) -> float:
    """Character Error Rate: edit_distance / len(gt).
    Can exceed 1.0 when prediction is longer than ground truth."""
    if not gt:
        return 0.0 if not pred else 1.0
    return edit_distance(pred, gt) / len(gt)


def compute_f1(pred: str, gt: str) -> float:
    """Token-level F1 score (whitespace-tokenised)."""
    pred_tokens = pred.split()
    gt_tokens = gt.split()
    if not pred_tokens and not gt_tokens:
        return 1.0
    if not pred_tokens or not gt_tokens:
        return 0.0
    pred_set = set(pred_tokens)
    gt_set = set(gt_tokens)
    tp = len(pred_set & gt_set)
    if tp == 0:
        return 0.0
    precision = tp / len(pred_set)
    recall = tp / len(gt_set)
    return 2 * precision * recall / (precision + recall)


# ── Text cleaning ────────────────────────────────────────────────────

def strip_vlm_markdown(text: str) -> str:
    """Remove VLM-style markdown formatting (headers, bold, images, code blocks,
    HTML tags) while preserving text content."""
    if not text:
        return ""
    text = re.sub(r'!\[.*?\]\(.*?\)', '', text)          # images
    text = re.sub(r'<[^>]+>', '', text)                   # HTML tags
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)  # headers
    text = re.sub(r'\*{1,3}(.*?)\*{1,3}', r'\1', text)   # bold/italic
    text = re.sub(r'```\w*\n?', '', text)                 # code fences
    text = re.sub(r'`([^`]*)`', r'\1', text)              # inline code
    text = re.sub(r'\n{2,}', '\n', text)                  # collapse newlines
    return text.strip()


def strip_table_markdown(text: str) -> str:
    """Strip markdown table formatting for fair comparison.
    Removes pipes, separator rows, alignment markers. Normalises whitespace."""
    if not text:
        return ""
    lines = text.strip().split('\n')
    cleaned = []
    for line in lines:
        stripped = line.strip().replace(' ', '')
        if re.match(r'^[\|:\-\s]+$', stripped) and '---' in stripped:
            continue
        line = line.replace('|', ' ')
        line = re.sub(r'\s+', ' ', line).strip()
        if line:
            cleaned.append(line)
    return '\n'.join(cleaned)


def extract_cells(text: str) -> str:
    """Extract sorted bag of cell contents from a markdown table.
    Returns newline-joined string of sorted, non-empty cell texts.
    Enables order-independent table comparison."""
    if not text:
        return ""
    lines = text.strip().split('\n')
    cells = []
    for line in lines:
        stripped = line.strip().replace(' ', '')
        if re.match(r'^[\|:\-\s]+$', stripped) and '---' in stripped:
            continue
        parts = line.split('|')
        for p in parts:
            cell = p.strip()
            if cell:
                cells.append(cell)
    cells.sort()
    return '\n'.join(cells)


# ── Aggregation ──────────────────────────────────────────────────────

def aggregate(
    results: list[dict],
    group_key: str,
) -> dict[str, dict]:
    """Group results by a key and compute average NES per group.
    Errors (result["error"] truthy) are excluded from NES averages."""
    groups: dict[str, dict] = defaultdict(
        lambda: {"nes_sum": 0.0, "n": 0, "errors": 0, "total": 0}
    )
    for r in results:
        g = r.get(group_key, "Unknown")
        groups[g]["total"] += 1
        if r.get("error"):
            groups[g]["errors"] += 1
        else:
            groups[g]["nes_sum"] += r.get("nes", 0.0)
            groups[g]["n"] += 1
    for s in groups.values():
        s["nes"] = s["nes_sum"] / s["n"] if s["n"] > 0 else 0.0
    return dict(groups)


def macro_average(
    results: list[dict],
    axis_key: str,
    axis_values: list[str],
) -> float:
    """Two-level macro-average:
    1. Per-dataset means (excluding errors)
    2. Per-category means (mean of dataset means)
    Each dataset counts equally within its category, each category equally overall."""
    ds_scores: dict[str, dict] = defaultdict(lambda: {"nes_sum": 0.0, "n": 0})
    ds_to_group: dict[str, str] = {}
    for r in results:
        if r.get("error"):
            continue
        ds = r.get("dataset", "unknown")
        ds_scores[ds]["nes_sum"] += r.get("nes", 0.0)
        ds_scores[ds]["n"] += 1
        ds_to_group[ds] = r.get(axis_key, "Unknown")

    cat_scores: dict[str, list[float]] = defaultdict(list)
    for ds, stats in ds_scores.items():
        if stats["n"] > 0:
            cat_scores[ds_to_group[ds]].append(stats["nes_sum"] / stats["n"])

    scores = []
    for v in axis_values:
        if v in cat_scores and cat_scores[v]:
            scores.append(sum(cat_scores[v]) / len(cat_scores[v]))
    return sum(scores) / len(scores) if scores else 0.0


# ── Axis values (matching benchmark_eval.py) ─────────────────────────

REGIONS = ["Europe", "East Asia", "South Asia", "Southeast Asia", "MENA", "East Africa"]
PERIODS = ["Pre-modern", "Historical", "Contemporary"]
FORMATS = ["Handwritten text", "Printed text", "Printed tables", "Handwritten tables"]


def compute_sococrbench_score(results: list[dict]) -> float:
    """Overall SocOCRBench score = region macro-average."""
    return macro_average(results, "region", REGIONS)
