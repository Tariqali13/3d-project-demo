import type { ReactNode } from 'react';

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const icons = {
  navigate: (
    <Svg>
      <ellipse cx="10" cy="10" rx="7.5" ry="3.5" />
      <path d="M14.5 5.2 17 6.9l-2.9.8" />
      <circle cx="10" cy="10" r="1" fill="currentColor" />
    </Svg>
  ),
  inspect: (
    <Svg>
      <circle cx="10" cy="10" r="5" />
      <path d="M10 2v4M10 14v4M2 10h4M14 10h4" />
    </Svg>
  ),
  distance: (
    <Svg>
      <path d="M4 15 16 5" />
      <circle cx="4" cy="15" r="1.6" fill="currentColor" />
      <circle cx="16" cy="5" r="1.6" fill="currentColor" />
      <path d="m8.6 13.6 1.2 1.4M11.6 11.1l1.2 1.4" />
    </Svg>
  ),
  area: (
    <Svg>
      <path d="M3.5 13 7 4l9 3-1.5 8.5L7 17z" />
      <path d="M7 9.5h5M6.5 12.5h6" strokeOpacity=".45" />
    </Svg>
  ),
  profile: (
    <Svg>
      <path d="M2 14.5 6 9l3 2.5L13 5l5 6.5" />
      <path d="M2 17.5h16" strokeOpacity=".45" />
    </Svg>
  ),
  stockpile: (
    <Svg>
      <path d="M2.5 15.5C5 15.5 6.5 6 10 6s5 9.5 7.5 9.5" />
      <path d="M2.5 15.5h15" strokeDasharray="1.5 2" />
    </Svg>
  ),
  cutfill: (
    <Svg>
      <path d="M2 10h16" />
      <path d="M3 10c1.5-4 4-5 6-5s3 2 3 5" />
      <path d="M12 10c.5 2.5 2 4 5 4" />
    </Svg>
  ),
  open: (
    <Svg>
      <path d="M2.5 5.5V15a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V7.5a1 1 0 0 0-1-1H9.5L8 4.5H3.5a1 1 0 0 0-1 1Z" />
      <path d="M10 9.5v4M8 11.5h4" />
    </Svg>
  ),
  fit: (
    <Svg>
      <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
      <path d="m7 12 3-4 3 4" />
    </Svg>
  ),
  plan: (
    <Svg>
      <rect x="3" y="3" width="14" height="14" rx="1" />
      <path d="M8 13V7l4 6V7" />
    </Svg>
  ),
  close: (
    <Svg>
      <path d="m5 5 10 10M15 5 5 15" />
    </Svg>
  ),
  download: (
    <Svg>
      <path d="M10 3v9m-3.5-3.5L10 12l3.5-3.5M4 16h12" />
    </Svg>
  ),
  layers: (
    <Svg>
      <path d="m10 3 7.5 4L10 11 2.5 7z" />
      <path d="m2.5 10.5 7.5 4 7.5-4" />
    </Svg>
  ),
};
