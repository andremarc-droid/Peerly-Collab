import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMobileChrome } from '../../../lib/platform/mobileChromeContext'

interface M3PageHeaderProps {
  eyebrow: string
  title: ReactNode
  subtitle: string
  action?: ReactNode
  mobileAction?: ReactNode
}

/**
 * Phone page header: large title on white, like the auth screens. Nested screens get a back control.
 * Class-colored navy bands and stripes stay on desktop.
 */
export function M3PageHeader({ eyebrow, title, subtitle, action, mobileAction }: M3PageHeaderProps) {
  const chrome = useMobileChrome()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const backTo = chrome && !chrome.tabRoot ? chrome.backTo : null
  const resolvedAction = mobileAction !== undefined ? mobileAction : action

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <header className="page-header page-header--m3">
      {backTo && (
        <div className="flex h-16 items-center px-2">
          <Link
            to={backTo}
            aria-label="Back"
            className="m3-press m3-press--icon inline-flex size-12 items-center justify-center rounded-full text-navy-900"
          >
            <ArrowLeft size={24} aria-hidden="true" />
          </Link>
        </div>
      )}
      <div className="page-header__inner">
        <div className="page-header__copy">
          <p className="page-header__badge m-0 inline-flex min-h-8 w-fit items-center rounded-full bg-navy-700-07 px-4 text-sm font-semibold tracking-normal text-navy-900 normal-case">
            {eyebrow}
          </p>
          <h1 ref={titleRef} tabIndex={-1} className="m3-title">
            {title}
          </h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {resolvedAction ? <div className="page-header__action">{resolvedAction}</div> : null}
      </div>
    </header>
  )
}
