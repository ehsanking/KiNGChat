import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const installScriptPath = path.join(process.cwd(), 'install.sh');
const installScript = fs.readFileSync(installScriptPath, 'utf8');

describe('install.sh guardrails', () => {
  it('enforces strict shell mode', () => {
    expect(installScript).toContain('set -euo pipefail');
  });

  it('performs explicit root check in main flow', () => {
    expect(installScript).toMatch(/require_root "\$@"/);
  });

  it('validates supported cpu architectures', () => {
    expect(installScript).toContain('check_supported_architecture');
    expect(installScript).toContain('SUPPORTED_ARCHS=(');
  });

  it('checks tcp and udp preflight ports', () => {
    expect(installScript).toContain("Required command 'ss' is unavailable");
    expect(installScript).toContain('local tcp_ports=(80 443)');
    expect(installScript).toContain('local udp_ports=(443)');
    expect(installScript).toContain('ss -ltnH');
    expect(installScript).toContain('ss -lunH');
  });
});
