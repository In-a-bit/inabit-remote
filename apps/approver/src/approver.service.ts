import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { UtilsService } from './utils/utils.service';
import { InitiationService } from './initiation/initiation.service';
import { CreateSignedTransactionApprovalResponse } from './utils/types/InabitResponseTypes';
import { AuthService } from './auth/auth.service';
import { KeysService } from './keys/keys.service';
import { ConfigService } from '@nestjs/config';
import { EnumPolicyApprovalStatus } from './utils/enums/EnumPolicyApprovalStatus';

export type TransactionValidationData = {
  createTime: string;
  transactionId: string;
  transactionType: string;
  initiatorId: string;
  organizationId: string;
  network: string;
  walletId: string;
  walletAddress: string;
  to: string;
  coin: string;
  amount: number;
  baseCurrencyCode: string;
  baseCurrencyAmount: number;
};

@Injectable()
export class ApproverService {
  constructor(
    private readonly utilsService: UtilsService,
    private readonly authService: AuthService,
    private readonly initiationService: InitiationService,
    private readonly keysService: KeysService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async onModuleInit() {
    try {
      await this.initiationService.initApprover();
    } catch (error) {
      this.logger.error(
        `ApproverService onModuleInit error: ${
          error?.message ?? this.utilsService.errorToString(error)
        }`,
      );
      throw error;
    }
  }

  async sendSignedTransactionApproval(
    id: string,
    status: string,
    signedData: string | undefined,
  ): Promise<boolean | undefined> {
    const accessToken = await this.authService.login();

    const apiSigner = await this.authService.getApiSignerState(accessToken);

    if (!apiSigner) {
      throw new Error('Approver is not registered, contact support.');
    }

    if (this.authService.pairingNeeded(apiSigner)) {
      this.logger.info(
        'Approver needs to be paired, starts a pairing process...',
      );
      throw new Error('Approver is not paired, contact support.');
    }

    const createSignedTransactionApprovalRequest = {
      query: `mutation CreateSignedTransactionApproval($data: PolicyApprovalCreateInput!) {\r\n  createSignedTransactionApproval(data: $data) {\r\n    id\r\n  }\r\n}`,
      variables: {
        data: {
          signedData,
          status,
          transaction: {
            id,
          },
        },
      },
    };

    let result;
    try {
      result = (
        await this.utilsService.sendRequestToInabit<CreateSignedTransactionApprovalResponse>(
          createSignedTransactionApprovalRequest,
          accessToken,
        )
      )?.data?.result;
    } catch (error) {
      this.logger.error(
        `createSignedTransactionApprovalRequest error: ${this.utilsService.errorToString(
          error,
        )}`,
      );
    }
    return result;
  }

  async handleTransactionApprovalRequest(
    data: string,
    retryCount = 1,
  ): Promise<boolean> {
    try {
      const transaction = JSON.parse(data);
      this.logger.info(`Received transaction for approval: ${data}`);

      const maxRetries = this.configService.get(
        'VALIDATION_RETRY_MAX_COUNT',
        10,
      );
      if (retryCount > maxRetries) {
        this.logger.error(
          `handleTransactionApprovalRequest max retries ${maxRetries} reached. (id: ${transaction?.id}))`,
        );
        return false;
      }

      // 1. Call the external validation function.
      const transactionValidationData: TransactionValidationData = {
        ...transaction,
      };
      const validationResponse = await this.validateTransaction(
        transactionValidationData,
      );
      this.logger.info(
        `transaction ${transaction.transactionId} validation approved: ${validationResponse?.approved}`,
      );

      // 2. Sign the data
      const dataToBeSigned = this.prepareTransactionApprovalDataToSign(
        validationResponse?.approved,
        transaction,
      );

      const signedTransactionData =
        await this.keysService.getSignedTransactionData(
          JSON.stringify(dataToBeSigned),
        );
      this.logger.info(
        `transaction ${transaction.transactionId} approval signed: (approved: ${validationResponse?.approved})`,
      );

      // 3. Send the approval.
      await this.sendSignedTransactionApproval(
        transaction.transactionId,
        validationResponse?.approved
          ? EnumPolicyApprovalStatus.Approved
          : EnumPolicyApprovalStatus.Rejected,
        signedTransactionData,
      );
      this.logger.info(
        `transaction ${transaction.transactionId} approval sent: (approved: ${validationResponse?.approved})`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `handleTransactionApprovalRequest error (retry: ${retryCount}): ${this.utilsService.errorToString(
          error,
        )}`,
      );
      setTimeout(() => {
        try {
          this.handleTransactionApprovalRequest(data, retryCount + 1);
        } catch (error) {
          this.logger.error(
            `setTimeout handleTransactionApprovalRequest error (retry: ${retryCount}): ${this.utilsService.errorToString(
              error,
            )}`,
          );
        }
      }, this.configService.get('VALIDATION_RETRY_INTERVAL_MINUTES', 3) * 60 * 1000);
      return false;
    }
  }

  private prepareTransactionApprovalDataToSign(
    validationResponse: boolean,
    transaction: any,
  ) {
    return {
      approved: validationResponse ? 'true' : 'false',
      constraints: {
        nonce: 0,
        policy_id: transaction.policyRuleId,
      },
      tx_details: {
        wallet_id: transaction.walletId,
        network: transaction.network,
        coin: transaction.coin,
        to: transaction.to,
        coin_amount: transaction.amount,
        base_currency_amount: transaction.baseCurrencyAmount,
        create_time: transaction.createTime,
        creator_id: transaction.initiatorId,
        inabit_id: transaction.transactionId,
      },
    };
  }

  async validateTransaction(
    data: TransactionValidationData,
  ): Promise<{ approved: boolean }> {
    const validationCallbackUrl = this.configService.getOrThrow(
      'VALIDATION_CALLBACK_URL',
    );
    try {
      return await this.utilsService.httpClient(
        validationCallbackUrl,
        'post',
        data,
      );
    } catch (error) {
      this.logger.error(this.utilsService.errorToString(error));
      throw error;
    }
  }

  mockValidateTransaction(body: any): { approved: boolean } {
    this.logger.info(`mockValidateTransaction: ${body}`);
    const setResult = this.configService.get(
      'VALIDATION_MOCK_SET_RESULT',
      'rejected',
    );
    switch (setResult) {
      case 'approved':
        return { approved: true };
      case 'exception':
        throw new Error('undefined error from mock validate transaction');
      default:
      case 'rejected':
        return { approved: false };
    }
  }

  getHello(): string {
    return 'Hello World!';
  }
}
