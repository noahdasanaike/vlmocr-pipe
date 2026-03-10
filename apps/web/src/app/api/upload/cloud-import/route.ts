import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { saveFile, contentTypeFor } from "@/lib/storage";

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".webp", ".bmp",
]);

function isImage(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  return IMAGE_EXTENSIONS.has(ext);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url, jobId } = body as { url: string; jobId: string };

  if (!url || !jobId) {
    return NextResponse.json({ error: "Missing url or jobId" }, { status: 400 });
  }

  // Block SSRF: only allow http(s) with public hostnames
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Only HTTP/HTTPS URLs are allowed" }, { status: 400 });
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("172.") ||
      host === "169.254.169.254" ||
      host.endsWith(".internal") ||
      host.endsWith(".local")
    ) {
      return NextResponse.json({ error: "Internal/private URLs are not allowed" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const db = getDb();

  // Verify job exists
  const job = db.prepare("SELECT id FROM jobs WHERE id = ?").get(jobId) as { id: string } | undefined;
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Fetch the URL to determine what it is
  let imageUrls: string[] = [];

  try {
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${resp.status} ${resp.statusText}` },
        { status: 400 }
      );
    }

    const contentType = resp.headers.get("content-type") ?? "";

    if (contentType.includes("json")) {
      const data = await resp.json();
      if (Array.isArray(data)) {
        imageUrls = data.filter((u: unknown) => typeof u === "string");
      } else if (data.images && Array.isArray(data.images)) {
        imageUrls = data.images.filter((u: unknown) => typeof u === "string");
      } else if (data.urls && Array.isArray(data.urls)) {
        imageUrls = data.urls.filter((u: unknown) => typeof u === "string");
      }
    } else if (contentType.includes("xml")) {
      const text = await resp.text();
      const keyMatches = text.matchAll(/<Key>([^<]+)<\/Key>/g);
      const baseUrl = url.replace(/\?.*$/, "");
      for (const match of keyMatches) {
        const key = match[1];
        if (isImage(key)) {
          const fullUrl = baseUrl.endsWith("/")
            ? `${baseUrl}${key}`
            : `${baseUrl}/${key}`;
          imageUrls.push(fullUrl);
        }
      }
    } else if (contentType.includes("text")) {
      const text = await resp.text();
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      imageUrls = lines.filter(
        (l) => l.startsWith("http://") || l.startsWith("https://")
      );
    } else {
      return NextResponse.json(
        {
          error:
            "Unsupported URL format. Provide a JSON array of image URLs, an S3/GCS XML listing, or a text file with one URL per line.",
        },
        { status: 400 }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to fetch URL: ${e instanceof Error ? e.message : "unknown error"}` },
      { status: 400 }
    );
  }

  if (imageUrls.length === 0) {
    return NextResponse.json(
      { error: "No image URLs found at the provided URL" },
      { status: 400 }
    );
  }

  // Download and save images in batches
  const uploaded: { path: string; filename: string; contentType: string }[] = [];
  const errors: string[] = [];
  const BATCH = 10;

  for (let i = 0; i < imageUrls.length; i += BATCH) {
    const batch = imageUrls.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (imageUrl, localIdx) => {
        const idx = i + localIdx;
        try {
          const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
          if (!imgResp.ok) {
            errors.push(`${imageUrl}: ${imgResp.status}`);
            return;
          }
          const buf = Buffer.from(await imgResp.arrayBuffer());
          if (buf.length < 100) {
            errors.push(`${imageUrl}: too small (${buf.length} bytes)`);
            return;
          }

          const urlPath = new URL(imageUrl).pathname;
          const basename = urlPath.split("/").pop() ?? `image_${idx}.jpg`;
          const safeName = basename
            .replace(/[^a-zA-Z0-9._-]/g, "_")
            .substring(0, 200);
          const storagePath = `jobs/${jobId}/images/${idx}_${safeName}`;
          const ct = contentTypeFor(basename);

          saveFile(storagePath, buf);

          uploaded[idx] = {
            path: storagePath,
            filename: basename,
            contentType: ct,
          };
        } catch (e) {
          errors.push(
            `${imageUrl}: ${e instanceof Error ? e.message : "failed"}`
          );
        }
      })
    );
  }

  // Filter out undefined entries from sparse array
  const validUploaded = uploaded.filter(Boolean);

  return NextResponse.json({
    files: validUploaded,
    count: validUploaded.length,
    total_found: imageUrls.length,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  });
}
