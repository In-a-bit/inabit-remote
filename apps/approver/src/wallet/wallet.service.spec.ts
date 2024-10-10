import { Test, TestingModule } from '@nestjs/testing';
import { WalletKeysService } from './wallet.service';

describe('WalletService', () => {
  let service: WalletKeysService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WalletKeysService],
    }).compile();

    service = module.get<WalletKeysService>(WalletKeysService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
