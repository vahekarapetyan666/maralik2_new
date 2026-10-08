import { BlobNotFoundError, head, put } from "@vercel/blob";
import { revalidateTag, unstable_cache } from "next/cache";
import type { JsonStore } from "./json-store";

export function createBlobJsonStore<T>(blobKey: string, fallback: T): JsonStore<T> {
  const cacheTag = `blob-json:${blobKey}`;

  async function readRaw(): Promise<T> {
    try {
      const blob = await head(blobKey);
      const url = new URL(blob.url);
      url.searchParams.set("v", blob.etag);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to read ${blobKey}: ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof BlobNotFoundError) return fallback;
      throw error;
    }
  }

  const read = unstable_cache(readRaw, ["blob-json", blobKey], {
    tags: [cacheTag],
    revalidate: 86400,
  });

  async function write(value: T): Promise<void> {
    await put(blobKey, JSON.stringify(value, null, 2), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    revalidateTag(cacheTag, { expire: 0 });
  }

  async function update(mutator: (current: T) => T | Promise<T>): Promise<T> {
    const current = await read();
    const next = await mutator(current);
    await write(next);
    return next;
  }

  return { read, write, update };
}
