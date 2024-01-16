import { Controller, Get } from '@nestjs/common';
import { ApproverService } from './approver.service';

@Controller()
export class ApproverController {
  constructor(private readonly approverService: ApproverService) {}

  @Get()
  getHello(): string {
    return this.approverService.getHello();
  }
}
