import { AppDataSource } from "../../config/typeorm";
import { SlackUserLink } from "../../models/slackUserLink.entity";
import { UserRole } from "../../models/userRole.entity";
import { Permission } from "../../models/permission.entity";

export interface UserContext {
  userId: number;
  email: string;
  firstName: string;
  role: string;
  isAdmin: boolean;
  githubToken: string | null;
  githubLogin: string | null;
  aiConfig: {
    provider?: string;
    endpoint?: string;
    apiKey?: string;
    modelId?: string;
  } | null;
  mcpTools: Array<{
    name: string;
    description: string;
    endpoint: string;
    apiKey?: string;
  }>;
}

const cache = new Map<string, { data: UserContext; expiresAt: number }>();
const CACHE_TTL = 60_000;

async function checkIsAdmin(user: any): Promise<boolean> {
  if (user.role === '*' || user.role === 'rootAdmin') return true;

  try {
    const userRoleRepo = AppDataSource.getRepository(UserRole);
    const userRoles = await userRoleRepo.find({
      where: { user: { id: user.id } },
      relations: { role: { permissions: true } },
    });

    for (const ur of userRoles) {
      if (!ur.role?.permissions) continue;
      for (const perm of ur.role.permissions) {
        if (perm.value === '*' || perm.value === 'admin:access') return true;
      }
    }
  } catch {}

  return false;
}

export async function resolveUser(slackUserId: string): Promise<UserContext | null> {
  const cached = cache.get(slackUserId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const repo = AppDataSource.getRepository(SlackUserLink);
  const link = await repo.findOne({
    where: { slackUserId },
    relations: { user: true },
  });

  if (!link) return null;

  const user = link.user;
  const byoai = (user.settings as any)?.byoai;
  const isAdmin = await checkIsAdmin(user);

  const data: UserContext = {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    role: user.role || "user",
    isAdmin,
    githubToken: link.githubToken || null,
    githubLogin: link.githubLogin || null,
    aiConfig: (byoai && byoai.enabled) ? {
      provider: byoai.provider || "opencode-go",
      endpoint: byoai.endpoint || "",
      apiKey: byoai.apiKey || "",
      modelId: byoai.modelId || "",
    } : null,
    mcpTools: link.mcpTools || [],
  };

  cache.set(slackUserId, { data, expiresAt: Date.now() + CACHE_TTL });
  return data;
}

export function invalidateCache(slackUserId?: string): void {
  if (slackUserId) cache.delete(slackUserId);
  else cache.clear();
}
