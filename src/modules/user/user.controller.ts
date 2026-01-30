import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async create(@Body() data: CreateUserDto): Promise<UserResponseDto> {
    return this.userService.create(data);
  }

  @UseGuards(AuthGuard)
  @Get()
  async findMany(): Promise<UserResponseDto[]> {
    return this.userService.findMany();
  }

  @UseGuards(AuthGuard)
  @Get(':id')
  async findUnique(@Param('id') id: string): Promise<UserResponseDto> {
    return this.userService.findUnique(Number(id));
  }

  @UseGuards(AuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: UpdateUserDto): Promise<UserResponseDto> {
    return this.userService.update(Number(id), data);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string): Promise<object> {
    return this.userService.delete(Number(id));
  }
}
