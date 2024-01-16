import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { UtilsService } from './utils/utils.service';
import { KeysService } from './keys/keys.service';
import { InitiationService } from './initiation/initiation.service';


@Injectable()
export class ApproverService {
  constructor(
    private readonly configService: ConfigService,
    private readonly utilsService: UtilsService,
    private readonly keysService: KeysService,
    private readonly initiationService: InitiationService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async onModuleInit() {
    try {
      await this.initiationService.InitApprover();
    } catch (error) {
      this.logger.error(
        `ApproverService onModuleInit error: ${
          error?.message ?? this.utilsService.errorToString(error)
        }`,
      );
      throw error;
    }
  }
  
  getHello(): string {
    return 'Hello World!';
  }
}
