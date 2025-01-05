export type EncryptedSharedKeyMessage =
  | {
      esk: string;
      isRepairMode: boolean;
      sharedKeyHash: string;
    }
  | undefined;
