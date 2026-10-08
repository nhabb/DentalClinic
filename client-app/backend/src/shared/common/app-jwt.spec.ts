import * as jwt from 'jsonwebtoken';
import { bearerToken, verifyAppJwt } from './app-jwt';

describe('bearerToken', () => {
  it.each([
    ['Bearer abc.def.ghi', 'abc.def.ghi'],
    ['Bearer ', null],
    ['Basic abc', null],
    [undefined, null],
    ['', null],
  ])('%p -> %p', (header, expected) => {
    expect(bearerToken(header)).toBe(expected);
  });
});

describe('verifyAppJwt', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-secret';
  });

  it('returns the claims of a token signed with our secret', () => {
    const token = jwt.sign(
      { sub: '1', role: 'admin', org_id: '2', branch_id: null },
      'unit-secret',
    );
    expect(verifyAppJwt(token)).toMatchObject({
      sub: '1',
      role: 'admin',
      org_id: '2',
      branch_id: null,
    });
  });

  it('rejects tokens signed with another secret', () => {
    expect(verifyAppJwt(jwt.sign({ sub: '1' }, 'other'))).toBeNull();
  });

  it('rejects expired tokens', () => {
    const token = jwt.sign(
      { sub: '1', exp: Math.floor(Date.now() / 1000) - 60 },
      'unit-secret',
    );
    expect(verifyAppJwt(token)).toBeNull();
  });

  it('rejects garbage and null', () => {
    expect(verifyAppJwt('not-a-token')).toBeNull();
    expect(verifyAppJwt(null)).toBeNull();
  });
});
