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

  private async getOrCreateApproverKey(): Promise<string> {
    const filePath = this.configService.get('FILE_PATH', 'dat');
    const fileName = this.configService.get('FILE_NAME', 'k.dat');
    const password = this.configService.getOrThrow('SECRET');
    const appRootPath = await path.resolve('./');
    const keysPath = `${appRootPath}/${filePath}/${fileName}`;
    if (fs.existsSync(keysPath)) {
      const encryptedKeys = fs.readFileSync(keysPath).toString();
      const key = cs.AES.decrypt(encryptedKeys, password).toString(cs.enc.Utf8);
      return key;
    } else {
      const key = await this.generateKey();
      const encryptedKeys = cs.AES.encrypt(key, password).toString();
      fs.mkdirSync(keysPath.replace(`/${fileName}`, ''), { recursive: true });
      fs.writeFileSync(keysPath, encryptedKeys.toString());
      return key;
    }
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
