import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { log } from './common/logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');
  app.enableCors();

  await app.listen(process.env.PORT ?? 3000);
  log.info('Application is running', { url: `http://localhost:${process.env.PORT ?? 3000}/api` });
}
bootstrap();
