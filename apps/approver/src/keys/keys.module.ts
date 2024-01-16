import { Module } from '@nestjs/common';
import { KeysService } from './keys.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [KeysService],
  exports: [KeysService],
})
export class KeysModule {}
