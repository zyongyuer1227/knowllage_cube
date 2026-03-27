import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { AuthRequest, JwtUserPayload } from "../auth/auth-request.interface";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      const payload = this.jwtService.verify<JwtUserPayload>(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }

  private extractBearerToken(authorization?: string): string | null {
    if (!authorization) {
      return null;
    }
    const [type, token] = authorization.split(" ");
    if (type !== "Bearer" || !token) {
      return null;
    }
    return token;
  }
}
