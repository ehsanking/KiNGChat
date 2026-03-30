import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('installer and compose production hardening', () => {
  it('installer no longer hardcodes weak admin username and does not disable strict ssl', () => {
    const install = fs.readFileSync('install.sh', 'utf8');
    expect(install).not.toContain('ADMIN_USERNAME=admin');
    expect(install).not.toContain('strict-ssl=false');
    expect(install).toContain('Existing .npmrc detected; preserving operator npm configuration.');
    expect(install).toContain('LOCAL_CAPTCHA_SECRET');
    expect(install).toContain('prompt_admin_credentials_fresh');
    expect(install).toContain('choose_source_ref');
    expect(install).toContain('provision_runtime_db_role');
    expect(install).toContain('Installer running in non-interactive mode.');
    expect(install).toContain('INSTALL_NONINTERACTIVE');
    expect(install).toContain('Non-interactive mode refuses to continue with occupied ports.');
    expect(install).toContain('INSTALL_USE_DOMAIN=true requires valid INSTALL_DOMAIN_NAME');
  });

  it('production compose is documented as override strategy', () => {
    const composeProd = fs.readFileSync('compose.prod.yaml', 'utf8');
    const readme = fs.readFileSync('README.md', 'utf8');

    expect(composeProd).toContain('Production override');
    expect(readme).toContain('docker compose -f docker-compose.yml -f compose.prod.yaml --env-file .env.production up -d --build');
  });
});
