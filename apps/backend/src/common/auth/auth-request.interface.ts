export interface JwtUserPayload {
  sub: number;
  username: string;
  role: string;
}

export interface AuthRequest {
  headers: {
    authorization?: string;
  };
  user?: JwtUserPayload;
}
