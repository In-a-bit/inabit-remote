import { Injectable } from '@nestjs/common';
const jwt = require('jsonwebtoken');
import { Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  createHmac,
  randomBytes,
} from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import * as cs from 'crypto-js';

@Injectable()
export class KeysService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.logger.info('KeysService initialized');
  }

  async getSignedPairingData(message: string, mac: string): Promise<string> {
    const key = await this.getOrCreateApproverKey();
    const signatureKey = await this.signPairingData(key, message, mac);
    this.logger.info(`signature key : ${signatureKey}`);
    return signatureKey;
  }

  async getSignedTransactionData(message: string): Promise<string | undefined> {
    const key = await this.getApproverKey();
    if (key) {
      const signedTransactionApproval = await this.signTransactionApproval(
        key,
        message,
      );
      this.logger.info(`transaction approval : ${signedTransactionApproval}`);
      return signedTransactionApproval;
    }
    return undefined;
  }

  private async getOrCreateApproverKey(): Promise<string> {
    const key = await this.getApproverKey();
    return key ?? (await this.createApproverKey());
  }

  private async getApproverKey(): Promise<string | undefined> {
    const keyFilePath = await this.getKeyFilePath();
    if (fs.existsSync(keyFilePath)) {
      const password = this.configService.getOrThrow('SECRET');
      const encryptedKeys = fs.readFileSync(keyFilePath).toString();
      const key = cs.AES.decrypt(encryptedKeys, password).toString(cs.enc.Utf8);
      return key;
    } else return undefined;
  }

  private async createApproverKey() {
    const keyFilePath = await this.getKeyFilePath();
    const password = this.configService.getOrThrow('SECRET');
    const key = await this.generateKey();
    const encryptedKeys = cs.AES.encrypt(key, password).toString();
    const fileName = this.configService.get('FILE_NAME', 'k.dat');
    fs.mkdirSync(keyFilePath.replace(`/${fileName}`, ''), {
      recursive: true,
    });
    fs.writeFileSync(keyFilePath, encryptedKeys.toString());
    return key;
  }

  private async getKeyFilePath() {
    const filePath = this.configService.get('FILE_PATH', 'dat');
    const fileName = this.configService.get('FILE_NAME', 'k.dat');
    const appRootPath = await path.resolve('./');
    const keyFilePath = `${appRootPath}/${filePath}/${fileName}`;
    return keyFilePath;
  }

  async generateKey(): Promise<string> {
    const keyPair = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });

    const pemFormattedPrivateECKey = keyPair.privateKey
      .export({ format: 'pem', type: 'sec1' })
      .toString();

    const publicKey = createPublicKey(keyPair.privateKey);
    const jwk = publicKey.export({ format: 'jwk' });
    jwk.kid = this.getKid(jwk);
    this.logger.info(jwk);

    return JSON.stringify({ privateKey: pemFormattedPrivateECKey, jwk });
  }

  async signJWT(privateKey: string, payload: string): Promise<string> {
    const pubKey = createPublicKey(privateKey);
    const jwk = pubKey.export({ format: 'jwk' });
    jwk.kid = this.getKid(jwk);
    const dataToSign = JSON.parse(payload);
    return jwt.sign(dataToSign, privateKey, {
      header: { alg: 'ES256', typ: 'JWT', jwk },
    });
  }

  async signPairingData(
    key: string,
    message: string,
    mac: string,
  ): Promise<string> {
    const keyObject = JSON.parse(key);
    const signatureKey = await this.signJWT(
      keyObject?.privateKey,
      JSON.stringify({
        verify_key: { jwk: keyObject?.jwk },
        message,
        mac,
      }),
    );
    return signatureKey;
  }

  async signTransactionApproval(key: string, message: string): Promise<string> {
    const keyObject = JSON.parse(key);
    const transactionApproval = await this.signJWT(
      keyObject?.privateKey,
      message,
    );
    return transactionApproval;
  }

  getKid(jwk: JsonWebKey): string {
    const jwkString = JSON.stringify(jwk);
    const kid = createHash('sha256').update(jwkString).digest('base64');
    return kid;
  }

  async getPairingCode(): Promise<any> {
    return randomBytes(32).toString('hex');
  }

  async getHashedPairingData(
    message: string,
    pairingCode: string,
  ): Promise<string> {
    return createHmac('sha256', pairingCode).update(message).digest('hex');
  }
}
