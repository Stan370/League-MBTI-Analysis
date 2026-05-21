/**
 * Minimal Cloudflare Workers KV type declarations.
 * Only the subset used by our Pages Functions.
 *
 * If @cloudflare/workers-types is installed, those take precedence.
 */

interface KVNamespace {
  get(key: string, options?: { type?: 'text' }): Promise<string | null>;
  get(key: string, options: { type: 'json' }): Promise<unknown>;
  put(
    key: string,
    value: string | ReadableStream | ArrayBuffer,
    options?: { expirationTtl?: number; expiration?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}
