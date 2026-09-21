import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from '../alerts/entities/alert.entity';
import { GovernanceController, PublicStatusController } from './governance.controller';
import { GovernanceService } from './governance.service';

@Module({
  imports: [TypeOrmModule.forFeature([Alert])],
  controllers: [GovernanceController, PublicStatusController],
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
