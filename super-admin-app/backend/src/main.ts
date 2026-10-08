import 'dotenv/config';

// Prisma returns BigInt ids; make them JSON-serialisable as strings.
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({
    origin: (process.env.PLATFORM_APP_URL ?? 'http://localhost:3100').split(','),
    credentials: false,
  });

  const docs = new DocumentBuilder()
    .setTitle('Dental Platform API')
    .setDescription('Operator console: onboard and monitor every clinic on the platform')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, docs));

  await app.listen(process.env.PORT ?? 5100);
}

void bootstrap();
