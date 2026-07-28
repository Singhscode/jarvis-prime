// Authentication constants and configuration
// Defines security parameters, timeout values, and business rules

export const auth = {
  // Password requirements (OWASP-aligned)
  password: {
    minLength: 12,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    // Prevent common patterns
    blacklist: [
      'password', 'passw0rd', '123456', 'qwerty', 'abc123',
      'letmein', 'welcome', 'admin', 'root', 'user'
    ],
  },

  // Email verification
  email: {
    verificationTokenExpiryMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    resendCooldownMs: 60 * 1000,                          // 1 minute
    maxResendAttempts: 5,
  },

  // Password reset
  passwordReset: {
    tokenExpiryMs: 24 * 60 * 60 * 1000,                 // 24 hours
    maxAttempts: 3,
    cooldownMs: 15 * 60 * 1000,                         // 15 minutes between requests
  },

  // Login security
  login: {
    maxFailedAttempts: 5,
    lockoutDurationMs: 30 * 60 * 1000,                 // 30 minutes
    sessionTimeoutMs: 24 * 60 * 60 * 1000,             // 24 hours absolute
    idleTimeoutMs: 60 * 60 * 1000,                     // 1 hour idle
    refreshTokenExpiryMs: 30 * 24 * 60 * 60 * 1000,   // 30 days
  },

  // JWT tokens
  jwt: {
    accessTokenExpirySeconds: 15 * 60,                 // 15 minutes
    refreshTokenExpirySeconds: 30 * 24 * 60 * 60,     // 30 days
    issuer: 'jarvis-prime',
    audience: 'jarvis-prime-api',
    algorithm: 'HS256',
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000,                         // 15 minute window
    maxLoginAttempts: 5,                               // per IP
    maxRegistrationAttempts: 3,                        // per IP per hour
    maxPasswordResetAttempts: 3,                       // per IP per hour
    maxTokenVerificationAttempts: 5,                   // per token
  },

  // Account status
  accountStatus: {
    PENDING_VERIFICATION: 'pending_verification',
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    DELETED: 'deleted',
  },

  // Audit event types
  auditEvents: {
    USER_CREATED: 'user.created',
    USER_LOGIN: 'user.login',
    USER_LOGOUT: 'user.logout',
    USER_DELETED: 'user.deleted',
    PASSWORD_CHANGED: 'password.changed',
    PASSWORD_RESET: 'password.reset',
    EMAIL_VERIFIED: 'email.verified',
    EMAIL_VERIFICATION_SENT: 'email.verification_sent',
    SESSION_CREATED: 'session.created',
    SESSION_REVOKED: 'session.revoked',
    TOKEN_REFRESHED: 'token.refreshed',
    LOGIN_FAILED: 'login.failed',
    ACCOUNT_LOCKED: 'account.locked',
  },
};

// OWASP-aligned response messages (avoid user enumeration)
export const authMessages = {
  // Success
  REGISTRATION_SUCCESS: 'Account created successfully. Check your email to verify.',
  LOGIN_SUCCESS: 'Logged in successfully.',
  LOGOUT_SUCCESS: 'Logged out successfully.',
  EMAIL_VERIFIED: 'Email verified successfully.',
  PASSWORD_RESET_SUCCESS: 'Password reset successfully.',
  MFA_ENABLED: 'Multi-factor authentication enabled.',
  MFA_DISABLED: 'Multi-factor authentication disabled.',

  // Generic errors (no user enumeration)
  INVALID_CREDENTIALS: 'Invalid email or password.',
  INVALID_TOKEN: 'Invalid or expired verification link.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  UNAUTHORIZED: 'Unauthorized.',
  FORBIDDEN: 'Forbidden.',

  // Specific errors
  EMAIL_ALREADY_EXISTS: 'Email already registered.',
  USERNAME_ALREADY_EXISTS: 'Username already taken.',
  USER_NOT_FOUND: 'User not found.',
  ACCOUNT_SUSPENDED: 'Account is suspended.',
  ACCOUNT_DELETED: 'Account has been deleted.',
  EMAIL_NOT_VERIFIED: 'Email not verified.',
  ACCOUNT_LOCKED: 'Account locked due to failed login attempts.',
};

// HTTP status codes
export const statusCodes = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};
