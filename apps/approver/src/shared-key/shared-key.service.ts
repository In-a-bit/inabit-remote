import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import * as cs from 'crypto-js';
import * as openpgp from 'openpgp';
import { UtilsService } from '../utils/utils.service';
import { GetSharedKeyApiSignerResponse } from '../utils/types/InabitResponseTypes';

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
  async decryptAndSaveSharedKey(encryptedSharedKey: string) {
    try {
      console.log(
        '[decryptAndSaveSharedKey] Received encrypted shared key:',
        encryptedSharedKey,
      );

      const decryptedSharedKey = await this.decryptReceivedSharedKey(
        encryptedSharedKey,
      );

      console.log(
          '[decryptAndSaveSharedKey] Received decrypted shared key:',
          decryptedSharedKey,
      );

      console.log(
          '[decryptAndSaveSharedKey] Received encrypted shared key:',
          encryptedSharedKey,
      );


      if (decryptedSharedKey) {
        return await this.saveSharedKey(decryptedSharedKey);
      }
    } catch (error) {
      this.logger.error(
        `[decryptAndSaveSharedKey] error: ${this.utilsService.errorToString(error)}`,
      );
    }
    return false;
  }

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
