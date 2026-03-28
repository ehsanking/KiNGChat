import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('installer and compose production hardening', () => {
  it('installer no longer hardcodes weak admin username and does not disable strict ssl', () => {
    const install = fs.readFileSync('install.sh', 'utf8');
    expect(install).not.toContain('ADMIN_USERNAME=admin');
    expect(install).not.toContain('strict-ssl=false');
    expect(install).toContain('prompt_admin_credentials');
  });

  it('production compose is documented as override strategy', () => {
    const composeProd = fs.readFileSync('compose.prod.yaml', 'utf8');
    const readme = fs.readFileSync('README.md', 'utf8');

    expect(composeProd).toContain('Production override');
    expect(readme).toContain('docker compose -f docker-compose.yml -f compose.prod.yaml --env-file .env.production up -d --build');
  });
});
