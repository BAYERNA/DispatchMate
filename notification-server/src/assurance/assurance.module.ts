import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from '../alerts/entities/alert.entity';
import { AssuranceController } from './assurance.controller';
import { AssuranceService } from './assurance.service';

@Module({imports:[TypeOrmModule.forFeature([Alert])],controllers:[AssuranceController],providers:[AssuranceService],exports:[AssuranceService]})
export class AssuranceModule {}
