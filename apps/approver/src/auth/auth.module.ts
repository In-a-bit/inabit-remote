import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UtilsModule } from '../utils/utils.module';

@Module({
  imports: [UtilsModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
