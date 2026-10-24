import type { SVGProps } from 'react';

const paths: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9.5 20v-6h5v6',
  box: 'm4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8',
  template: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  audit: 'M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M12 12 21 3M15 3h6v6M7 8h4M7 12h4M7 16h6',
  plus: 'M12 5v14M5 12h14', search: 'm21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 15v5h16v-5', download: 'M12 4v12m0 0 5-5m-5 5-5-5M4 20h16',
  chevronDown: 'm6 9 6 6 6-6', chevronRight: 'm9 6 6 6-6 6', chevronLeft: 'm15 6-6 6 6 6',
  arrowLeft: 'M19 12H5m0 0 6 6m-6-6 6-6', arrowUp: 'M12 19V5m0 0-6 6m6-6 6 6', arrowDown: 'M12 5v14m0 0 6-6m-6 6-6-6',
  menu: 'M4 6h16M4 12h16M4 18h16', close: 'M6 6l12 12M18 6 6 18', logout: 'M10 17l5-5-5-5M15 12H3M15 3h5v18h-5',
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z', trash: 'M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 11v6M14 11v6',
  restore: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2', more: 'M5 12h.01M12 12h.01M19 12h.01',
  check: 'm5 12 4 4L19 6', alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2', spark: 'm12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3ZM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8L19 17Z',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2ZM17 21v-8H7v8M7 3v5h8',
  filter: 'M4 5h16M7 12h10M10 19h4', eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2', user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
};
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
