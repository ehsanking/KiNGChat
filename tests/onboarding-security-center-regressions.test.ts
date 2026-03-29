import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('onboarding and security center flow', () => {
  it('routes new registrations through onboarding', () => {
    const registerClient = fs.readFileSync('components/auth/RegisterPageClient.tsx', 'utf8');
    expect(registerClient).toContain('/auth/onboarding');
    expect(registerClient).toContain('Add a recovery question (optional)');
  });

  it('ships a security center with implementation-accurate language and peer fingerprint UX', () => {
    const securityCenter = fs.readFileSync('app/chat/security-center/page.tsx', 'utf8');
    expect(securityCenter).toContain('Signal-grade parity is not claimed');
    expect(securityCenter).toContain('Direct-message safety number');
    expect(securityCenter).toContain('dmVerifiedPeers');
  });
});
