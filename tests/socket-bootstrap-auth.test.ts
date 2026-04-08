import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('socket bootstrap authentication hardening', () => {
  it('installs socket auth middleware and session revalidation', () => {
    const source = fs.readFileSync('lib/runtime/socket-bootstrap.ts', 'utf8');
    expect(source).toContain('io.use(async (socket: Socket, next) =>');
    expect(source).toContain("next(new Error('Authentication required'))");
    expect(source).toContain("socket.emit('session:expired'");
    expect(source).toContain('setInterval(async () =>');
  });
});
