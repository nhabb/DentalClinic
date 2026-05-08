import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // ── Prisma known errors → meaningful 400s ─────────────────────────────────
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaMessages: Record<string, string> = {
        P2002: 'A record with this value already exists.',
        P2025: 'Record not found.',
        P2020: 'A numeric value is out of the allowed range.',
        P2006: 'The provided value is invalid for this field.',
      };
      const msg = prismaMessages[exception.code] ?? 'Database error.';
      return response.status(HttpStatus.OK).json({
        ok: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: msg,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
    }

    // ── Prisma validation errors (e.g. value too large for column type) ───────
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return response.status(HttpStatus.OK).json({
        ok: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          'Invalid value provided. Check that all fields are within the allowed range.',
        path: request.url,
        timestamp: new Date().toISOString(),
      });
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message: string | string[] = 'Internal server error';
    if (exceptionResponse) {
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        'message' in exceptionResponse
      ) {
        message = (exceptionResponse as { message: string | string[] }).message;
      }
    }

    response.status(HttpStatus.OK).json({
      ok: false,
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
