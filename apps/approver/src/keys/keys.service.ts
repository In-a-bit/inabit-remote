import { Injectable } from '@nestjs/common';
const jwt = require('jsonwebtoken');
import { Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '@nestjs/config';
import { createHash, createPublicKey, generateKeyPairSync } from 'crypto';
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

  async getOrCreateSignatureKey() {
    let signatureKey;
    const filePath = this.configService.get('FILE_PATH', 'dat');
    const fileName = this.configService.get('FILE_NAME', 'k.dat');
    const password = this.configService.getOrThrow('SECRET');
    const appRootPath = await path.resolve('./');
    const keysPath = `${appRootPath}/${filePath}/${fileName}`;
    if (fs.existsSync(keysPath)) {
      const encryptedKeys = fs.readFileSync(keysPath).toString();
      const keys = cs.AES.decrypt(encryptedKeys, password).toString(
        cs.enc.Utf8,
      );
      signatureKey = await this.getSignatureKey(keys);
      this.logger.info(signatureKey);
    } else {
      const keys = await this.getKey();
      signatureKey = await this.getSignatureKey(keys);
      const encryptedKeys = cs.AES.encrypt(keys, password).toString();
      fs.mkdirSync(keysPath.replace(`/${fileName}`, ''), { recursive: true });
      fs.writeFileSync(keysPath, encryptedKeys.toString());
    }
    return signatureKey;
  }

  async getKey(): Promise<string> {
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

  async getSignatureKey(keys: string) {
    const keysObject = JSON.parse(keys);
    const signatureKey = await this.signJWT(
      keysObject?.privateKey,
      JSON.stringify({ verify_key: { jwk: keysObject?.jwk } }),
    );
    return signatureKey;
  }

  getKid(jwk: JsonWebKey) {
    const jwkString = JSON.stringify(jwk);
    const kid = createHash('sha256').update(jwkString).digest('base64');
    return kid;
  }
}
