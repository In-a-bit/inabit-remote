import { Module } from '@nestjs/common';
import { InitiationService } from './initiation.service';
import { UtilsModule } from '../utils/utils.module';
import { KeysModule } from '../keys/keys.module';

@Module({
  imports: [UtilsModule, KeysModule],
  providers: [InitiationService],
  exports: [InitiationService],
})
export class InitiationModule {}
