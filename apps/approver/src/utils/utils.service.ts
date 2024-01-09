import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { HttpService } from '@nestjs/axios';
import { catchError, lastValueFrom, map } from 'rxjs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UtilsService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    this.logger.info('UtilsService initialized');
  }

  async sendRequestToInabit(graphql: any, accessToken: string) {
    const InabitEndpointUrl = this.config.get('INABIT_API_BASE_URL');
    try {
      const config = {
        headers: {
          Authorization: 'Bearer ' + accessToken,
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
    if (!error) return '';

    if (typeof error === 'string') return error;

    if (typeof error === 'object')
      return `${
        error?.message ??
        JSON.stringify(error, Object.getOwnPropertyNames(error))
      }`;

    return '';
  }
}
