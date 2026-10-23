import { useEffect, useRef } from "react";

type Props = {
  label: string;
  orientation: "vertical" | "horizontal";
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onReset: () => void;
  reverse?: boolean;
  className?: string;
};
export function PanelDivider({
  label,
  orientation,
  value,
  min,
  max,
  onChange,
  onReset,
  reverse,
  className = "",
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    start: number;
    value: number;
    size: number;
  } | null>(null);
  const horizontal = orientation === "horizontal";
  const change = (next: number) => onChange(Math.max(min, Math.min(max, next)));
  const stop = () => {
    const id = drag.current?.id;
    drag.current = null;
    if (id != null && host.current?.hasPointerCapture(id))
      host.current.releasePointerCapture(id);
    host.current?.classList.remove("resizing");
  };
  useEffect(() => {
    window.addEventListener("blur", stop);
    return () => window.removeEventListener("blur", stop);
  }, []);
  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    stop();
  };
  return (
    <div
      ref={host}
      className={`panel-divider ${horizontal ? "horizontal" : "vertical"} ${className}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      title={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Number(value.toFixed(2))}
      onDoubleClick={onReset}
      onPointerDown={(e) => {
        if (e.button !== 0 || drag.current) return;
        e.preventDefault();
        const size = horizontal
          ? Math.max(1, e.currentTarget.parentElement!.clientHeight - 8)
          : 1;
        drag.current = {
          id: e.pointerId,
          start: horizontal ? e.clientY : e.clientX,
          value,
          size,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.classList.add("resizing");
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        change(
          d.value +
            (((horizontal ? e.clientY : e.clientX) - d.start) / d.size) *
              (reverse ? -1 : 1),
        );
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onBlur={stop}
      onKeyDown={(e) => {
        if (e.key === "Home") {
          e.preventDefault();
          e.stopPropagation();
          change(min);
        } else if (e.key === "End") {
          e.preventDefault();
          e.stopPropagation();
          change(max);
        } else if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onReset();
        } else if (
          (horizontal
            ? ["ArrowUp", "ArrowDown"]
            : ["ArrowLeft", "ArrowRight"]
          ).includes(e.key)
        ) {
          e.preventDefault();
          e.stopPropagation();
          const direction = ["ArrowUp", "ArrowLeft"].includes(e.key) ? -1 : 1;
          change(
            value +
              direction *
                (reverse ? -1 : 1) *
                (horizontal ? 0.02 : 10) *
                (e.shiftKey ? 3 : 1),
          );
        }
      }}
    >
      <span />
    </div>
  );
}
