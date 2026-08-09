export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  mobile: string | null;
  is_active: boolean;
  is_verified: boolean;
  is_admin: boolean; 
  created_at: string;
  avatar_url: string | null;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  mobile?: string;
  avatar?: File | null;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface AuthResponse extends AuthTokens {
  user?: User;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials, rememberMe?: boolean) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}
