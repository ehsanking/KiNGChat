import * as argon2 from '@node-rs/argon2';
import crypto from 'crypto';
import type { JWT } from '@auth/core/jwt';
import Google from '@auth/core/providers/google';
import GitHub from '@auth/core/providers/github';
import type { Account, Profile } from '@auth/core/types';
import { prisma } from '@/lib/prisma';
import { getOrCreateAdminSettings } from '@/lib/admin-settings';

const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;

const normalizeProvider = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const sanitizeUsernameCandidate = (value: string) => {
  const stripped = value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  if (!stripped) return '';
  if (!/^[a-zA-Z]/.test(stripped)) return `u${stripped}`.slice(0, 20);
  return stripped;
};

const randomDigits = () => crypto.randomInt(1_000_000_000, 10_000_000_000).toString();

const ensureUniqueUsername = async (baseCandidate: string) => {
  const base = sanitizeUsernameCandidate(baseCandidate) || `user${crypto.randomInt(100_000)}`;
  for (let i = 0; i < 20; i += 1) {
    const suffix = i === 0 ? '' : String(crypto.randomInt(10_000)).padStart(2, '0');
    const candidate = (base.slice(0, Math.max(3, 20 - suffix.length)) + suffix).slice(0, 20);
    if (!usernameRegex.test(candidate)) continue;
    const existing = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  return `user${Date.now().toString().slice(-8)}`;
};

const ensureUniqueNumericId = async () => {
  for (let i = 0; i < 20; i += 1) {
    const candidate = randomDigits();
    const existing = await prisma.user.findUnique({ where: { numericId: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new Error('Could not allocate numeric id for OAuth user.');
};

export type OAuthProviderFlags = {
  google: boolean;
  github: boolean;
  oidc: boolean;
};

export async function getOAuthProviderFlags(): Promise<OAuthProviderFlags> {
  const settings = await getOrCreateAdminSettings();
  const dynamic = settings as Record<string, unknown>;
  return {
    google: Boolean(dynamic.oauthGoogleEnabled),
    github: Boolean(dynamic.oauthGithubEnabled),
    oidc: Boolean(dynamic.oauthOidcEnabled),
  };
}

export async function getOAuthProviders(): Promise<unknown[]> {
  const flags = await getOAuthProviderFlags();
  const providers: unknown[] = [];

  if (flags.google && process.env.OAUTH_GOOGLE_CLIENT_ID && process.env.OAUTH_GOOGLE_CLIENT_SECRET) {
    providers.push(
      Google({
        clientId: process.env.OAUTH_GOOGLE_CLIENT_ID,
        clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET,
      }),
    );
  }

  if (flags.github && process.env.OAUTH_GITHUB_CLIENT_ID && process.env.OAUTH_GITHUB_CLIENT_SECRET) {
    providers.push(
      GitHub({
        clientId: process.env.OAUTH_GITHUB_CLIENT_ID,
        clientSecret: process.env.OAUTH_GITHUB_CLIENT_SECRET,
      }),
    );
  }

  if (flags.oidc && process.env.OAUTH_OIDC_ISSUER && process.env.OAUTH_OIDC_CLIENT_ID && process.env.OAUTH_OIDC_CLIENT_SECRET) {
    providers.push({
      id: 'oidc',
      name: 'OIDC',
      type: 'oidc',
      issuer: process.env.OAUTH_OIDC_ISSUER,
      clientId: process.env.OAUTH_OIDC_CLIENT_ID,
      clientSecret: process.env.OAUTH_OIDC_CLIENT_SECRET,
      checks: ['pkce', 'state'],
      profile(profile: Record<string, unknown>) {
        const displayName = typeof profile.name === 'string' ? profile.name : null;
        const usernameFromProfile = typeof profile.preferred_username === 'string'
          ? profile.preferred_username
          : typeof profile.email === 'string'
            ? profile.email.split('@')[0]
            : null;
        return {
          id: String(profile.sub),
          name: displayName,
          email: typeof profile.email === 'string' ? profile.email : null,
          image: typeof profile.picture === 'string' ? profile.picture : null,
          username: usernameFromProfile,
        };
      },
      authorization: { params: { scope: 'openid profile email' } },
    });
  }

  return providers;
}

export async function provisionOAuthUser(params: {
  account: Account;
  profile?: Profile;
  user?: { name?: string | null; email?: string | null; image?: string | null };
}) {
  const provider = normalizeProvider(params.account.provider);
  const providerAccountId = String(params.account.providerAccountId || '').trim();

  if (!provider || !providerAccountId) {
    throw new Error('OAuth provider identity is missing.');
  }

  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: {
      user: {
        select: { id: true, role: true, sessionVersion: true, needsPasswordChange: true },
      },
    },
  });

  if (existing?.user) {
    await prisma.oAuthAccount.update({
      where: { id: existing.id },
      data: {
        accessToken: params.account.access_token ?? null,
        refreshToken: params.account.refresh_token ?? null,
        expiresAt: params.account.expires_at ?? null,
        tokenType: params.account.token_type ?? null,
        scope: params.account.scope ?? null,
        idToken: params.account.id_token ?? null,
      },
    });
    return { user: existing.user, isNewUser: false };
  }

  const profileAny = (params.profile ?? {}) as Record<string, unknown>;
  const candidate =
    (typeof profileAny.preferred_username === 'string' && profileAny.preferred_username)
    || (typeof params.user?.name === 'string' && params.user.name)
    || (typeof params.user?.email === 'string' && params.user.email.split('@')[0])
    || `${provider}user`;

  const username = await ensureUniqueUsername(candidate);
  const numericId = await ensureUniqueNumericId();
  const passwordHash = await argon2.hash(`oauth:${provider}:${crypto.randomUUID()}`);

  const created = await prisma.user.create({
    data: {
      username,
      numericId,
      passwordHash,
      displayName: typeof params.user?.name === 'string' ? params.user.name : null,
      profilePhoto: typeof params.user?.image === 'string' ? params.user.image : null,
      identityKeyPublic: '',
      signedPreKey: '',
      signedPreKeySig: '',
      signingPublicKey: null,
      e2eeVersion: 'legacy',
      oauthAccounts: {
        create: {
          provider,
          providerAccountId,
          accessToken: params.account.access_token ?? null,
          refreshToken: params.account.refresh_token ?? null,
          expiresAt: params.account.expires_at ?? null,
          tokenType: params.account.token_type ?? null,
          scope: params.account.scope ?? null,
          idToken: params.account.id_token ?? null,
        },
      },
    },
    select: { id: true, role: true, sessionVersion: true, needsPasswordChange: true },
  });

  return { user: created, isNewUser: true };
}

export type OAuthBridgeToken = JWT & {
  localUserId?: string;
  localUserRole?: string;
  localSessionVersion?: number;
  localNeedsPasswordChange?: boolean;
  localOAuthIsNewUser?: boolean;
};
