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
      this.logger.info('Init Approver started');
      const accessToken = await this.login();

      this.logger.info('Checking if Approver is paired already.');
      const apiSigner = await this.getApiSignerState(accessToken);

      if (!apiSigner)
        throw new Error('Approver is not registered, contact support.');

      if (this.pairingNeeded(apiSigner)) {
        this.logger.info(
          'Approver needs to be paired, starts a pairing process...',
        );
        await this.startPairingProcess(accessToken);
      }

      const isPaired = apiSigner?.pairingStatus === 'Paired';
      this.logger.info(
        'Approver is ' + (isPaired ? 'paired' : 'waiting for approval'),
      );

      this.logger.info(
        `Init Approver completed${
          isPaired ? '.' : ', waiting for pairing process completion.'
        }`,
      );
    } catch (error) {
      this.logger.error(
        `Init Approver failed. error: ${this.utilsService.errorToString(error)}`,
      );
      this.logger.error('Exiting....');
      process.kill(process.pid, 'SIGTERM');
    }
  }

  private pairingNeeded(apiSigner: { pairingStatus: string }) {
    return !['WaitingForApproval', 'Paired'].includes(apiSigner?.pairingStatus);
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
    this.logger.info('Getting a pairing token.');
    const pairingToken = await this.getPairingToken(accessToken);

    this.logger.info('Getting a pairing code');
    const pairingCode = await this.keysService.getPairingCode();
    this.logger.info(`Pairing code: ${pairingCode}`);
    const message = this.GetPairingRequestData();
    const mac = await this.keysService.getHashedPairingData(
      message,
      pairingCode,
    );

    this.logger.info('Getting a signature key');
    const signatureKey = await this.keysService.getSignedPairingData(
      message,
      mac,
    );

    this.logger.info('Sending pairing data');
    await this.sendPairingData(signatureKey, pairingToken);
  }

  private GetPairingRequestData() {
    const data = {
      creator: {
        email: this.configService.get(
          'APPROVER_CREATOR_EMAIL',
          'issuer@company.example',
        ),
      },
    };
    return JSON.stringify(data);
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
