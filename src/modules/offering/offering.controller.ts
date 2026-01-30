import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OfferingService } from './offering.service';
import { CreateOfferingDto } from './dto/create-offering.dto';
import { UpdateOfferingDto } from './dto/update-offering.dto';
import { OfferingResponseDto } from './dto/offering-response.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('offering')
@UseGuards(AuthGuard)
export class OfferingController {
  constructor(private readonly offeringService: OfferingService) {}

  @Post()
  async create(@Body() data: CreateOfferingDto): Promise<OfferingResponseDto> {
    return this.offeringService.create(data);
  }

  @Get()
  async findMany(): Promise<OfferingResponseDto[]> {
    return this.offeringService.findMany();
  }

  @Get(':id')
  async findUnique(@Param('id') id: string): Promise<OfferingResponseDto> {
    return this.offeringService.findUnique(Number(id));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: UpdateOfferingDto,
  ): Promise<OfferingResponseDto> {
    return this.offeringService.update(Number(id), data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<object> {
    return this.offeringService.delete(Number(id));
  }
}
