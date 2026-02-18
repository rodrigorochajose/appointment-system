import { IsEmail, IsInt, IsString } from 'class-validator';

export class CreateGoogleAccountDto {
  @IsInt()
  workerId: number;

  @IsEmail()
  googleEmail: string;

  @IsString()
  googleCalendarId: string;

  @IsString()
  googleRefreshToken: string;
}
