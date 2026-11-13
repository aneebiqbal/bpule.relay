/**
 * Object storage backed by Aiven PostgreSQL.
 *
 * Replaces Supabase Storage so every dependency leaves Supabase. The surface the
 * app uses is small (upload / download / remove / createBucket); objects live in
 * `public.storage_objects` as bytea, keyed by (bucket, path).
 *
 * Buckets are implicit — `createBucket` is a no-op — because Relay uses a fixed,
 * code-known set of private buckets.
 */
import type { DbClient } from '@/lib/db/types'

export interface StorageError {
  message: string
}

export interface StorageUploadOptions {
  contentType?: string
  cacheControl?: string
  upsert?: boolean
}

export interface StorageBucket {
  upload: (path: string, data: Uint8Array | ArrayBuffer | { bytes: Uint8Array }, opts?: StorageUploadOptions) => Promise<{ error: StorageError | null }>
  download: (path: string) => Promise<{ data: Blob | null; error: StorageError | null }>
  remove: (paths: string[]) => Promise<{ error: StorageError | null }>
}

export interface StorageClient {
  from: (bucket: string) => StorageBucket
  createBucket: (name: string, opts?: { public?: boolean; fileSizeLimit?: number; allowedMimeTypes?: string[] }) => Promise<{ error: StorageError | null }>
}

function toBytes(data: Uint8Array | ArrayBuffer | { bytes: Uint8Array }): Buffer {
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (data instanceof Uint8Array) return Buffer.from(data)
  return Buffer.from(data.bytes)
}

export function createPostgresStorage(client: DbClient): StorageClient {
  if (!client.raw) {
    throw new Error('The configured database provider does not support raw storage queries')
  }
  const raw = client.raw.bind(client)

  return {
    async createBucket() {
      // Buckets are implicit in this adapter.
      return { error: null }
    },
    from(bucket: string): StorageBucket {
      return {
        async upload(path, data, opts) {
          const bytes = toBytes(data)
          try {
            if (opts?.upsert === false) {
              await raw(
                `insert into storage_objects (bucket, path, data, content_type, size)
                 values ($1, $2, $3, $4, $5)`,
                [bucket, path, bytes, opts?.contentType ?? null, bytes.length],
              )
            } else {
              await raw(
                `insert into storage_objects (bucket, path, data, content_type, size)
                 values ($1, $2, $3, $4, $5)
                 on conflict (bucket, path) do update
                   set data = excluded.data, content_type = excluded.content_type,
                       size = excluded.size, updated_at = now()`,
                [bucket, path, bytes, opts?.contentType ?? null, bytes.length],
              )
            }
            return { error: null }
          } catch (err) {
            return { error: { message: err instanceof Error ? err.message : String(err) } }
          }
        },

        async download(path) {
          try {
            const res = await raw<Array<{ data: Buffer; content_type: string | null }>>(
              `select data, content_type from storage_objects where bucket = $1 and path = $2`,
              [bucket, path],
            )
            const row = res.data?.[0]
            if (!row) return { data: null, error: { message: 'Object not found' } }
            const blob = new Blob([row.data as unknown as ArrayBuffer], { type: row.content_type ?? undefined })
            return { data: blob, error: null }
          } catch (err) {
            return { data: null, error: { message: err instanceof Error ? err.message : String(err) } }
          }
        },

        async remove(paths) {
          try {
            await raw(
              `delete from storage_objects where bucket = $1 and path = any($2::text[])`,
              [bucket, paths],
            )
            return { error: null }
          } catch (err) {
            return { error: { message: err instanceof Error ? err.message : String(err) } }
          }
        },

      }
    },
  }
}
