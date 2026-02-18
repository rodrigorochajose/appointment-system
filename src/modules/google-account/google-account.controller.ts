import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { GoogleAccountService } from './google-account.service';
import { CreateGoogleAccountDto } from './dto/create-google-account.dto';
import { AuthGuard } from '../auth/auth.guard';
import { GoogleAccountResponseDto } from './dto/google-account-response.dto';

@Controller('google-account')
export class GoogleAccountController {
  constructor(private readonly googleAccountService: GoogleAccountService) {}

  @Post()
  create(@Body() data: CreateGoogleAccountDto): Promise<GoogleAccountResponseDto> {
    return this.googleAccountService.create(data);
  }

  @UseGuards(AuthGuard)
  @Get(':id')
  findUnique(@Param('id') id: string): Promise<GoogleAccountResponseDto> {
    return this.googleAccountService.findUnique(+id);
  }
}
