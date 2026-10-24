const PATHS = {
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z',
  clock: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zm0-14v5l3.5 2',
  download: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14',
  queue: 'M4 6h12M4 11h12M4 16h7m5-1v6l5-3z',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7.4-2.1.1-1.4-.1-1.4 2-1.6-2-3.4-2.4.9a7 7 0 0 0-2.4-1.4L14.2 2h-4l-.4 2.6A7 7 0 0 0 7.4 6l-2.4-1-2 3.5 2 1.6-.1 1.4.1 1.4-2 1.6 2 3.4 2.4-.9a7 7 0 0 0 2.4 1.4l.4 2.6h4l.4-2.6a7 7 0 0 0 2.4-1.4l2.4.9 2-3.4z',
  dots: 'M12 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  close: 'M6 6l12 12M18 6 6 18',
  play: 'M8 5v14l11-7z',
  up: 'M12 19V5m0 0-6 6m6-6 6 6',
  down: 'M12 5v14m0 0-6-6m6 6 6-6',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  external: 'M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  check: 'M5 12.5 10 17 19 7',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm9 3-4.5-4.5',
  alert: 'M12 3 2 20h20zM12 10v4m0 3v.01',
  retry: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  chevron: 'M9 6l6 6-6 6',
  key: 'M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm-3 3v9m0-4h3m-3-2h2',
  minimize: 'M6 9l6 6 6-6',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  next: 'M6 5.5v13l9-6.5zM16.5 5h2.5v14h-2.5z',
  volume: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5m0-5-5 5',
  collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  arrowLeft: 'M19 12H5m0 0 6-6m-6 6 6 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  video: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h11A1.5 1.5 0 0 1 17 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 17.5zM17 10l4-2.5v9L17 14',
  playlist: 'M4 6h11M4 10.5h11M4 15h6m4-1.5v6.5l5.5-3.25z',
  heart: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z',
  prev: 'M18 5.5v13l-9-6.5zM7.5 5H5v14h2.5z',
  repeat: 'M4 11V9a3 3 0 0 1 3-3h12m0 0-3-3m3 3-3 3M20 13v2a3 3 0 0 1-3 3H5m0 0 3 3m-3-3 3-3',
  shuffle: 'M3 7h3.5c4.5 0 6.5 10 11 10H21m0 0-3 3m3-3-3-3M3 17h3.5c1.4 0 2.6-1 3.6-2.3M21 7h-3.5c-1.4 0-2.6 1-3.6 2.3M21 7l-3-3m3 3-3 3',
};

const SOLID = new Set(['dots', 'play', 'pause', 'next', 'prev']);

export default function Icon({ name, size = 20, className = '', strokeWidth = 1.8, fill = false }) {
  const solid = fill || SOLID.has(name);
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke={solid ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
