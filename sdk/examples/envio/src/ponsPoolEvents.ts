export async function captureKnownPonsPoolEvent(
  poolId: string,
  loadPool: (normalizedPoolId: string) => Promise<unknown>,
  capture: () => void,
): Promise<boolean> {
  const normalizedPoolId = poolId.toLowerCase();
  if (!await loadPool(normalizedPoolId)) return false;
  capture();
  return true;
}
