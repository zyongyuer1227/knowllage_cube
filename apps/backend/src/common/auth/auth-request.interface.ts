export interface JwtUserPayload {
  sub: number;
  username: string;
  role: string;
}

export interface AuthRequest {
  headers: {
    authorization?: string;
    "x-forwarded-for"?: string;
  };
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  user?: JwtUserPayload;
}
