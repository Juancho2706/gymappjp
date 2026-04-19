"use client";

import { useCallback, useRef } from "react";
import { animate, motion, useMotionValue } from "framer-motion";
import { workoutNodes } from "../_data/mock";

function pathD(): string {
  const [a, b, c] = workoutNodes;
  return `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y}`;
}

export function SpatialBuilderCanvas() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const s = useMotionValue(1);
  const dragging = useRef(false);
  const dragRef = useRef({ px: 0, py: 0, sx: 0, sy: 0 });

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const next = Math.min(2.2, Math.max(0.55, s.get() - e.deltaY * 0.004));
        s.set(next);
      } else {
        x.set(x.get() - e.deltaX);
        y.set(y.get() - e.deltaY);
      }
    },
    [s, x, y],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    dragRef.current = { px: e.clientX, py: e.clientY, sx: x.get(), sy: y.get() };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const { px, py, sx, sy } = dragRef.current;
    x.set(sx + (e.clientX - px));
    y.set(sy + (e.clientY - py));
  };

  const endDrag = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragging.current = false;
  };

  const zoomPulse = () => {
    const cur = s.get();
    void animate(s, [cur, cur * 0.9, 1.06, 1], {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
    });
  };

  return (
    <div className="relative">
      <div className="pc-edge-muted flex flex-wrap items-center justify-between gap-2 border-b-0 px-3 py-2 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[var(--pc-muted)] md:px-4">
        <span className="min-w-0 flex-1">
          Canvas · arrastrá · rueda desplaza · ⌃/⌘+rueda zoom
        </span>
        <button type="button" className="pc-btn-ghost shrink-0 !min-h-8 px-2 py-1 text-[0.55rem]" onClick={zoomPulse}>
          Jello
        </button>
      </div>
      <div
        className="pc-edge-muted relative h-[min(68vh,560px)] min-h-[280px] touch-none overflow-hidden border-t-0 md:h-[min(72vh,640px)]"
        onWheel={onWheel}
      >
        <motion.div
          className="pc-show-grid absolute left-0 top-0 h-[140%] w-[140%] cursor-grab active:cursor-grabbing"
          style={{ x, y, scale: s, transformOrigin: "50% 40%" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <motion.path
              d={pathD()}
              fill="none"
              stroke="var(--pc-primary)"
              strokeWidth={0.35}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="square"
              initial={{ pathLength: 0, opacity: 0.35 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
          </svg>

          {workoutNodes.map((n) => (
            <DayNode key={n.id} node={n} onJello={zoomPulse} />
          ))}
        </motion.div>

        <div className="pointer-events-none absolute bottom-3 right-3 z-10 h-14 w-24 border-2 border-[var(--pc-chalk)] bg-black/90 p-1">
          <div className="relative h-full w-full">
            {workoutNodes.map((n) => (
              <div
                key={`m-${n.id}`}
                className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 bg-[var(--pc-primary)]"
                style={{ left: `${n.x}%`, top: `${n.y}%` }}
              />
            ))}
          </div>
          <p className="pc-mono absolute -bottom-5 right-0 text-[0.5rem] uppercase tracking-widest text-[var(--pc-muted)]">
            minimap
          </p>
        </div>
      </div>
    </div>
  );
}

function DayNode({
  node,
  onJello,
}: {
  node: (typeof workoutNodes)[0];
  onJello: () => void;
}) {
  return (
    <motion.div
      layoutId={`node-${node.id}`}
      className="pc-edge-muted pc-hover-ring absolute w-[min(42vw,160px)] -translate-x-1/2 -translate-y-1/2 border-2 p-3 md:w-40"
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      whileTap={{ scale: 0.97 }}
      onDoubleClick={onJello}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="pc-caps-micro text-[var(--pc-primary)]">{node.label}</p>
      <p className="mt-1 text-lg font-bold uppercase tracking-tight text-[var(--pc-chalk)]">{node.sub}</p>
      <p className="pc-mono mt-2 text-[0.6rem] text-[var(--pc-muted)]">dbl · jello</p>
    </motion.div>
  );
}
