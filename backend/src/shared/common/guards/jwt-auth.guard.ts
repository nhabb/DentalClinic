import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }

    const token = authHeader.split(' ')[1];

    let payload: any;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET || 'changeme');
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    return true;
  }
}
