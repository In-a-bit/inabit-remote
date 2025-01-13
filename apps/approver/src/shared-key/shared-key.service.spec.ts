import { Test, TestingModule } from '@nestjs/testing';
import { SharedKeyService } from './shared-key.service';

describe('WalletService', () => {
  let service: SharedKeyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SharedKeyService],
    }).compile();

    service = module.get<SharedKeyService>(SharedKeyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
