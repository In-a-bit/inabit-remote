import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import * as cs from 'crypto-js';
import * as crypto from 'crypto';
import * as openpgp from 'openpgp';
import * as argon2 from '@node-rs/argon2';
import { UtilsService } from '../utils/utils.service';
import {
  GetEnclaveKeysDataResponse,
  GetSharedKeyApiSignerResponse,
  SetSharedKeyApiSignerResponse,
} from '../utils/types/InabitResponseTypes';
import { EncryptedSharedKeyMessage } from '../utils/types/EncryptedSharedKeyMessage';
const jwt = require('jsonwebtoken');
const jwkToPem = require('jwk-to-pem');

@Injectable()
export class SharedKeyService {
  constructor(
    private readonly configService: ConfigService,
    private readonly utilsService: UtilsService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}
  async onModuleInit() {
    this.logger.info('SharedKeyService initialized');
  }

  // Shared Key Methods:
  async getSharedKeyApiSignerRequest(
    encryptingPublicKey: string,
    accessToken: string,
  ): Promise<{ success: boolean }> {
    const getSharedKeyApiSignerRequest = {
      query: `query getSharedKeyApiSigner($encryptingPublicKey: String!) {\r\n  getSharedKeyApiSigner(encryptingPublicKey: $encryptingPublicKey) {\r\n  success  \r\n  }\r\n}`,
      variables: {
        encryptingPublicKey,
      },
    };
    let result: GetSharedKeyApiSignerResponse = { success: false };
    try {
      result =
        await this.utilsService.sendRequestToInabit<GetSharedKeyApiSignerResponse>(
          getSharedKeyApiSignerRequest,
          accessToken,
        );
    } catch (error) {
      this.logger.error(
        `[getSharedKeyApiSignerRequest] error: ${this.utilsService.errorToString(
          error,
        )}`,
      );
    }
    return result;
  }

  async decryptAndSaveSharedKey(encryptedSharedKey: string) {
    try {
      this.logger.info(
        '[decryptAndSaveSharedKey] Received encrypted shared key:',
        encryptedSharedKey,
      );

      const decryptedSharedKey = await this.decryptReceivedSharedKey(
        encryptedSharedKey,
      );

      if (decryptedSharedKey) {
        return await this.saveSharedKey(decryptedSharedKey);
      }
    } catch (error) {
      this.logger.error(
        `[decryptAndSaveSharedKey] error: ${this.utilsService.errorToString(
          error,
        )}`,
      );
    }
    return false;
  }

  async decryptReceivedSharedKey(
    encryptedSharedKey: string,
  ): Promise<string | undefined> {
    const encryptedSharedKeyUint8Array = new Uint8Array(
      JSON.parse(encryptedSharedKey),
    );

    const privateKey = await this.getPrivateEncryptionKey();
    if (!privateKey) {
      this.logger.error(
        `[decryptReceivedSharedKey] failed, private encryption key not found`,
      );
      return undefined;
    }

    const privateKeyObject = await openpgp.readPrivateKey({
      armoredKey: privateKey,
    });

    const decryptedPrivateKey = await openpgp.decryptKey({
      privateKey: privateKeyObject,
      passphrase: this.configService.getOrThrow('ENCRYPTION_KEYS_PASSPHRASE'),
    });

    const encryptedSharedKeydMessage = await openpgp.readMessage({
      binaryMessage: encryptedSharedKeyUint8Array,
    });

    const { data: decrypted } = await openpgp.decrypt({
      message: encryptedSharedKeydMessage,
      decryptionKeys: decryptedPrivateKey,
      format: 'binary',
    });

    const decryptedBase64 = Buffer.from(decrypted as Uint8Array).toString(
      'base64',
    );

    this.logger.info('[decryptReceivedSharedKey] successfully decrypted sk.');
    return decryptedBase64;
  }

  private async saveSharedKey(sharedKey: string) {
    const password = this.configService.getOrThrow('SECRET');
    const encryptedSharedKey = cs.AES.encrypt(sharedKey, password).toString();

    const sharedKeyFilePath = await this.getSharedKeyFilePath();
    const sharedKeyFileName = this.getSharedKeyFileName();

    if (!fs.existsSync(sharedKeyFilePath)) {
      fs.mkdirSync(sharedKeyFilePath.replace(`/${sharedKeyFileName}`, ''), {
        recursive: true,
      });
    }

    fs.writeFileSync(sharedKeyFilePath, encryptedSharedKey);
    this.logger.info(
      `[saveSharedKey] Shared key saved to ${sharedKeyFilePath}`,
    );
    return true;
  }

  async setSharedKey(
    accessToken: string,
    signedEncryptedSharedKeyMessage: string,
  ): Promise<{ success: boolean }> {
    let result: SetSharedKeyApiSignerResponse = { success: false };
    try {
      const setSharedKeyApiSignerRequest = {
        query: `mutation SetSharedKeyApiSigner($jwtToken: String!) {\r\n  setSharedKeyApiSigner(jwtToken: $jwtToken) {\r\n    success\r\n  }\r\n}`,
        variables: {
          jwtToken: signedEncryptedSharedKeyMessage,
        },
      };
      result =
        await this.utilsService.sendRequestToInabit<SetSharedKeyApiSignerResponse>(
          setSharedKeyApiSignerRequest,
          accessToken,
        );
    } catch (error) {
      this.logger.error(
        `[sendSharedKey] error: ${this.utilsService.errorToString(error)}`,
      );
    }
    return result;
  }

  async getEncryptedSharedKeyMessage(
    accessToken: string,
  ): Promise<EncryptedSharedKeyMessage> {
    const sharedKey = await this.getSharedKey();
    if (!sharedKey) {
      this.logger.error(
        '[getEncryptedSharedKeyMessage] Shared key is null or undefined.',
      );
      return undefined;
    }

    const enclaveKeys: GetEnclaveKeysDataResponse =
      await this.getEnclaveKeysRequest(accessToken);
    if (!enclaveKeys || !(await this.validateEnclaveKeys(enclaveKeys))) {
      return undefined;
    }
    const encryptedSharedKey = await this.encryptSharedKey(
      sharedKey,
      enclaveKeys.data.enclaveKeys.enclavePublicKey,
    );

    const sharedKeyHash = await this.getHashedSharedKey(sharedKey);

    return {
      esk: encryptedSharedKey,
      isRepairMode: false,
      sharedKeyHash,
    };
  }

  async getEnclaveKeysRequest(
    accessToken: string,
  ): Promise<GetEnclaveKeysDataResponse> {
    const getEnclaveKeysRequest = {
      query: `query enclaveKeys {\r\n  enclaveKeys {\r\n    enclavePublicKey\r\n    googleJwtToken\r\n  }\r\n}`,
      variables: {},
    };
    let result: GetEnclaveKeysDataResponse = null;
    try {
      result =
        await this.utilsService.sendRequestToInabit<GetEnclaveKeysDataResponse>(
          getEnclaveKeysRequest,
          accessToken,
        );
    } catch (error) {
      this.logger.error(
        `[getEnclaveKeysRequest] error: ${this.utilsService.errorToString(
          error,
        )}`,
      );
    }
    return result;
  }

  private async encryptSharedKey(
    sharedKey: string,
    encryptingPublicKey: string,
  ): Promise<string> {
    const openpgpKey = await openpgp.readKey({
      armoredKey: encryptingPublicKey,
    });

    const encryptedSharedKey = await openpgp.encrypt({
      message: await openpgp.createMessage({
        binary: Buffer.from(sharedKey),
      }),
      encryptionKeys: openpgpKey,
      format: 'binary',
    });

    const encryptedSharedKeyBase64 = Buffer.from(
      encryptedSharedKey as Uint8Array,
    ).toString('base64');

    return encryptedSharedKeyBase64;
  }

  private async getSharedKey(): Promise<string | undefined> {
    const sharedKeyFilePath = await this.getSharedKeyFilePath();
    if (fs.existsSync(sharedKeyFilePath)) {
      const password = this.configService.getOrThrow('SECRET');
      const encryptedSharedKey = fs.readFileSync(sharedKeyFilePath).toString();
      const sharedKey = cs.AES.decrypt(encryptedSharedKey, password).toString(
        cs.enc.Utf8,
      );
      return sharedKey;
    } else return undefined;
  }

  private async getSharedKeyFilePath(): Promise<string> {
    const filePath = this.configService.get('SHARED_KEY_FILE_PATH', 'sk');
    const fileName = this.getSharedKeyFileName();
    const appRootPath = await path.resolve('./');
    const sharedKeyFilePath = `${appRootPath}/${filePath}/${fileName}`;
    return sharedKeyFilePath;
  }

  getSharedKeyFileName(): string {
    return this.configService.get('SHARED_KEY_FILE_NAME', 'sk.dat');
  }

  async sharedKeyExists(): Promise<boolean> {
    return fs.existsSync(await this.getSharedKeyFilePath());
  }

  async getHashedSharedKey(sharedKey: string): Promise<string> {
    // Configuration parameters for Argon2id
    const options = {
      type: argon2.Algorithm.Argon2id,
      memoryCost: 10 * 1000, // 10 MB
      parallelism: 2, // Use maximum two CPU cores
      timeCost: 1, // Increase memoryCost for more security
      hashLength: 32, // Number of bytes in the returned hash
    };

    // Password for key derivation
    const SHARED_KEY_HASH_PASSWORD = '1eec0e49-27f5-6940-8f34-dfbdf0c72685';

    // Derive the hash using Argon2id
    const hash = await argon2.hash(SHARED_KEY_HASH_PASSWORD, {
      salt: Buffer.from(Buffer.from(sharedKey).toString('base64'), 'base64'), // Use the key as the salt
      ...options,
    });

    return hash.split('$').pop() ?? '';
  }

  private async validateEnclaveKeys(enclaveKeys: {
    data: { enclaveKeys: { enclavePublicKey: string; googleJwtToken: string } };
  }) {
    if (!enclaveKeys?.data?.enclaveKeys?.enclavePublicKey) {
      this.logger.error(
        '[getEncryptedSharedKeyMessage] Enclave public key is null or undefined.',
      );
      return false;
    }
    if (!enclaveKeys?.data?.enclaveKeys?.googleJwtToken) {
      this.logger.error(
        '[getEncryptedSharedKeyMessage] Google JWT token is null or undefined.',
      );
      return false;
    }

    const enclavePublicSha256FromGoogleJwt =
      await this.getEnclavePublicSha256FromGoogleJwt(
        enclaveKeys?.data.enclaveKeys.googleJwtToken,
      );
    if (!enclavePublicSha256FromGoogleJwt) {
      this.logger.error(
        '[validateEnclaveKeys] failed to get enclavePublicSha256FromGoogleJwt.',
      );
      return false;
    }

    const enclavePublicSha256 = this.deriveEnclavePublicSha256(
      enclaveKeys.data.enclaveKeys.enclavePublicKey,
    );

    if (enclavePublicSha256FromGoogleJwt !== enclavePublicSha256) {
      this.logger.error(
        `[validateEnclaveKeys] Enclave public key is not valid, mismatch. ${enclavePublicSha256FromGoogleJwt} !== ${enclavePublicSha256}`,
      );
      return false;
    }
    return true;
  }

  private deriveEnclavePublicSha256(enclavePublicKey: string) {
    const normalizedString = enclavePublicKey.replace(/\r\n/g, '\n');
    const enclavePublicSha256 = crypto
      .createHash('sha256')
      .update(normalizedString)
      .digest('hex');
    return enclavePublicSha256;
  }

  async getEnclavePublicSha256FromGoogleJwt(
    googleJwt: string,
  ): Promise<string | null> {
    try {
      const decoded = jwt.decode(googleJwt, { complete: true });
      const kid = decoded.header.kid;

      // Fetch Google certificates
      const googleKeysResponse = await this.utilsService.httpClient(
        'https://www.googleapis.com/oauth2/v3/certs',
        'get',
      );
      const googleKeys = googleKeysResponse.keys;

      let enclavePublicSha256;
      googleKeys.forEach((entry: { kid: any; kty: string }) => {
        if (entry.kid === kid && entry.kty === 'RSA') {
          const googleJwk = entry;
          const pem = jwkToPem(googleJwk);
          jwt.verify(
            googleJwt,
            pem,
            {
              algorithms: ['RS256'],
              ignoreExpiration: this.configService.get(
                'SKIP_JWT_EXPIRY_VERIFICATION',
                true, // Skip JWT expiry verification by default as in mobile app
              ),
            },
            (err: any, verifiedJwt: { aud: string }) => {
              if (err) {
                this.logger.error('Google JWT verification failed:', err);
              } else {
                enclavePublicSha256 = verifiedJwt.aud.replace(
                  this.configService.get<string>(
                    'GOOGLE_TOKEN_AUDIENCE_HOST',
                    'https://enclave.inabit.com/',
                  ) || '',
                  '',
                );
              }
            },
          );
        }
      });

      return enclavePublicSha256 ?? null;
    } catch (e) {
      this.logger.error('Error verifying Google JWT:', e);
      return null;
    }
  }

  // Encryption Keys Methods:
  private async getOrCreateEncryptionKeys(): Promise<{
    privateKey: string;
    publicKey: string;
  }> {
    const keys = await this.getEncryptionKeys();
    return keys ?? (await this.createEncryptionKeys());
  }

  private async createEncryptionKeys(): Promise<{
    privateKey: string;
    publicKey: string;
  }> {
    const encryptionKeys = await this.generateEncryptionKeys();
    const password = this.configService.getOrThrow('SECRET');
    const encryptedEncryptionKeys = cs.AES.encrypt(
      JSON.stringify(encryptionKeys),
      password,
    ).toString();
    const encryptionKeysFilePath = await this.getEncryptionKeysFilePath();
    const encryptionKeysFileName = this.getEncryptionKeysFileName();

    if (!fs.existsSync(encryptionKeysFilePath)) {
      fs.mkdirSync(
        encryptionKeysFilePath.replace(`/${encryptionKeysFileName}`, ''),
        {
          recursive: true,
        },
      );
    }

    fs.writeFileSync(encryptionKeysFilePath, encryptedEncryptionKeys);
    return encryptionKeys;
  }

  private async generateEncryptionKeys(): Promise<{
    privateKey: string;
    publicKey: string;
  }> {
    const encryptionKeys: {
      privateKey: string;
      publicKey: string;
    } = await openpgp.generateKey({
      curve: 'ed25519',
      userIDs: [{ name: 'Test User', email: 'test@example.com' }],
      passphrase: this.configService.getOrThrow('ENCRYPTION_KEYS_PASSPHRASE'),
    });

    this.logger.info(encryptionKeys.publicKey);
    return encryptionKeys;
  }

  private async getEncryptionKeys(): Promise<
    { privateKey: string; publicKey: string } | undefined
  > {
    const keyFilePath = await this.getEncryptionKeysFilePath();
    if (fs.existsSync(keyFilePath)) {
      const password = this.configService.getOrThrow('SECRET');
      const encryptedEncryptionKeys = fs.readFileSync(keyFilePath).toString();
      const encryptionKeys = cs.AES.decrypt(
        encryptedEncryptionKeys,
        password,
      ).toString(cs.enc.Utf8);
      return JSON.parse(encryptionKeys);
    } else return undefined;
  }

  async getPublicEncryptionKey(): Promise<string | undefined> {
    return (await this.getOrCreateEncryptionKeys())?.publicKey;
  }

  private async getPrivateEncryptionKey(): Promise<string | undefined> {
    return (await this.getEncryptionKeys())?.privateKey;
  }

  private async getEncryptionKeysFilePath(): Promise<string> {
    const filePath = this.configService.get('ENCRYPTION_KEYS_FILE_PATH', 'enc');
    const fileName = this.getEncryptionKeysFileName();
    const appRootPath = await path.resolve('./');
    const refreshFilePath = `${appRootPath}/${filePath}/${fileName}`;
    return refreshFilePath;
  }

  private getEncryptionKeysFileName() {
    return this.configService.get('ENCRYPTION_KEYS_FILE_NAME', 'enc.dat');
  }
}
