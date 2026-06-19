export class UserResponseDto {
  id: number;
  name: string;
  email: string;
  phone: string;
  workerId: number | null;
  createdAt: Date;
  updatedAt: Date;
}
