export const USD_PER_AI_CREDIT = 0.01;

export function usdToAiCredits(usd: number | null | undefined): number | null {
  if (usd == null || Number.isNaN(usd)) return null;
  return usd / USD_PER_AI_CREDIT;
}
