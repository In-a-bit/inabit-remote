import { Module } from '@nestjs/common';
import { WalletKeysService } from './wallet.service';
import { UtilsService } from '../utils/utils.service';
@Module({
  providers: [WalletKeysService, UtilsService],
  exports: [WalletKeysService],
})
export class WalletModule {}