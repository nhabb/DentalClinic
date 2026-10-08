import * as jwt from 'jsonwebtoken';
import { bearerToken, signPlatformToken, verifyPlatformToken } from './platform-token';

describe('platform tokens', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = 'platform-test-secret-long-enough';
  });

  it('round-trips a signed token', () => {
    const token = signPlatformToken({ id: 42n, email: 'ops@x.com' });
    expect(verifyPlatformToken(token)).toMatchObject({ sub: '42', email: 'ops@x.com', aud: 'platform' });
  });

  it('rejects clinic tokens (no platform audience) and other secrets', () => {
    const clinicToken = jwt.sign({ sub: '42', role: 'superadmin' }, 'platform-test-secret-long-enough');
    expect(verifyPlatformToken(clinicToken)).toBeNull();
    const foreign = jwt.sign({ sub: '42' }, 'another-secret', { audience: 'platform' });
    expect(verifyPlatformToken(foreign)).toBeNull();
  });

  it('refuses to run with a weak secret', () => {
    process.env.PLATFORM_JWT_SECRET = 'short';
    expect(() => signPlatformToken({ id: 1n, email: null })).toThrow(/PLATFORM_JWT_SECRET/);
  });

  it('extracts bearer tokens', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});
