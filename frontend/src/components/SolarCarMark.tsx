/** The app's mark: a solar car under the sun, as in public/icons/icon.svg, in the current text colour. */
export function SolarCarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="40 56 436 330" className={className} aria-hidden>
      <g fill="currentColor">
        <circle cx="372" cy="150" r="40" />
        <path d="M44 336C56 300 168 274 282 272C384 270 444 290 470 316C458 336 414 348 352 350H108C66 350 40 346 44 336Z" />
        <path d="M214 280C224 234 296 228 318 276Z" />
        <circle cx="146" cy="352" r="30" />
        <circle cx="372" cy="352" r="30" />
      </g>
      <path
        d="M372 76v-12M372 236v-12M298 150h-12M458 150h-12M320 98l-8-8M432 210l-8-8M320 202l-8 8M432 90l-8 8"
        stroke="currentColor"
        strokeWidth={18}
        strokeLinecap="round"
      />
    </svg>
  );
}
