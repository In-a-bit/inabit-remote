import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { ApproverService } from './approver.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { EnumApproverPairingStatus } from './utils/enums/EnumApproverPairingStatus';
import { TransactionApprovalRequestData } from './utils/types/TransactionApprovalRequestData';
import { TransactionValidationData } from './utils/types/TransactionValidationData';

@Controller()
export class ApproverController {
  constructor(
    private readonly approverService: ApproverService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  @Get()
  getHello(): string {
    return this.approverService.getHello();
  }

  @Post('pairing')
  async pairing(@Body() body: { pairing: string }): Promise<boolean> {
    const { pairing } = body;
    if (pairing === EnumApproverPairingStatus.Paired) {
      this.logger.info('Approver is paired.');
    } else {
      this.logger.info(`Approver pairing ${pairing}}.`);
    }
    return true;
  }

  @Post('transaction/approval')
  async transactionApprovalRequest(
    @Body()
    data: {
      transactionApprovalRequestData: TransactionApprovalRequestData;
    },
  ): Promise<boolean> {
    this.approverService.handleTransactionApprovalRequest(
      data.transactionApprovalRequestData,
    );
    return true;
  }

  @Post('transaction/validate')
  async mockValidateTransaction(
    @Body() transactionValidationData: TransactionValidationData,
  ): Promise<{ approved: boolean }> {
    return this.approverService.mockValidateTransaction(
      transactionValidationData,
    );
  }
  @Post('webhook')
  async testWebhook(
    @Req() request: Request,
    @Body() data: any,
  ): Promise<{ result: boolean }> {
    console.log(
      `test webhook ${JSON.stringify(data)}, headers : ${JSON.stringify(
        request.headers,
      )}`,
    );
    // throw new Error();
    return { result: true };
  }
}
