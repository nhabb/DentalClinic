import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Reachable without a platform token (only the login route). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
