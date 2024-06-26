import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { HttpService } from '@nestjs/axios';
import { catchError, lastValueFrom, map } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';

@Injectable()
export class UtilsService {
  private readonly logFilePath = 'log.json';
  private logQueue: (() => Promise<void>)[] = [];
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
  
  private enqueueLog(logOperation: () => Promise<void>): void {
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
        await logOperation().catch(err => this.logger.error(`Log operation failed: ${err}`));
      }
    }
    this.isProcessingQueue = false;
  }
  
  private async appendLogToFile(logEntry: any): Promise<void> {
    try {
      const data = await fs.readFile(this.logFilePath, 'utf8').catch(err => {
        if (err.code === 'ENOENT') return '[]'; // Handle file not found
        throw err;
      });
      const logs = JSON.parse(data);
      logs.push(logEntry);
      await fs.writeFile(this.logFilePath, JSON.stringify(logs, null, 2));
    } catch (err) {
      await this.handleAppendLogToFileError(logEntry, err);
    }
  }
  
  private async handleAppendLogToFileError(logEntry: any, error: any): Promise<void> {
    this.logger.error(`Error appending log to file: ${error}`);
    await this.sleep(100);
    this.enqueueLog(() => this.appendLogToFile(logEntry));
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
