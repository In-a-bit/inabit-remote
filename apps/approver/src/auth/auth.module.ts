import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UtilsModule } from '../utils/utils.module';
import { RefreshTokenModule } from '../refresh-token/refresh-token.module';

@Module({
  imports: [UtilsModule, RefreshTokenModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
