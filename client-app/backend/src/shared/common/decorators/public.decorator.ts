import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a bearer token (login, signup, password
 * setup links, the public doctor list). Everything else requires a token
 * because JwtAuthGuard is registered globally.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
