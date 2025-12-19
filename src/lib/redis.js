import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const CONFIG_ERROR_MESSAGE =
  'Upstash Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your .env.local (or deployment env vars).';

export function isRedisConfigured() {
  return Boolean(url && token);
}

export function getRedisConfigError() {
  return CONFIG_ERROR_MESSAGE;
}

export const redis = isRedisConfigured()
  ? new Redis({ url, token })
  : new Proxy(
      {},
      {
        get() {
          return async () => {
            throw new Error(CONFIG_ERROR_MESSAGE);
          };
        },
      }
    );
