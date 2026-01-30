import { PartialType } from '@nestjs/mapped-types';
import { CreateUnavailablePeriodDto } from './create-unavailable-period.dto';

export class UpdateUnavailablePeriodDto extends PartialType(
  CreateUnavailablePeriodDto,
) {}
