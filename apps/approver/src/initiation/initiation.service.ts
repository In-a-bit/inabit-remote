import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { UtilsService } from '../utils/utils.service';
import { KeysService } from '../keys/keys.service';
import { EnumApproverPairingStatus } from '../utils/enums/EnumApproverPairingStatus';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class InitiationService {
  constructor(
    private readonly utilsService: UtilsService,
    private readonly keysService: KeysService,
    private readonly authService: AuthService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async initApprover() {
    try {
      this.logger.info('Init Approver started');
      const accessToken = await this.authService.login();

      this.logger.info('Checking if Approver is paired already.');
      const apiSigner = await this.authService.getApiSignerState(accessToken);

      if (!apiSigner) {
        throw new Error('Approver is not registered, contact support.');
      }

      if (this.authService.pairingNeeded(apiSigner)) {
        this.logger.info(
          'Approver needs to be paired, starts a pairing process...',
        );
        await this.startPairingProcess(accessToken);
      }

      const isPaired =
        apiSigner?.pairingStatus === EnumApproverPairingStatus.Paired;
      this.logger.info(
        'Approver is ' +
          (isPaired
            ? EnumApproverPairingStatus.Paired
            : 'waiting for approval'),
      );

      this.logger.info(
        `Init Approver completed${
          isPaired ? '.' : ', waiting for pairing process completion.'
        }`,
      );
    } catch (error) {
      this.logger.error(
        `Init Approver failed. error: ${this.utilsService.errorToString(
          error,
        )}`,
      );
      this.logger.error('Approver shuts down.');
      process.kill(process.pid, 'SIGTERM');
    }
  }

  private async startPairingProcess(accessToken: string): Promise<void> {
    this.logger.info('Getting a pairing token.');
    const pairingToken = await this.authService.getPairingToken(accessToken);

    this.logger.info('Getting a pairing code');
    const pairingCode = await this.keysService.getPairingCode();
    this.logger.info(`Pairing code: ${pairingCode}`);
    const message = this.authService.getPairingRequestData();
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
    await this.authService.sendPairingData(signatureKey, pairingToken);
  }
}
