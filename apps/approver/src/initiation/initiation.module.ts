import { Module } from '@nestjs/common';
import { InitiationService } from './initiation.service';
import { UtilsModule } from '../utils/utils.module';
import { KeysModule } from '../keys/keys.module';
import { AuthModule } from '../auth/auth.module';
import { RefreshTokenModule } from '../refresh-token/refresh-token.module';

@Module({
  imports: [UtilsModule, KeysModule, AuthModule, RefreshTokenModule],
  providers: [InitiationService],
  exports: [InitiationService],
})
export class InitiationModule {}
