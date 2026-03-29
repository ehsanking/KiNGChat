import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('privacy and authorization regressions', () => {
  it('public profile action does not expose totpEnabled', () => {
    const source = fs.readFileSync('app/actions/auth-legacy.ts', 'utf8');
    const publicStart = source.indexOf('export async function getPublicUserProfile');
    const selfStart = source.indexOf('export async function getSelfUserProfile');
    const publicBlock = source.slice(publicStart, selfStart);
    expect(publicBlock).not.toContain('totpEnabled');
  });

  it('group member listing is session-derived and authorization-gated', () => {
    const communityActions = fs.readFileSync('app/actions/community.actions.ts', 'utf8');
    const authActions = fs.readFileSync('app/actions/auth-legacy.ts', 'utf8');

    expect(communityActions).toContain('const session = await getSession();');
    expect(communityActions).toContain('return origGetGroupMembers(session.userId, groupId);');
    expect(authActions).toContain('if (!isAdmin && !membership && !group.isPublic)');
  });
});
