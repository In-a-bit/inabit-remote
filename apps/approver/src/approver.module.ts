import { Module } from '@nestjs/common';
import { ApproverController } from './approver.controller';
import { ApproverService } from './approver.service';
import { InitiationModule } from './initiation/initiation.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { UtilsModule } from './utils/utils.module';
import { KeysModule } from './keys/keys.module';
import { AuthModule } from './auth/auth.module';
import * as winston from 'winston';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WinstonModule.forRootAsync({
      useFactory: (configService) => ({
        level: configService.get('LOGGER_LEVEL', 'info'),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.splat(),
          winston.format.errors({ stack: true }),
          winston.format.metadata(),
        ),
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.prettyPrint(),
            ),
          }),
        ],
      }),
      inject: [ConfigService],
      imports: [ConfigModule],
    }),
    InitiationModule,
    UtilsModule,
    KeysModule,
    AuthModule,
  ],
  controllers: [ApproverController],
  providers: [ApproverService],
})
export class ApproverModule {}
