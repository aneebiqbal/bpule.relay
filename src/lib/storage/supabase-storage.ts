/**
 * Adapts the Supabase Storage client to the app's StorageClient interface.
 *
 * Only used while `RELAY_DB_PROVIDER=supabase` (the rollback path); the Aiven
 * path uses `createPostgresStorage`.
 */
import type { StorageBucket, StorageClient, StorageUploadOptions } from './postgres-storage'

type SupabaseStorage = import('@supabase/supabase-js').SupabaseClient['storage']

export function createSupabaseStorage(storage: SupabaseStorage): StorageClient {
  return {
    from(bucket: string): StorageBucket {
      const ref = storage.from(bucket)
      return {
        async upload(path, data, opts?: StorageUploadOptions) {
          const { error } = await ref.upload(path, data as Uint8Array, {
            contentType: opts?.contentType,
            cacheControl: opts?.cacheControl,
            upsert: opts?.upsert !== false,
          })
          return { error: error ? { message: error.message } : null }
        },
        async download(path) {
          const { data, error } = await ref.download(path)
          return { data: data ?? null, error: error ? { message: error.message } : null }
        },
        async remove(paths) {
          const { error } = await ref.remove(paths)
          return { error: error ? { message: error.message } : null }
        },
        async createBucket(name, opts) {
          const { error } = await storage.createBucket(name, {
            public: opts?.public ?? false,
            fileSizeLimit: opts?.fileSizeLimit,
            allowedMimeTypes: opts?.allowedMimeTypes,
          })
          return { error: error ? { message: error.message } : null }
        },
      }
    },
  }
}
