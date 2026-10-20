/**
 * El logo de cada plataforma de Claves API, dibujado acá: sin imágenes de afuera, que se
 * caen o cambian de dirección. Son versiones simples, reconocibles por forma y color.
 */

const LOGOS = {
  meta_ads: (
    <>
      <rect width="40" height="40" rx="10" fill="#0866ff" />
      <path d="M9 21.5c0-4.6 2.3-8 5.4-8 2.6 0 4.3 2.2 5.6 4.6 1.3 2.4 3 5.6 5.6 5.6 1.9 0 3.3-1.6 3.3-3.9 0-2.4-1.4-4-3.2-4-1.6 0-2.9 1.4-4.4 4l-1.6 2.7c-1.5 2.6-3 4.1-5.2 4.1-3.2 0-5.5-2.2-5.5-5.1Z"
        fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  instagram: (
    <>
      <defs>
        <radialGradient id="lp-ig" cx="0.3" cy="1.05" r="1.3">
          <stop offset="0" stopColor="#fdd56c" />
          <stop offset="0.25" stopColor="#f77a26" />
          <stop offset="0.55" stopColor="#d6246e" />
          <stop offset="0.85" stopColor="#8a3ab9" />
          <stop offset="1" stopColor="#4f5bd5" />
        </radialGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#lp-ig)" />
      <rect x="10" y="10" width="20" height="20" rx="6" fill="none" stroke="#fff" strokeWidth="2.4" />
      <circle cx="20" cy="20" r="4.6" fill="none" stroke="#fff" strokeWidth="2.4" />
      <circle cx="26.2" cy="13.8" r="1.4" fill="#fff" />
    </>
  ),
  manychat: (
    <>
      <rect width="40" height="40" rx="10" fill="#0084ff" />
      <path d="M20 10.5c-5.8 0-10 3.9-10 9 0 2.8 1.3 5.2 3.4 6.8v3.7l3.5-1.9c1 .3 2 .4 3.1.4 5.8 0 10-3.9 10-9s-4.2-9-10-9Z" fill="#fff" />
      <path d="m14.6 22.4 3.6-4 2.2 2.3 3.6-2.3-3.6 4-2.2-2.3Z" fill="#0084ff" />
    </>
  ),
  youtube: (
    <>
      <rect width="40" height="40" rx="10" fill="#fff" />
      <rect x="7" y="11.5" width="26" height="17" rx="5" fill="#ff0000" />
      <path d="M17.5 15.6v8.8l7.4-4.4Z" fill="#fff" />
    </>
  ),
  google_calendar: (
    <>
      <rect width="40" height="40" rx="10" fill="#fff" />
      <rect x="8" y="9" width="24" height="23" rx="3.5" fill="#fff" stroke="#dadce0" strokeWidth="1.2" />
      <path d="M8 12.5a3.5 3.5 0 0 1 3.5-3.5h17a3.5 3.5 0 0 1 3.5 3.5V15H8Z" fill="#1a73e8" />
      <text x="20" y="28" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="11" fill="#1a73e8">31</text>
    </>
  ),
  typeform: (
    <>
      <rect width="40" height="40" rx="10" fill="#262627" />
      <rect x="10.5" y="12" width="5" height="16" rx="2.5" fill="#fff" />
      <rect x="18.5" y="12" width="11" height="5" rx="2.5" fill="#fff" />
      <rect x="18.5" y="20" width="7" height="5" rx="2.5" fill="#fff" opacity="0.55" />
    </>
  ),
  zoom: (
    <>
      <rect width="40" height="40" rx="10" fill="#0b5cff" />
      <rect x="8.5" y="14" width="15.5" height="12" rx="3" fill="#fff" />
      <path d="m25.5 18.2 5.5-3.4v10.4l-5.5-3.4Z" fill="#fff" />
    </>
  ),
  fathom: (
    <>
      <rect width="40" height="40" rx="10" fill="#1d1b3a" />
      <path d="M13 28V13h13" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 20.5h9" fill="none" stroke="#8b7cf6" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  apify: (
    <>
      <rect width="40" height="40" rx="10" fill="#fff" />
      <path d="m10.5 28 6.2-16.5 3.4 1.3-6.2 16.5Z" fill="#97d700" />
      <path d="m17.8 28 6.2-16.5 3.4 1.3-6.2 16.5Z" fill="#71c5e8" />
      <path d="m25 28 4.4-11.7 3.4 1.3L28.4 29.3Z" fill="#ff9013" />
    </>
  ),
};

export default function LogoPlataforma({ plataforma, size = 40 }) {
  const logo = LOGOS[plataforma];
  if (!logo) {
    return (
      <span className="logo-plataforma vacio" style={{ width: size, height: size }} aria-hidden="true">
        {String(plataforma || '?').slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <svg className="logo-plataforma" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {logo}
    </svg>
  );
}
