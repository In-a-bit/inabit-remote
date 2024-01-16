import { NestFactory } from '@nestjs/core';
import { ApproverModule } from './approver.module';
import { env } from 'process';

async function bootstrap() {
  const app = await NestFactory.create(ApproverModule);
  await app.listen(env.APPROVER_PORT ?? 3020);
}
bootstrap();
