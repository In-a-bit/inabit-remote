import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { UtilsService } from '../utils/utils.service';
import { KeysService } from '../keys/keys.service';
import {
  getApiSignerStateResponse,
  getPairingTokenResponse,
  loginResponse,
  sendPairingDataResponse,
} from '../utils/types/responseTypes';

@Injectable()
export class InitiationService {
  constructor(
    private readonly configService: ConfigService,
    private readonly utilsService: UtilsService,
    private readonly keysService: KeysService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async InitApprover() {
    try {
      this.logger.info('Signer is logging into Inabit');
      const accessToken = await this.login();

      this.logger.info('Checking if Signer is paired already.');
      const apiSigner = await this.getApiSignerState(accessToken);

      if (!apiSigner) throw new Error('Signer does not exist');

      if (
        !['WaitingForApproval', 'Paired'].includes(apiSigner?.pairingStatus)
      ) {
        this.logger.info('Signer is not paired, starts a pairing process');
        await this.startPairingProcess(accessToken);
      }

      this.logger.info(
        'Signer is ' +
          (apiSigner?.pairingStatus === 'Paired'
            ? 'Paired'
            : 'WaitingForApproval'),
      );

      this.logger.info('ApproverService init completed');
    } catch (error) {
      this.logger.error(
        `InitApprover init failed. error: ${this.utilsService.errorToString(
          error,
        )}`,
      );
      this.logger.error('approver is exiting....');
      process.kill(process.pid, 'SIGTERM');
    }
  }

  private async getApiSignerState(
    accessToken: string,
  ): Promise<{ pairingStatus: string }> {
    const getApiSignerRequest = {
      query: `query ApiSigner {\r\n  apiSigner {\r\n    signatureKey,\r\n    pairingStatus,\r\n    id\r\n  }\r\n}`,
    };
    let apiSigner;
    try {
      apiSigner = (
        await this.utilsService.sendRequestToInabit<getApiSignerStateResponse>(
          getApiSignerRequest,
          accessToken,
        )
      )?.data?.apiSigner;
    } catch (error) {
      this.logger.error(
        `getApiSignerState error: ${this.utilsService.errorToString(error)}`,
      );
      throw error;
    }
    return apiSigner;
  }

  private async login(): Promise<string> {
    const email = this.configService.getOrThrow('SIGNER_USERNAME');
    const password = this.configService.getOrThrow('SIGNER_PASSWORD');
    let accessToken: string;
    const loginRequest = {
      query: `mutation Login($credentials: Credentials!) {\r\n  login(credentials: $credentials) {\r\n    accessToken\r\n  }\r\n}`,
      variables: {
        credentials: {
          email,
          isApi: true,
          password,
        },
      },
    };

    try {
      accessToken = (
        await this.utilsService.sendRequestToInabit<loginResponse>(
          loginRequest,
          '',
        )
      )?.data?.login?.accessToken;
    } catch (error) {
      this.logger.error(
        `login error: ${this.utilsService.errorToString(error)}`,
      );
      throw error;
    }
    return accessToken;
  }

  private async startPairingProcess(accessToken: string): Promise<void> {
    this.logger.info('Getting a signature key');
    const signatureKey = await this.keysService.getOrCreateSignatureKey();

    this.logger.info('Getting a pairing token');
    const pairingToken = await this.getPairingToken(accessToken);

    this.logger.info('Sending pairing data');
    await this.sendPairingData(signatureKey, pairingToken);
  }

  private async sendPairingData(
    signatureKey: string,
    pairingToken: string,
  ): Promise<boolean> {
    const approverDomain = this.configService.getOrThrow('APPROVER_URL');
    let pairingResult;
    const pairRemoteDeviceRequest = {
      query: `mutation PairRemoteDevice($fcmToken: String!, $signatureKey: String!) {\r\n  pairRemoteDevice(fcmToken: $fcmToken, signatureKey: $signatureKey)\r\n}`,
      variables: {
        fcmToken: approverDomain,
        signatureKey,
      },
    };
    try {
      pairingResult =
        await this.utilsService.sendRequestToInabit<sendPairingDataResponse>(
          pairRemoteDeviceRequest,
          pairingToken,
        );
      if (!pairingResult?.data?.pairRemoteDevice) {
        const error =
          pairingResult?.errors?.at(0)?.extensions?.message ??
          'sendPairingData error: failed pairing approver';
        this.logger.error(error);
        throw pairingResult?.errors?.at(0) ?? new Error(error);
      }
    } catch (error) {
      this.logger.error(
        `sendPairingData error: ${this.utilsService.errorToString(error)}`,
      );
      throw error;
    }
    return pairingResult?.data?.pairRemoteDevice;
  }

  private async getPairingToken(accessToken: string): Promise<string> {
    let pairingToken;
    const getPairingTokenRequest = {
      query: `mutation GetPairingTokenForApiSinger {\r\n  getPairingTokenForApiSinger {\r\n    accessToken\r\n    email\r\n  }\r\n}`,
    };
    try {
      pairingToken = (
        await this.utilsService.sendRequestToInabit<getPairingTokenResponse>(
          getPairingTokenRequest,
          accessToken,
        )
      )?.data?.getPairingTokenForApiSinger?.accessToken;
    } catch (error) {
      this.logger.error(
        `getPairingToken error: ${this.utilsService.errorToString(error)}`,
      );
      throw error;
    }
    return pairingToken;
  }
}
