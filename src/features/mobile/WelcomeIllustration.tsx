import { Check } from 'lucide-react'

const groupInitials = ['A', 'M', 'J']

/** Decorative preview of a quiz question and a study group. Hidden from assistive technology. */
export function WelcomeIllustration() {
  return (
    <div aria-hidden="true" className="relative h-[19rem] w-full max-w-72">
      <span className="absolute inset-x-4 top-4 h-60 -rotate-6 rounded-3xl bg-navy-900" />
      <span className="absolute inset-x-2 top-4 h-60 rotate-3 rounded-3xl border border-navy-900-12 bg-white shadow-sm" />

      <div className="absolute inset-x-0 top-8 grid gap-3 rounded-3xl border border-navy-900-12 bg-white p-4 shadow-md">
        <span className="w-fit rounded-full bg-navy-700-07 px-3 py-1 text-sm font-medium text-navy-900">Question 4 of 12</span>
        <p className="m-0 font-heading text-lg font-semibold leading-snug text-navy-900">
          What is the worst-case time of binary search?
        </p>
        <ul className="m-0 grid list-none gap-2 p-0">
          <li className="flex min-h-11 items-center rounded-2xl border border-navy-900-30 px-4 text-base text-navy-900">O(n)</li>
          <li className="flex min-h-11 items-center justify-between rounded-2xl bg-navy-900 px-4 text-base font-medium text-white">
            O(log n)
            <Check size={18} />
          </li>
        </ul>
      </div>

      <div className="absolute bottom-0 right-0 flex items-center gap-2 rounded-full border border-navy-900-12 bg-white py-1.5 pl-1.5 pr-4 shadow-md">
        <span className="flex -space-x-2">
          {groupInitials.map((initial) => (
            <span
              key={initial}
              className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-navy-900 text-sm font-semibold text-white"
            >
              {initial}
            </span>
          ))}
        </span>
        <span className="text-sm font-semibold text-navy-900">Group of 3</span>
      </div>
    </div>
  )
}
