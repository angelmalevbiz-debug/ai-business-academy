"use client";

import { useEffect, useRef } from "react";

/** A bounded, interaction-driven field. It settles, rather than running forever. */
export function CosmicField({
  focus,
  paused,
}: {
  focus: number;
  paused: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wakeRef = useRef<(() => void) | null>(null);
  const focusRef = useRef(focus);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let width = 1;
    let height = 1;
    let frame = 0;
    let until = 0;
    let lastTime = 0;
    const pointer = { x: -500, y: -500 };
    const points = Array.from({ length: 86 }, (_, index) => ({
      seed: index,
      x: 0,
      y: 0,
      depth: 0.25 + ((Math.sin(index * 27.17) + 1) / 2) * 0.75,
    }));

    function target(index: number) {
      const cluster = index % 5;
      const wave = index * 2.399963;
      const spread = Math.sqrt(index / points.length);
      const choice = focusRef.current < 0 ? 0 : focusRef.current;
      const centerX = 0.5 + Math.sin(cluster * 1.37 + choice * 0.32) * 0.17;
      const centerY = 0.5 + Math.cos(cluster * 1.79 + choice * 0.24) * 0.16;
      return {
        x: (centerX + Math.sin(wave + choice * 0.13) * spread * 0.27) * width,
        y:
          (centerY + Math.cos(wave * 1.03 + choice * 0.09) * spread * 0.31) *
          height,
      };
    }
    function render(time = performance.now(), immediate = false) {
      frame = 0;
      if (!visible || document.hidden) return;
      const count = width < 420 ? 48 : points.length;
      const delta = Math.min(35, time - (lastTime || time));
      lastTime = time;
      context!.clearRect(0, 0, width, height);
      const glow = context!.createRadialGradient(
        width * 0.51,
        height * 0.49,
        0,
        width * 0.51,
        height * 0.49,
        width * 0.49,
      );
      glow.addColorStop(0, "rgba(136,173,236,.06)");
      glow.addColorStop(1, "rgba(136,173,236,0)");
      context!.fillStyle = glow;
      context!.fillRect(0, 0, width, height);
      for (let i = 0; i < count; i++) {
        const point = points[i];
        const destination = target(point.seed);
        const factor =
          immediate || paused || media.matches
            ? 1
            : Math.min(0.15, delta / 200);
        point.x += (destination.x - point.x) * factor;
        point.y += (destination.y - point.y) * factor;
      }
      for (let i = 0; i < count; i++) {
        const point = points[i];
        for (let j = i + 1; j < Math.min(count, i + 11); j++) {
          const other = points[j];
          const distance = Math.hypot(point.x - other.x, point.y - other.y);
          if (distance > width * 0.19) continue;
          context!.strokeStyle = `rgba(160,191,240,${Math.max(0, 0.15 - (distance / width) * 0.6)})`;
          context!.lineWidth = 0.65;
          context!.beginPath();
          context!.moveTo(point.x, point.y);
          context!.lineTo(other.x, other.y);
          context!.stroke();
        }
        const proximity = Math.max(
          0,
          1 - Math.hypot(point.x - pointer.x, point.y - pointer.y) / 110,
        );
        context!.fillStyle =
          point.seed % 13 === 0
          ? `rgba(241,105,121,${Math.min(0.95, point.depth * 0.8 + proximity * 0.4)})`
            : `rgba(216,231,255,${Math.min(0.95, point.depth * 0.72 + proximity * 0.4)})`;
        context!.beginPath();
        context!.arc(
          point.x,
          point.y,
          0.7 + point.depth * 1.5 + proximity,
          0,
          Math.PI * 2,
        );
        context!.fill();
      }
      if (!paused && !media.matches && time < until)
        frame = requestAnimationFrame(render);
    }
    function wake() {
      if (!visible || document.hidden) return;
      until = performance.now() + 1450;
      if (!frame)
        frame = requestAnimationFrame((time) =>
          render(time, paused || media.matches),
        );
    }
    function resize() {
      const bounds = canvas!.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      render(performance.now(), true);
    }
    function move(event: PointerEvent) {
      const bounds = canvas!.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      wake();
    }
    function leave() {
      pointer.x = -500;
      pointer.y = -500;
      wake();
    }
    function visibility() {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else wake();
    }
    function motionChange() {
      cancelAnimationFrame(frame);
      frame = 0;
      render(performance.now(), true);
    }
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) wake();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    const resizeObserver = new ResizeObserver(resize);
    observer.observe(canvas);
    resizeObserver.observe(canvas);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", motionChange);
    wakeRef.current = wake;
    resize();
    return () => {
      wakeRef.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", motionChange);
    };
  }, [paused]);

  useEffect(() => {
    focusRef.current = focus;
    wakeRef.current?.();
  }, [focus]);
  return (
    <canvas
      ref={canvasRef}
      className="cosmic-field"
      aria-hidden="true"
      data-motion={paused ? "paused" : "interaction"}
    />
  );
}
