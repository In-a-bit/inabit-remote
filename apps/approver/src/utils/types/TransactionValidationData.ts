export type TransactionValidationData = {
  createTime: string;
  transactionId: string;
  transactionType: string;
  initiatorId: string;
  organizationId: string;
  network: string;
  walletId: string;
  walletAddress: string;
  to: string;
  coin: string;
  amount: number;
  baseCurrencyCode: string;
  baseCurrencyAmount: number;
};
