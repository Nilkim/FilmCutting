import { useRef, useState } from 'react';

function useComposition(value, onChange) {
  const composingRef = useRef(false);
  const [, force] = useState(0);

  const handlers = {
    onChange: (e) => {
      if (composingRef.current) {
        force((n) => n + 1);
        return;
      }
      onChange(e.target.value);
    },
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onCompositionEnd: (e) => {
      composingRef.current = false;
      onChange(e.target.value);
    },
    value,
  };
  return handlers;
}

export function KoreanSafeInput({ value, onChange, ...rest }) {
  const handlers = useComposition(value, onChange);
  return <input {...rest} {...handlers} />;
}

export function KoreanSafeTextarea({ value, onChange, ...rest }) {
  const handlers = useComposition(value, onChange);
  return <textarea {...rest} {...handlers} />;
}
