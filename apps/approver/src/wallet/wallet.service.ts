import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class WalletKeysService {
  constructor(
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async saveWalletKeys(walletKeys: string) {
    const walletKeysFilePath = await this.getWalletKeysFilePath();
    const walletKeysFileName = this.getWalletKeysFileName();
    if (fs.existsSync(walletKeysFilePath)) {
      fs.writeFileSync(walletKeysFilePath, walletKeys);
    } else {
      fs.mkdirSync(walletKeysFilePath.replace(`/${walletKeysFileName}`, ''), {
        recursive: true,
      });
      fs.writeFileSync(walletKeysFilePath, walletKeys);
    }
  }

  private async getWalletKeysFilePath(): Promise<string> {
    const filePath = this.configService.get('WALLET_KEYS_FILE_PATH', 'wallet');
    const fileName = this.getWalletKeysFileName();
    const appRootPath = await path.resolve('./');
    const walletFilePath = `${appRootPath}/${filePath}/${fileName}`;
    return walletFilePath;
  }

  private getWalletKeysFileName() {
    return this.configService.get('WALLET_KEYS_FILE_NAME', 'wallet.dat');
  }
}
