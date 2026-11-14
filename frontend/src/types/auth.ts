/** Mirrors backend/app/schemas/auth.py. */
export interface AuthUser {
  username: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}
