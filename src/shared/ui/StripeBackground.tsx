interface StripeBackgroundProps {
  variant?: 'pinstripe' | 'band' | 'fade'
}

export function StripeBackground({ variant = 'pinstripe' }: StripeBackgroundProps) {
  return <span className={`stripe stripe--${variant}`} aria-hidden="true" />
}
