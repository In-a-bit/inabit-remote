import { Module } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';
import { UtilsService } from '../utils/utils.service';

@Module({
  providers: [RefreshTokenService, UtilsService],
  exports: [RefreshTokenService],
})
export class RefreshTokenModule {}
