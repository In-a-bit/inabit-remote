import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { UtilsService } from '../utils/utils.service';
import {
  GetApiSignerStateResponse,
  GetPairingTokenResponse,
  LoginResponse,
  SendPairingDataResponse,
} from '../utils/types/InabitResponseTypes';
import { EnumApproverPairingStatus } from '../utils/enums/EnumApproverPairingStatus';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly utilsService: UtilsService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  pairingNeeded(apiSigner: { pairingStatus: string }): boolean {
    return ![
      EnumApproverPairingStatus.WaitingForApproval.valueOf(),
      EnumApproverPairingStatus.Paired.valueOf(),
    ].includes(apiSigner?.pairingStatus);
  }

  async getApiSignerState(
    accessToken: string,
  ): Promise<{ pairingStatus: string }> {
    const getApiSignerRequest = {
      query: `query ApiSigner {\r\n  apiSigner {\r\n    signatureKey,\r\n    pairingStatus,\r\n    id\r\n  }\r\n}`,
    };
    let apiSigner;
    try {
      apiSigner = (
        await this.utilsService.sendRequestToInabit<GetApiSignerStateResponse>(
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

  async login(): Promise<string> {
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
        await this.utilsService.sendRequestToInabit<LoginResponse>(
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

  getPairingRequestData(): string {
    const data = {
      creator: {
        email: this.configService.getOrThrow('APPROVER_CREATOR_EMAIL'),
      },
    };
    return JSON.stringify(data);
  }

  async sendPairingData(
    signatureKey: string,
    pairingToken: string,
  ): Promise<boolean> {
    const approverDomain: string =
      this.configService.getOrThrow('APPROVER_URL');
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
        await this.utilsService.sendRequestToInabit<SendPairingDataResponse>(
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

  async getPairingToken(accessToken: string): Promise<string> {
    let pairingToken;
    const getPairingTokenRequest = {
      query: `mutation GetPairingTokenForApiSinger {\r\n  getPairingTokenForApiSinger {\r\n    accessToken\r\n    email\r\n  }\r\n}`,
    };
    try {
      pairingToken = (
        await this.utilsService.sendRequestToInabit<GetPairingTokenResponse>(
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
