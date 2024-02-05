import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ApproverService } from './approver.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { EnumApproverPairingStatus } from './utils/enums/EnumApproverPairingStatus';

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
    @Body() body: { data: string },
  ): Promise<boolean> {
    setTimeout(() => {
      this.approverService.handleTransactionApprovalRequest(body?.data);
    });
    return true;
  }

  @Post('transaction/validate')
  async mockValidateTransaction(
    @Body() body: any,
  ): Promise<{ approved: boolean }> {
    return this.approverService.mockValidateTransaction(body);
  }
}
