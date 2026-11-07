export const glass = {
  card: {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.10)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.09)',
  } as React.CSSProperties,
};

export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
};

export const primaryButton: React.CSSProperties = {
  background: '#acc6e9',
  color: '#0d1b2f',
  border: 'none',
  cursor: 'pointer',
};

export const secondaryButton: React.CSSProperties = {
  ...glass.inner,
  color: '#cbd5e1',
  cursor: 'pointer',
};
