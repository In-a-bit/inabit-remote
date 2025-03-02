export type TransactionApprovalRequestData = {
  createTime: string;
  initiatorName: string;
  initiatorId: string;
  transactionId: string;
  transactionType: string;
  organizationName: string;
  organizationId: string;
  policyRuleId: string;
  walletIds: string[];
  walletAddresses: string[];
  network: string;
  coin: string;
  to: string;
  amount: number;
  baseCurrencyCode: string;
  baseCurrencyRate: string;
  baseCurrencyAmount: number;
  offrampDetails?: OfframpDetails;
};

type OfframpDetails = {
  provider: string;
  iban: string;
  accountNumber: string;
  fiatCurrency: string;
};
