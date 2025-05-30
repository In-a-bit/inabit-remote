import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { ApproverService } from './approver.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { EnumApproverPairingStatus } from './utils/enums/EnumApproverPairingStatus';
import { TransactionApprovalRequestData } from './utils/types/TransactionApprovalRequestData';
import { TransactionValidationData } from './utils/types/TransactionValidationData';
import { WalletUpdatedData } from './utils/types/WalletUpdatedData';

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
      this.logger.info(
        'Approver is paired. Triggering get shared key request...',
      );
      await this.approverService.triggerGetSharedKeyRequest();
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
    await this.approverService.setSharedKey();
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

  @Post('transaction/whitelist')
  async validateTransactionDestinationAddress(
    @Body() transactionValidationData: TransactionValidationData,
  ): Promise<{ approved: boolean }> {
    return this.approverService.validateTransactionDestinationAddress(
      transactionValidationData,
    );
  }

  @Post('wallet/updated')
  async walletUpdateEvent(
    @Body()
    data: {
      walletUpdatedData: WalletUpdatedData;
    },
  ): Promise<boolean> {
    return await this.approverService.handleWalletUpdated(
      data.walletUpdatedData,
    );
  }

  @Post('shared-key')
  async sharedKey(
    @Body()
    data: {
      encryptedSharedKey: string;
    },
  ): Promise<boolean> {
    return this.approverService.handleGetSharedKeyResponse(
      data.encryptedSharedKey,
    );
  }


  @Post('shared-key/set')
  async setSharedKeyRequest(): Promise<boolean> {
    return (await this.approverService.setSharedKey())?.success;
  }
}
