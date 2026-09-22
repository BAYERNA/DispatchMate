import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from '../alerts/entities/alert.entity';
import { OrganizationScopeModule } from '../common/organization-scope/organization-scope.module';
import { AssuranceController } from './assurance.controller';
import { AssuranceService } from './assurance.service';

@Module({imports:[TypeOrmModule.forFeature([Alert]),OrganizationScopeModule],controllers:[AssuranceController],providers:[AssuranceService],exports:[AssuranceService]})
export class AssuranceModule {}
