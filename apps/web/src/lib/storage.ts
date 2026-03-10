import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync, readdirSync, rmSync, statSync } from "fs";
import { join, dirname } from "path";
import { STORAGE_DIR } from "@/lib/db";

export function saveFile(storagePath: string, data: Buffer): void {
  const fullPath = join(STORAGE_DIR, storagePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, data);
}

export function readFile(storagePath: string): Buffer {
  return readFileSync(join(STORAGE_DIR, storagePath));
}

export function deleteFile(storagePath: string): void {
  const fullPath = join(STORAGE_DIR, storagePath);
  if (existsSync(fullPath)) {
    unlinkSync(fullPath);
  }
}

export function deleteDirectory(storagePath: string): void {
  const fullPath = join(STORAGE_DIR, storagePath);
  if (existsSync(fullPath)) {
    rmSync(fullPath, { recursive: true, force: true });
  }
}

export function listFiles(dirPath: string): string[] {
  const fullPath = join(STORAGE_DIR, dirPath);
  if (!existsSync(fullPath)) return [];
  return readdirSync(fullPath);
}

export function fileExists(storagePath: string): boolean {
  return existsSync(join(STORAGE_DIR, storagePath));
}

export function getFileSize(storagePath: string): number {
  const fullPath = join(STORAGE_DIR, storagePath);
  if (!existsSync(fullPath)) return 0;
  return statSync(fullPath).size;
}

/** Returns a local API URL that serves the file */
export function getFileUrl(storagePath: string): string {
  return `/api/files/${storagePath}`;
}

export function contentTypeFor(filename: string): string {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".json": "application/json",
  };
  return map[ext] ?? "application/octet-stream";
}
