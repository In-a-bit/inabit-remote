import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import { UtilsService } from '../utils/utils.service';
import { refreshApiUserLoginTokenResponse } from '../utils/types/InabitResponseTypes';

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly configService: ConfigService,
    private readonly utilsService: UtilsService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async getLoginToken(): Promise<string> {
    const refreshTokenFilePath = await this.getRefreshTokenFilePath();
    if (fs.existsSync(refreshTokenFilePath)) {
      return fs.readFileSync(refreshTokenFilePath).toString();
    } else {
      throw new Error(
        'Failed to find login token, check configuration or contact support',
      );
    }
  }

  async refreshToken() {
    try {
      const refreshedLoginToken: string = await this.getNewLoginToken();
      await this.saveLoginToken(refreshedLoginToken);
      this.logger.info(`Refresh token completed`);
      await this.handleRefreshToken();
    } catch (error) {
      this.logger.error(
        `refreshToken error: ${this.utilsService.errorToString(
          error,
        )}, scheduling a retry in 10 minutes`,
      );
      setTimeout(() => {
        this.refreshToken();
      }, 10 * 60 * 1000);
    }
  }

  async handleRefreshToken() {
    try {
      this.logger.info(
        `Scheduling next refresh token in ${
          this.getRefreshTokenTimeoutInMinutes() / (60 * 24)
        } days`,
      );
      setTimeout(
        () => this.refreshToken(),
        this.getRefreshTokenTimeoutInMinutes() * 60 * 1000,
      );
    } catch (error) {
      this.logger.error(
        `handleRefreshToken error: ${this.utilsService.errorToString(
          error,
        )} , scheduling a retry in 10 minutes`,
      );
      setTimeout(() => {
        this.handleRefreshToken();
      }, 10 * 60 * 1000);
    }
  }

  private getRefreshTokenTimeoutInMinutes() {
    return this.configService.get('REFRESH_LOGIN_TOKEN_IN_MINUTES', 21600); // 15 days
  }

  private async getNewLoginToken() {
    let refreshedLoginToken: string;
    try {
      const loginToken: string = await this.getLoginToken();
      const refreshApiUserLoginTokenRequest = {
        query: `query Query {\r\n  refreshApiUserLoginToken\r\n}`,
        variables: {},
      };

      refreshedLoginToken = (
        await this.utilsService.sendRequestToInabit<refreshApiUserLoginTokenResponse>(
          refreshApiUserLoginTokenRequest,
          loginToken,
        )
      )?.data?.refreshApiUserLoginToken;
    } catch (error) {
      this.logger.error(
        `getNewLoginToken error: ${this.utilsService.errorToString(error)}`,
      );
      throw error;
    }
    return refreshedLoginToken;
  }

  private async saveLoginToken(refreshedLoginToken: string) {
    const refreshTokenFilePath = await this.getRefreshTokenFilePath();
    const fileName = this.getRefreshTokenFileName();
    if (fs.existsSync(refreshTokenFilePath)) {
      fs.writeFileSync(refreshTokenFilePath, refreshedLoginToken);
    } else {
      fs.mkdirSync(refreshTokenFilePath.replace(`/${fileName}`, ''), {
        recursive: true,
      });
      fs.writeFileSync(refreshTokenFilePath, refreshedLoginToken);
    }
  }

  private async getRefreshTokenFilePath(): Promise<string> {
    const filePath = this.configService.get(
      'REFRESH_TOKEN_FILE_PATH',
      'refresh',
    );
    const fileName = this.getRefreshTokenFileName();
    const appRootPath = await path.resolve('./');
    const refreshFilePath = `${appRootPath}/${filePath}/${fileName}`;
    return refreshFilePath;
  }

  private getRefreshTokenFileName() {
    return this.configService.get('REFRESH_TOKEN_FILE_NAME', 'r.dat');
  }
}
