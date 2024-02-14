export type LoginResponse = {
  data: {
    login: {
      accessToken: string;
    };
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
