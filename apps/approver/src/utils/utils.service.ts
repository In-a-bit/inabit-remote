import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { HttpService } from '@nestjs/axios';
import { catchError, lastValueFrom, map } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as csvtojson from 'csvtojson';
import { WhitelistRow } from './types/WhitelistRow';

@Injectable()
export class UtilsService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    this.logger.info('UtilsService initialized');
  }

  async sendRequestToInabit<T>(
    graphql: any,
    authorizationToken: string,
  ): Promise<T> {
    const InabitEndpointUrl = this.config.get('INABIT_API_BASE_URL');
    try {
      const config = {
        headers: {
          Authorization: 'Bearer ' + authorizationToken?.trim(),
          'Access-Control-Allow-Origin': '*',
        },
      };

      return await this.httpClient(InabitEndpointUrl, 'post', graphql, config);
    } catch (error) {
      this.logger.error(this.errorToString(error));
      throw error;
    }
  }

  async httpClient(url: string, method: string, data?: any, config?: any) {
    const httpService = new HttpService();
    const request =
      method.toLowerCase() === 'get'
        ? httpService.get(url, config)
        : httpService.post(url, data, config);

    let response;
    try {
      response = await lastValueFrom(
        request.pipe(
          map(
            (response) => {
              return response.data;
            },
            catchError((err) => {
              this.logger.error('httpClient observable error. Details: ' + err);
              throw err;
            }),
          ),
        ),
      );
    } catch (error) {
      this.logger.error(
        `httpClient error: ${this.errorToString(error)} 
            url: ${url},
            method: ${method}
            request data: ${
              data && typeof data === 'string'
                ? data
                : data && typeof data === 'object'
                ? JSON.stringify(data)
                : ''
            }`,
      );
      throw error;
    }
    return response;
  }

  errorToString(error: any): string {
    if (!error) return 'unknown error';

    if (typeof error === 'string') return error;

    if (typeof error === 'object')
      return `${
        error?.message ??
        JSON.stringify(error, Object.getOwnPropertyNames(error))
      }`;

    return 'unknown error';
  }

  async getFilePath(filePath: string, fileName: string): Promise<string> {
    const appRootPath = await path.resolve('./');
    const keyFilePath = `${appRootPath}/${filePath}/${fileName}`;
    return keyFilePath;
  }

  async getWhiteListAddresses(): Promise<WhitelistRow[] | undefined> {
    try {
      const csvFilePath = this.config.getOrThrow<string>('WHITELIST_CSV_PATH');
      const csvFileName = this.config.getOrThrow<string>(
        'WHITELIST_CSV_FILE_NAME',
      );
      const filePath = await this.getFilePath(csvFilePath, csvFileName);

      if (!fs.existsSync(filePath)) {
        this.logger.error(
          `getWhiteListAddresses: Whitelist CSV file not found at: ${filePath}`,
        );
        return undefined;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const customHeaders = ['address', 'network', 'coin'];
      const rows: WhitelistRow[] = await csvtojson({
        noheader: false,
        headers: customHeaders,
      }).fromString(fileContent);
      return rows;
    } catch (error) {
      this.logger.error(
        `getWhiteListAddresses: Error reading whitelist CSV file: ${this.errorToString(
          error,
        )}`,
      );
      return undefined;
    }
  }
}
