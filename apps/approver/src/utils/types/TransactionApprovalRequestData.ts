export type TransactionApprovalRequestData = {
  createTime: string;
  initiatorName: string;
  initiatorId: string;
  transactionId: string;
  transactionType: string;
  organizationName: string;
  organizationId: string;
  policyRuleId: string;
  walletId: string;
  walletAddress: string;
  network: string;
  coin: string;
  to: string;
  amount: number;
  baseCurrencyCode: string;
  baseCurrencyRate: string;
  baseCurrencyAmount: number;
};
