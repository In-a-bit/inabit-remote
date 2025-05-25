import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { UtilsService } from './utils/utils.service';
import { InitiationService } from './initiation/initiation.service';
import {
  CreateSignedTransactionApprovalResponse,
  GetWalletKeysResponse,
} from './utils/types/InabitResponseTypes';
import { AuthService } from './auth/auth.service';
import { KeysService } from './keys/keys.service';
import { ConfigService } from '@nestjs/config';
import { EnumPolicyApprovalStatus } from './utils/enums/EnumPolicyApprovalStatus';
import { TransactionValidationData } from './utils/types/TransactionValidationData';
import { TransactionApprovalRequestData } from './utils/types/TransactionApprovalRequestData';
import { WalletUpdatedData } from './utils/types/WalletUpdatedData';
import { WalletKeysService } from './wallet/wallet.service';
import { SharedKeyService } from './shared-key/shared-key.service';
import { EncryptedSharedKeyMessage } from './utils/types/EncryptedSharedKeyMessage';
import { WhitelistRow } from './utils/types/WhitelistRow';
import { ValidationResult } from './utils/types/ValidationResult';
import { NetworkEnum } from './utils/enums/EnumNetwork';

@Injectable()
export class ApproverService implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    private readonly utilsService: UtilsService,
    private readonly authService: AuthService,
    private readonly initiationService: InitiationService,
    private readonly keysService: KeysService,
    private readonly walletKeysService: WalletKeysService,
    private readonly configService: ConfigService,
    private readonly sharedKeyService: SharedKeyService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async onApplicationBootstrap() {
    try {
      if (!(await this.sharedKeyService.sharedKeyExists())) {
        this.logger.info(
          '[onApplicationBootstrap], Shared key is missing, triggering a get shared key request.',
        );
        await this.triggerGetSharedKeyRequest();
      }
    } catch (error) {
      this.logger.error(
        `[onApplicationBootstrap] ApproverService error: ${
          error?.message ?? this.utilsService.errorToString(error)
        }`,
      );
    }
  }

  async onModuleInit() {
    try {
      await this.initiationService.initApprover();
    } catch (error) {
      this.logger.error(
        `[onModuleInit] ApproverService error: ${
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
    transaction: TransactionApprovalRequestData,
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
        transaction_type: transaction.transactionType,
        offramp_details: transaction?.offrampDetails
          ? {
              provider: transaction?.offrampDetails?.provider,
              iban: transaction?.offrampDetails?.iban,
              account_number: transaction?.offrampDetails?.accountNumber,
              fiat_currency: transaction?.offrampDetails?.fiatCurrency,
            }
          : undefined,
        memo: transaction.memo || undefined,
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

  async handleWalletUpdated(
    walletUpdatedData: WalletUpdatedData,
  ): Promise<boolean> {
    try {
      this.logger.info(
        `[handleWalletUpdated] Received a wallet updated notification, fetching wallet keys data: ${JSON.stringify(
          walletUpdatedData,
        )}`,
      );

      const walletKeys = await this.getWalletKeys(
        walletUpdatedData.organizationId,
      );

      if (!walletKeys) {
        this.logger.error(
          `[handleWalletUpdated] Failed fetching wallet keys data: ${JSON.stringify(
            walletUpdatedData,
          )}`,
        );
        return false;
      }

      await this.walletKeysService.saveWalletKeys(walletKeys);
      this.logger.info(
        `[handleWalletUpdated] Successful fetching and saving wallet keys data: ${JSON.stringify(
          walletUpdatedData,
        )}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `[handleWalletUpdated] Failed fetching and saving wallet keys data: ${JSON.stringify(
          walletUpdatedData,
        )}, error: ${this.utilsService.errorToString(error)}`,
      );
      return false;
    }
  }

  async getWalletKeys(organizationId: string): Promise<string | undefined> {
    const accessToken = await this.authService.login();

    const apiSigner = await this.authService.getApiSignerState(accessToken);

    if (!apiSigner) {
      const errorMsg = `[getWalletKeys] Approver is not registered, contact support.  organization ${organizationId}`;
      throw new Error(errorMsg);
    }

    if (this.authService.pairingNeeded(apiSigner)) {
      const errorMsg = `[getWalletKeys] Approver needs to be paired before accessing wallet keys. organization ${organizationId}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    const getWalletKeysRequest = {
      query: `query WalletKeysApiSigner($where: WalletKeysWhereUniqueInput!) {\r\n  walletKeysApiSigner(where: $where) {\r\n    walletKeys\r\n  }\r\n}`,
      variables: {
        where: {
          organization: {
            id: organizationId,
          },
        },
      },
    };

    let result;
    try {
      result =
        await this.utilsService.sendRequestToInabit<GetWalletKeysResponse>(
          getWalletKeysRequest,
          accessToken,
        );
    } catch (error) {
      this.logger.error(
        `getWalletKeysRequest error for organization ${organizationId}, error: ${this.utilsService.errorToString(
          error,
        )}`,
      );
    }
    return result?.data?.walletKeysApiSigner?.walletKeys;
  }

  mockValidateTransaction(
    transactionValidationData: TransactionValidationData,
  ): ValidationResult {
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

  async validateTransactionDestinationAddress(
    transactionValidationData: TransactionValidationData,
  ): Promise<ValidationResult> {
    this.logger.info(
      `ValidateTransactionDestinationAddress: ${JSON.stringify(
        transactionValidationData,
      )}`,
    );

    const whitelistedAddresses: WhitelistRow[] | undefined =
      await this.utilsService.getWhiteListAddresses();
    if (!whitelistedAddresses || whitelistedAddresses.length === 0) {
      this.logger.warn(
        `validateTransactionDestinationAddress : Whitelist is empty or misconfigured. transaction validation failed , rejected.`,
      );
      return { approved: false };
    }
    try {
      for (const whitelistRow of whitelistedAddresses) {
        if (
          this.isTransactionWhitelisted(whitelistRow, transactionValidationData)
        ) {
          this.logger.info(
            `validateTransactionDestinationAddress: Transaction to ${transactionValidationData.to} on ${transactionValidationData.network} for ${transactionValidationData.coin} is whitelisted.`,
          );
          return { approved: true };
        }
      }
    } catch (error) {
      this.logger.error(
        `validateTransactionDestinationAddress: Error while validating transaction destination address: ${this.utilsService.errorToString(
          error,
        )}`,
      );
      return { approved: false };
    }

    this.logger.warn(
      `validateTransactionDestinationAddress: Transaction to ${transactionValidationData.to} on ${transactionValidationData.network} for ${transactionValidationData.coin} not found in whitelist or whitelist is empty/misconfigured.`,
    );
    return { approved: false };
  }

  getHello(): string {
    return 'Hello World!';
  }
  async handleGetSharedKeyResponse(
    encryptedSharedKeyData: string,
  ): Promise<boolean> {
    return await this.sharedKeyService.decryptAndSaveSharedKey(
      encryptedSharedKeyData,
    );
  }

  async triggerGetSharedKeyRequest(): Promise<{ success: boolean }> {
    try {
      if (!(await this.sharedKeyService.sharedKeyExists())) {
        const accessToken = await this.authService.login();
        const apiSigner = await this.authService.getApiSignerState(accessToken);

        if (!apiSigner) {
          const errorMsg = `[triggerGetSharedKeyRequest] Approver is not registered, contact support.`;
          this.logger.error(errorMsg);
          throw new Error(errorMsg);
        }

        if (apiSigner.pairingStatus === 'Paired') {
          return await this.sendGetSharedKeyRequest(accessToken);
        }
        this.logger.info(
          `[triggerGetSharedKeyRequest] skipped, Approver is currently not paired.`,
        );
      }
      this.logger.info(
        `[triggerGetSharedKeyRequest] skipped, shared key exists.`,
      );
    } catch (error) {
      this.logger.error(
        `[triggerGetSharedKeyRequest] Error occurred: ${this.utilsService.errorToString(
          error,
        )}`,
      );
    }
    return { success: false };
  }

  private async sendGetSharedKeyRequest(
    accessToken: string,
  ): Promise<{ success: boolean }> {
    const signedEncryptionPublicKey = await this.getSignedEncryptionPublicKey();

    return await this.sharedKeyService.getSharedKeyApiSignerRequest(
      signedEncryptionPublicKey,
      accessToken,
    );
  }

  async setSharedKey(): Promise<{ success: boolean }> {
    try {
      if (await this.sharedKeyService.sharedKeyExists()) {
        const accessToken = await this.authService.login();
        const apiSigner = await this.authService.getApiSignerState(accessToken);

        if (!apiSigner) {
          const errorMsg = `[sendSharedKey] Approver is not registered, contact support.`;
          this.logger.error(errorMsg);
          throw new Error(errorMsg);
        }

        if (apiSigner.pairingStatus === 'Paired') {
          const encryptedSharedKeyMessage: EncryptedSharedKeyMessage =
            await this.sharedKeyService.getEncryptedSharedKeyMessage(
              accessToken,
            );

          if (!encryptedSharedKeyMessage) {
            this.logger.error(
              `[setSharedKey] error: could not get an encrypted shared key message.`,
            );
            return { success: false };
          }

          const signedEncryptedSharedKeyMessage =
            await this.keysService.signEncryptedSharedKeyMessage(
              JSON.stringify(encryptedSharedKeyMessage),
            );

          if (!signedEncryptedSharedKeyMessage) {
            this.logger.error(
              `[setSharedKey] error: could not sign encrypted shared key message.`,
            );
            return { success: false };
          }

          return await this.sharedKeyService.setSharedKey(
            accessToken,
            signedEncryptedSharedKeyMessage,
          );
        }
        this.logger.info(
          `[setSharedKey] skipped, Approver is currently not paired.`,
        );
      } else {
        this.logger.info(`[setSharedKey] skipped, shared key does not exists.`);
      }
    } catch (error) {
      this.logger.error(
        `[setSharedKey] Error occurred: ${this.utilsService.errorToString(
          error,
        )}`,
      );
    }
    return { success: false };
  }

  private async getSignedEncryptionPublicKey(): Promise<string> {
    const publicEncryptionKey =
      await this.sharedKeyService.getPublicEncryptionKey();

    if (!publicEncryptionKey) {
      throw new Error(
        '[getSignedEncryptionPublicKey] error: no public encryption key found',
      );
    }
    const signedEncryptionPublicKey =
      await this.keysService.signPublicEncryptionKey(publicEncryptionKey);

    return signedEncryptionPublicKey;
  }

  private isTransactionWhitelisted(
    whitelistRow: WhitelistRow,
    transactionValidationData: TransactionValidationData,
  ): boolean {
    if (
      whitelistRow.address &&
      whitelistRow.network &&
      whitelistRow.coin &&
      this.compareAddresses(
        whitelistRow.address,
        transactionValidationData.to,
        transactionValidationData.network as NetworkEnum,
      ) &&
      whitelistRow.network === transactionValidationData.network &&
      whitelistRow.coin === transactionValidationData.coin
    ) {
      return true;
    }
    return false;
  }

  private compareAddresses(
    whitelistAddress: string,
    transactionAddress: string,
    network: NetworkEnum,
  ): boolean {
    const shouldLowerCaseBeforeCheck =
      this.shouldLowerCaseAddressesBeforeCompare(network, transactionAddress);
    return shouldLowerCaseBeforeCheck
      ? whitelistAddress.toLowerCase() === transactionAddress.toLowerCase()
      : whitelistAddress === transactionAddress;
  }

  private shouldLowerCaseAddressesBeforeCompare(
    network: NetworkEnum,
    address: string,
  ): boolean {
    let shouldLowerCase = false;
    switch (network) {
      case NetworkEnum.BTC: {
        if (address.startsWith('bc1')) {
          shouldLowerCase = true;
        }
        break;
      }
      case NetworkEnum.LTC: {
        if (address.startsWith('ltc1')) {
          shouldLowerCase = true;
        }
        break;
      }
      case NetworkEnum.BCH: {
        if (address.startsWith('bitcoincash:')) {
          shouldLowerCase = true;
        }
        break;
      }
      case NetworkEnum.MATIC:
      case NetworkEnum.BSC:
      case NetworkEnum.ETH:
      case NetworkEnum.ETHEREUM_SEPOLIA:
        shouldLowerCase = true;
        break;
      case NetworkEnum.TRON:
      case NetworkEnum.XRP:
      case NetworkEnum.SOL:
      default:
        shouldLowerCase = false;
        break;
    }
    return shouldLowerCase;
  }
}
