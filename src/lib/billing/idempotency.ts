export function getOrCreateIdempotencyKey(keyRef: { current: string | null }) {
  keyRef.current ??= crypto.randomUUID();
  return keyRef.current;
}
