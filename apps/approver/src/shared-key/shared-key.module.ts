import { Module } from '@nestjs/common';
import { SharedKeyService } from './shared-key.service';
import { UtilsService } from '../utils/utils.service';
@Module({
  providers: [SharedKeyService, UtilsService],
  exports: [SharedKeyService],
})
export class SharedKeyModule {}
