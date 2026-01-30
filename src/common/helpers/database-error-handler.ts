import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

export function handleDatabaseError(error: any): never {
  console.error('Database Error:', error);

  // MySQL Error Codes
  if (error.code === 'ER_DUP_ENTRY') {
    throw new ConflictException('Duplicate entry for unique field(s).');
  }

  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    throw new BadRequestException('Referenced record does not exist.');
  }

  if (error.message?.includes('not found')) {
    throw new NotFoundException('Record not found.');
  }

  throw error;
}
