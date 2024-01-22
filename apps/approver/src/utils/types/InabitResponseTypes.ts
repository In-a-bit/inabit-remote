export type loginResponse = {
  data: {
    login: {
      accessToken: string;
    };
  };
};

export type getApiSignerStateResponse = {
  data: {
    apiSigner: {
      pairingStatus: string;
    };
  };
};

export type sendPairingDataResponse = {
  errors: any;
  data: {
    pairRemoteDevice: boolean;
  };
};

export type getPairingTokenResponse = {
  data: {
    getPairingTokenForApiSinger: {
      accessToken: string;
    };
  };
};
