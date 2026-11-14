/** Mirrors backend/app/schemas/auth.py. */
export interface AuthUser {
  username: string;
  two_step_enabled: boolean;
  backup_codes_left: number;
}

export interface LoginRequest {
  username: string;
  password: string;
  /** Authenticator or backup code, sent once the server asks for one. */
  code?: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
  /** Authenticator or backup code, when two-step sign-in is on. */
  code?: string;
}

export interface ChangePasswordResult {
  /** How many other browsers were signed out. */
  signed_out: number;
}

export interface LoginResult {
  username: string;
  /** The password was right; send it again with a code. */
  code_required: boolean;
}
