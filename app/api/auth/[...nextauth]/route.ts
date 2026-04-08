import { Auth } from '@auth/core';
import type { AuthConfig } from '@auth/core';
import type { Profile } from '@auth/core/types';
import type { NextRequest } from 'next/server';
import { getRateLimitHeaders, rateLimit, rateLimitPreset } from '@/lib/rate-limit';
import { getOAuthProviders, provisionOAuthUser, type OAuthBridgeToken } from '@/lib/oauth';

const authSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.SESSION_SECRET;

const buildAuthConfig = async (): Promise<AuthConfig> => ({
  secret: authSecret,
  trustHost: true,
  providers: (await getOAuthProviders()) as AuthConfig['providers'],
  session: { strategy: 'jwt', maxAge: 10 * 60 },
  callbacks: {
    async signIn({ account }) {
      return account?.type === 'oauth';
    },
    async jwt({ token, account, profile, user }) {
      const oauthAccount = account as ({ type?: string } & Parameters<typeof provisionOAuthUser>[0]['account']) | null;
      if (oauthAccount?.type === 'oauth') {
        const provisioned = await provisionOAuthUser({
          account: oauthAccount,
          profile: profile as Profile | undefined,
          user: user as { name?: string | null; email?: string | null; image?: string | null } | undefined,
        });
        const bridgeToken = token as OAuthBridgeToken;
        bridgeToken.localUserId = provisioned.user.id;
        bridgeToken.localUserRole = provisioned.user.role;
        bridgeToken.localSessionVersion = provisioned.user.sessionVersion;
        bridgeToken.localNeedsPasswordChange = provisioned.user.needsPasswordChange;
        bridgeToken.localOAuthIsNewUser = provisioned.isNewUser;
      }
      return token;
    },
    async redirect() {
      return '/api/auth/oauth/finalize';
    },
  },
});

const applyCallbackRateLimit = async (request: NextRequest) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
  const path = request.nextUrl.pathname;
  if (!path.includes('/api/auth/callback/')) return null;
  const provider = path.split('/').pop() || 'unknown';
  const result = await rateLimit(`oauth-callback:${provider}:${ip}`, rateLimitPreset('login'));
  if (result.allowed) return null;
  return new Response(JSON.stringify({ error: 'Too many OAuth callback attempts. Please try again later.' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      ...getRateLimitHeaders(result),
    },
  });
};

export async function GET(request: NextRequest) {
  const limited = await applyCallbackRateLimit(request);
  if (limited) return limited;
  return Auth(request, await buildAuthConfig());
}

export async function POST(request: NextRequest) {
  return Auth(request, await buildAuthConfig());
}
