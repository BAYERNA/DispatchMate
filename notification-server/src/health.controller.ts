import { Controller, Get, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Controller('health')
@UseGuards(JwtAuthGuard)
export class HealthController {
  constructor(private readonly db: DataSource) {}
  @Get()
  async health() {
    await this.db.query('SELECT 1');
    return { status: 'UP' };
  }
}
