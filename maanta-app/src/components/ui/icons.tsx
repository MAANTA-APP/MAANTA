import { cn } from "@/lib/ui";

type IconProps = { className?: string; strokeWidth?: number };

function Svg({
  className,
  children,
  strokeWidth = 1.8,
  filled = false,
}: IconProps & { children: React.ReactNode; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5 shrink-0", className)}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
export const IconTicket = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z" />
    <path d="M13 6v12" strokeDasharray="2 2.5" />
  </Svg>
);
export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
  </Svg>
);
export const IconKeypad = (p: IconProps) => (
  <Svg {...p} strokeWidth={0} filled>
    {[6, 12, 18].flatMap((y) =>
      [6, 12, 18].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.8" />)
    )}
  </Svg>
);
export const IconWallet = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M16 12.5h.5" strokeWidth="2.6" />
    <path d="M3 9h18" />
  </Svg>
);
export const IconMore = (p: IconProps) => (
  <Svg {...p} strokeWidth={0} filled>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </Svg>
);
export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
    <path d="M10 19a2.2 2.2 0 0 0 4 0" />
  </Svg>
);
export const IconBolt = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
  </Svg>
);
export const IconHeart = ({
  className,
  filled = true,
}: IconProps & { filled?: boolean }) => (
  <Svg className={className} filled={filled} strokeWidth={filled ? 0 : 1.8}>
    <path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3.1A4.6 4.6 0 0 1 20 10c0 5.8-8 11-8 11z" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);
export const IconX = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="m5 5 14 14M19 5 5 19" />
  </Svg>
);
export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);
export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);
export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 9 7 7 7-7" />
  </Svg>
);
export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5m6-7-7 7 7 7" />
  </Svg>
);
export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </Svg>
);
export const IconGlobe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </Svg>
);
export const IconMenu = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconAlert = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M12 5v9" />
    <circle cx="12" cy="18.4" r="0.6" fill="currentColor" />
  </Svg>
);
export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
  </Svg>
);
export const IconWhatsApp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" />
    <path d="M9 8.8c0 3.4 2.8 6.2 6.2 6.2l.8-1.8-2-1-1 .8a4.6 4.6 0 0 1-2-2l.8-1-1-2z" />
  </Svg>
);
export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconBackspace = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 5h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9l-7-7z" />
    <path d="m13.5 9.5 4 5M17.5 9.5l-4 5" />
  </Svg>
);
export const IconPause = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M9 5v14M15 5v14" />
  </Svg>
);
export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m4 18 5-5 3.5 3.5L16 13l4 4" />
  </Svg>
);

/** Maanta logomark — rounded-square badge with a check-shield (from wireframe splash). */
export function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("h-10 w-10", className)} aria-hidden>
      <rect x="2" y="2" width="44" height="44" rx="12" fill="#FDBF2D" />
      <path
        d="M24 9.5 35 14v9c0 7.5-4.7 12.6-11 15-6.3-2.4-11-7.5-11-15v-9l11-4.5z"
        fill="#000"
      />
      <path
        d="m18.2 24.2 4 4 7.6-8.4"
        stroke="#FDBF2D"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
