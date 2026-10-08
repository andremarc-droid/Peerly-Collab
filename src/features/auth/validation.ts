export type AuthField = 'name' | 'email' | 'password' | 'confirmPassword' | 'age'
export type AuthFieldErrors = Partial<Record<AuthField, string>>

export const MIN_STUDENT_AGE = 5
export const MAX_STUDENT_AGE = 120

export interface SignupValues {
  name: string
  email: string
  password: string
  confirmPassword: string
  /** Students only. Kept as text so the input can be empty or partially typed. */
  age?: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Returns an error message, or undefined when the age is a whole number in the allowed range. */
export function validateAge(age: string | undefined): string | undefined {
  const text = (age ?? '').trim()
  if (!text) return 'Enter your age.'
  if (!/^\d{1,3}$/.test(text)) return 'Enter your age as a whole number.'
  const value = Number(text)
  if (value < MIN_STUDENT_AGE || value > MAX_STUDENT_AGE) return `Enter an age between ${MIN_STUDENT_AGE} and ${MAX_STUDENT_AGE}.`
  return undefined
}

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

export function validateSignup(values: SignupValues, options: { requireAge?: boolean } = {}): AuthFieldErrors {
  const errors: AuthFieldErrors = {}
  if (!values.name.trim()) errors.name = 'Enter your name.'
  if (options.requireAge) {
    const ageError = validateAge(values.age)
    if (ageError) errors.age = ageError
  }
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
