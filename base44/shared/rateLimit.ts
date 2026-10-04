// Best-effort per-isolate rate limiter (token bucket per key)
const buckets = new Map();

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, start: now };
  if (now - bucket.start > windowMs) {
    bucket.count = 0;
    bucket.start = now;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 1000) buckets.clear();
  return bucket.count <= max;
}