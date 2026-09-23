import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incident } from '../../alerts/entities/incident.entity';
import { OrganizationScopeService } from './organization-scope.service';

@Module({
  imports: [TypeOrmModule.forFeature([Incident])],
  providers: [OrganizationScopeService],
  exports: [OrganizationScopeService],
})
export class OrganizationScopeModule {}
