export type getApiUserAccessTokenResponse = {
  data: {
    getApiUserAccessToken: string;
  };
};

export type refreshApiUserLoginTokenResponse = {
  data: {
    refreshApiUserLoginToken: string;
  };
};

export type GetApiSignerStateResponse = {
  data: {
    apiSigner: {
      pairingStatus: string;
    };
  };
};

export type SendPairingDataResponse = {
  errors: any;
  data: {
    pairRemoteDevice: boolean;
  };
};

export type GetPairingTokenResponse = {
  data: {
    getPairingTokenForApiSinger: {
      accessToken: string;
    };
  };
};

export type CreateSignedTransactionApprovalResponse = {
  data: {
    result: boolean;
  };
};

export type GetWalletKeysResponse = {
  data: {
    walletKeysApiSigner: {
      walletKeys: string;
    };
  };
};

export type GetSharedKeyApiSignerResponse = {
  success: boolean;
};

export type SetSharedKeyApiSignerResponse = {
  success: boolean;
};

export type GetEnclaveKeysDataResponse = {
  data: {
    enclaveKeys: {
      enclavePublicKey: string;
      googleJwtToken: string;
    };
  };
} | null;
