export function calculateEloResources(eloScore: number, isHackClub = false, isWellMade = false): {
  memory: number
  disk: number
  cpu: number
} {
  const multiplier = Math.max(0.2, Math.min(12, eloScore / 1000));

  const apply = (base: number, min: number, max: number) => {
    let val = Math.round(base * multiplier);
    if (isHackClub) val = Math.round(val * 1.2);
    if (isWellMade) val = Math.round(val * 1.25);
    return Math.max(min, Math.min(max, val));
  };

  return {
    memory: apply(1024, 256, 24576),
    disk: apply(10240, 2048, 512000),
    cpu: apply(100, 20, 1200),
  };
}