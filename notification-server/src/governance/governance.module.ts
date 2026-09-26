import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from '../alerts/entities/alert.entity';
import { OrganizationScopeModule } from '../common/organization-scope/organization-scope.module';
import { GovernanceController, PublicStatusController } from './governance.controller';
import { GovernanceService } from './governance.service';

@Module({
  imports: [TypeOrmModule.forFeature([Alert]), OrganizationScopeModule],
  controllers: [GovernanceController, PublicStatusController],
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
