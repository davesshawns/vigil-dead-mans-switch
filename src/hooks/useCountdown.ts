import { useState, useEffect } from 'react';

export function useCountdown(lastPing: bigint | undefined, interval: bigint | undefined) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (lastPing === undefined || interval === undefined) return;
    const deadline = Number(lastPing) + Number(interval);
    const update = () => setRemaining(Math.max(0, deadline - Math.floor(Date.now() / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastPing, interval]);

  return remaining;
}
