export function expectedScore(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

export function updateElo(
  winnerElo: number,
  loserElo: number,
  k: number = 16
): { winnerDelta: number; loserDelta: number; newWinnerElo: number; newLoserElo: number } {
  const expected = expectedScore(winnerElo, loserElo);
  const delta = Math.round(k * (1 - expected));
  return {
    winnerDelta: delta,
    loserDelta: -delta,
    newWinnerElo: winnerElo + delta,
    newLoserElo: loserElo - delta,
  };
}

export function kFactorForProject(totalVotes: number): number {
  return totalVotes < 10 ? 24 : 16;
}

const BASE_RESOURCES = { memory: 1024, disk: 10240, cpu: 100 };
const MIN_RESOURCES = { memory: 256, disk: 2048, cpu: 20 };
const MAX_RESOURCES = { memory: 24576, disk: 512000, cpu: 1200 };

export function calculateEloResources(
  eloScore: number,
  isHackClub: boolean = false
): { memory: number; disk: number; cpu: number } {
  const multiplier = Math.max(0.2, Math.min(12, eloScore / 1000));

  const apply = (base: number, min: number, max: number) => {
    let val = Math.round(base * multiplier);
    if (isHackClub) val = Math.round(val * 1.2);
    return Math.max(min, Math.min(max, val));
  };

  return {
    memory: apply(BASE_RESOURCES.memory, MIN_RESOURCES.memory, MAX_RESOURCES.memory),
    disk: apply(BASE_RESOURCES.disk, MIN_RESOURCES.disk, MAX_RESOURCES.disk),
    cpu: apply(BASE_RESOURCES.cpu, MIN_RESOURCES.cpu, MAX_RESOURCES.cpu),
  };
}
