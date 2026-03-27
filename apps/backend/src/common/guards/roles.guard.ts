import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRequest } from "../auth/auth-request.interface";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const currentRole = request.user?.role;
    if (!currentRole || !requiredRoles.includes(currentRole)) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
