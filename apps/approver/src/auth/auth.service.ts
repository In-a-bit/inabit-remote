import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { UtilsService } from '../utils/utils.service';
import {
  GetApiSignerStateResponse,
  GetPairingTokenResponse,
  SendPairingDataResponse,
  getApiUserAccessTokenResponse,
} from '../utils/types/InabitResponseTypes';
import { EnumApproverPairingStatus } from '../utils/enums/EnumApproverPairingStatus';
import { RefreshTokenService } from '../refresh-token/refresh-token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly utilsService: UtilsService,
    private readonly refreshTokenService: RefreshTokenService,
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
    let accessToken: string;
    try {
      const loginToken: string = await this.refreshTokenService.getLoginToken();
      const GetApiUserAccessTokenRequest = {
        query: `query GetApiUserAccessToken {\r\n  getApiUserAccessToken\r\n}`,
        variables: {},
      };

      accessToken = (
        await this.utilsService.sendRequestToInabit<getApiUserAccessTokenResponse>(
          GetApiUserAccessTokenRequest,
          loginToken,
        )
      )?.data?.getApiUserAccessToken;
    } catch (error) {
      this.logger.error(
        `login error: ${this.utilsService.errorToString(error)}`,
      );
      throw error;
    }
    return accessToken;
  }

  getPairingRequestData(): string {
    const isManaged = this.configService.get('IS_MANAGED');
    const data: {
      creator: {
        email: string;
        organizationName: string;
      };
      isManaged?: boolean;
    } = {
      creator: {
        email: this.configService.getOrThrow('APPROVER_CREATOR_EMAIL'),
        organizationName: this.configService.getOrThrow('ORGANIZATION_NAME'),
      },
    };
    if (isManaged === 'true') {
      this.logger.info(
        'Pairing is managed, adding isManaged flag to pairing request',
      );
      data.isManaged = true;
    }
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
    if (!pairingToken) {
      throw new Error('getPairingToken error: failed to get pairing token');
    }
    return pairingToken;
  }
}
