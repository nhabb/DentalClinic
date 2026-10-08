/**
 * Platform session, kept in sessionStorage so each browser tab has its own
 * sign-in and nothing survives closing the browser. Every access is wrapped
 * because Safari private mode throws on storage calls.
 */
export interface PlatformUser {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
}

const TOKEN_KEY = "platformToken";
const USER_KEY = "platformUser";

function read(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // private mode / quota: ignore
  }
}

export const session = {
  token(): string | null {
    return read(TOKEN_KEY);
  },
  user(): PlatformUser | null {
    const raw = read(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PlatformUser;
    } catch {
      return null;
    }
  },
  start(token: string, user: PlatformUser) {
    write(TOKEN_KEY, token);
    write(USER_KEY, JSON.stringify(user));
  },
  end() {
    write(TOKEN_KEY, null);
    write(USER_KEY, null);
  },
};
