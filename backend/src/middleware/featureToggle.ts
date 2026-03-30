import { isFeatureEnabled } from '../utils/featureToggles';

export async function requireFeature(ctx: any, feature: string): Promise<true | { error: string }> {
  if (!feature) return true;
  const enabled = await isFeatureEnabled(feature);
  if (!enabled) {
    ctx.set.status = 503;
    return { error: `Feature '${feature}' is disabled` };
  }
  return true;
}

export const requireFeatureMiddleware = (feature: string) => async (ctx: any) => {
  return await requireFeature(ctx, feature);
};
