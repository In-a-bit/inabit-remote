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
import { TransactionValidationData } from './utils/types/TransactionValidationData';
import { TransactionApprovalRequestData } from './utils/types/TransactionApprovalRequestData';

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

  async sendSignedTransactionApprovalToInabit(
    transactionId: string,
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
        'Approver needs to be paired before any signing is allowed.',
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
            id: transactionId,
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
    transactionApprovalRequestData: TransactionApprovalRequestData,
    retryCount = 1,
  ): Promise<boolean> {
    try {
      this.logger.info(
        `Received transaction for approval: ${JSON.stringify(
          transactionApprovalRequestData,
        )}`,
      );

      if (
        !this.validateRetryCount(
          retryCount,
          transactionApprovalRequestData.transactionId,
        )
      )
        return false;

      const validationResponse = await this.callExternalValidationUrl(
        transactionApprovalRequestData,
      );
      this.logger.info(
        `transaction ${transactionApprovalRequestData.transactionId} validation approved: ${validationResponse.approved}`,
      );

      const signedTransactionData = await this.signTransaction(
        validationResponse.approved,
        transactionApprovalRequestData,
      );

      await this.sendSignedTransactionApprovalToInabit(
        transactionApprovalRequestData.transactionId,
        validationResponse?.approved
          ? EnumPolicyApprovalStatus.Approved
          : EnumPolicyApprovalStatus.Rejected,
        signedTransactionData,
      );
      this.logger.info(
        `transaction ${transactionApprovalRequestData.transactionId} approval sent: (approved: ${validationResponse.approved})`,
      );
      return true;
    } catch (error) {
      return this.handleTransactionApprovalError(
        retryCount,
        error,
        transactionApprovalRequestData,
      );
    }
  }

  private handleTransactionApprovalError(
    retryCount: number,
    error: any,
    transactionApprovalRequestData: TransactionApprovalRequestData,
  ) {
    this.logger.error(
      `handleTransactionApprovalRequest error (retry: ${retryCount}): ${this.utilsService.errorToString(
        error,
      )}, ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`,
    );
    setTimeout(() => {
      try {
        this.handleTransactionApprovalRequest(
          transactionApprovalRequestData,
          retryCount + 1,
        );
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

  private async signTransaction(
    approved: boolean,
    transactionApprovalRequestData: TransactionApprovalRequestData,
  ) {
    const dataToBeSigned = this.prepareTransactionApprovalDataToSign(
      approved,
      transactionApprovalRequestData,
    );

    const signedTransactionData = await this.keysService.signTransactionData(
      JSON.stringify(dataToBeSigned),
    );
    this.logger.info(
      `transaction ${transactionApprovalRequestData.transactionId} approval signed: (approved: ${approved})`,
    );
    return signedTransactionData;
  }

  private validateRetryCount(
    retryCount: number,
    transactionId: string,
  ): boolean {
    const maxRetries = this.configService.get('VALIDATION_RETRY_MAX_COUNT', 10);
    if (retryCount > maxRetries) {
      this.logger.error(
        `handleTransactionApprovalRequest max retries ${maxRetries} reached. (id: ${transactionId}))`,
      );
      return false;
    }
    return true;
  }

  private prepareTransactionApprovalDataToSign(
    approved: boolean,
    transaction: any,
  ) {
    return {
      approved: approved ? 'true' : 'false',
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
        is_api: true,
      },
    };
  }

  async callExternalValidationUrl(
    transactionValidationData: TransactionValidationData,
  ): Promise<{ approved: boolean }> {
    const validationCallbackUrl = this.configService.getOrThrow(
      'VALIDATION_CALLBACK_URL',
    );
    try {
      const response = await this.utilsService.httpClient(
        validationCallbackUrl,
        'post',
        transactionValidationData,
      );

      if (
        !response ||
        (response.approved !== true &&
          response.approved !== false &&
          response.approved.toLowerCase() !== 'true' &&
          response.approved.toLowerCase() !== 'false')
      ) {
        throw new Error(
          `validateTransaction invalid response: ${response?.approved}`,
        );
      }
      if (typeof response.approved === 'string') {
        if (response.approved.toLowerCase() === 'false')
          response.approved = false;
        if (response.approved.toLowerCase() === 'true')
          response.approved = true;
      }
      return response;
    } catch (error) {
      this.logger.error(
        `callExternalValidationUrl error: ${this.utilsService.errorToString(
          error,
        )}`,
      );
      throw error;
    }
  }

  mockValidateTransaction(
    transactionValidationData: TransactionValidationData,
  ): {
    approved: boolean;
  } {
    this.logger.info(
      `mockValidateTransaction: ${JSON.stringify(transactionValidationData)}`,
    );
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
