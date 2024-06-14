import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { HttpService } from '@nestjs/axios';
import { catchError, lastValueFrom, map } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as util from 'util';

@Injectable()
export class UtilsService {
  private readonly logFilePath = 'log.json';
  private logQueue: (() => void)[] = [];
  private isProcessingQueue = false;
  
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
  
  fileLog(transactionId: string, type: string): void {
    const timestamp = new Date().toISOString();
    this.logger.info(`${type} ${transactionId}`);
    
    const logEntry = { transactionId, type, timestamp };
    this.enqueueLog(() => this.appendLogToFile(logEntry));
  }
  
  private enqueueLog(logOperation: () => void): void {
    this.logQueue.push(logOperation);
    if (!this.isProcessingQueue) {
      this.processLogQueue();
    }
  }
  
  private async processLogQueue(): Promise<void> {
    this.isProcessingQueue = true;
    while (this.logQueue.length > 0) {
      const logOperation = this.logQueue.shift();
      if (logOperation) {
        await logOperation();
      }
    }
    this.isProcessingQueue = false;
  }
  
  private async appendLogToFile(logEntry: any): Promise<void> {
    try {
      const readFile = util.promisify(fs.readFile);
      const writeFile = util.promisify(fs.writeFile);
      
      let logs = [];
      try {
        const data = await readFile(this.logFilePath, 'utf8');
        logs = JSON.parse(data);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
      logs.push(logEntry);
      await writeFile(this.logFilePath, JSON.stringify(logs, null, 2));
    } catch (err) {
      await this.handelAppendLogToFileError(logEntry, err);
    }
  }
  
  private async handelAppendLogToFileError(logEntry: any, error: any) {
    console.error(error);
    await this.sleep(100);
    this.enqueueLog(() => this.appendLogToFile(logEntry));
  }
  
  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
