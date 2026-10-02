export type AuthField = 'name' | 'email' | 'password' | 'confirmPassword'
export type AuthFieldErrors = Partial<Record<AuthField, string>>

export interface SignupValues {
  name: string
  email: string
  password: string
  confirmPassword: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Enter your email address.'
  if (!emailPattern.test(email.trim())) return 'Enter a valid email address.'
  return undefined
}

export function validatePassword(password: string): string | undefined {
  if (!password) return 'Enter your password.'
  if (password.length < 8) return 'Use at least 8 characters.'
  return undefined
}

export function getPasswordStrength(password: string): 'empty' | 'weak' | 'fair' | 'strong' {
  if (!password) return 'empty'
  if (password.length < 8) return 'weak'
  const variety = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^a-zA-Z\d]/.test(password)].filter(Boolean).length
  if (password.length >= 12 && variety >= 3) return 'strong'
  return 'fair'
}

export function validateSignup(values: SignupValues): AuthFieldErrors {
  const errors: AuthFieldErrors = {}
  if (!values.name.trim()) errors.name = 'Enter your name.'
  const emailError = validateEmail(values.email)
  if (emailError) errors.email = emailError
  const passwordError = validatePassword(values.password)
  if (passwordError) errors.password = passwordError
  if (!values.confirmPassword) errors.confirmPassword = 'Confirm your password.'
  else if (values.confirmPassword !== values.password) errors.confirmPassword = 'Passwords do not match.'
  return errors
}

export function validateSignin(email: string, password: string): AuthFieldErrors {
  const errors: AuthFieldErrors = {}
  const emailError = validateEmail(email)
  if (emailError) errors.email = emailError
  if (!password) errors.password = 'Enter your password.'
  return errors
}
