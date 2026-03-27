import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async login(loginDto: LoginDto) {
    this.verifyCaptcha(loginDto.captcha);

    const adminUsername = this.configService.get<string>("ADMIN_USERNAME", "admin");
    const adminPassword = this.configService.get<string>("ADMIN_PASSWORD", "Admin@123");

    if (loginDto.username !== adminUsername || loginDto.password !== adminPassword) {
      throw new UnauthorizedException("Invalid username or password");
    }

    const payload = {
      sub: 1,
      username: adminUsername,
      role: "admin"
    };
    const token = await this.jwtService.signAsync(payload);

    return {
      token,
      user: {
        id: "1",
        username: adminUsername,
        role: "admin"
      }
    };
  }

  private verifyCaptcha(captcha: string): void {
    const expected = this.configService.get<string>("ADMIN_LOGIN_CAPTCHA", "1234");
    if (captcha !== expected) {
      throw new UnauthorizedException("Invalid captcha");
    }
  }
}
