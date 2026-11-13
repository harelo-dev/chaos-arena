"use client";

import React, { useRef, useState } from "react";
import type { SceneManager } from "../engine/SceneManager";

interface MobileControlsProps {
  sceneManager: SceneManager | null;
  hasCarriedItem: boolean;
  pushReady: boolean;
  showGateButton: boolean;
}

export function MobileControls({
  sceneManager,
  hasCarriedItem,
  pushReady,
  showGateButton,
}: MobileControlsProps) {
  const joyRef = useRef<HTMLDivElement | null>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const activeTouchId = useRef<number | null>(null);

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joyRef.current || !sceneManager) return;
    const rect = joyRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = rect.width / 2 - 16;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setKnobPos({ x: dx, y: dy });
    sceneManager.setMobileMoveVector(dx / maxRadius, dy / maxRadius);
  };

  const resetJoystick = () => {
    activeTouchId.current = null;
    setKnobPos({ x: 0, y: 0 });
    sceneManager?.setMobileMoveVector(0, 0);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex items-end justify-between px-5 pb-2 select-none">
      {/* LEFT: Analog Virtual Thumbstick */}
      <div
        ref={joyRef}
        onTouchStart={(e) => {
          e.stopPropagation();
          const t = e.changedTouches[0];
          activeTouchId.current = t.identifier;
          updateJoystick(t.clientX, t.clientY);
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === activeTouchId.current) {
              updateJoystick(t.clientX, t.clientY);
              break;
            }
          }
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          resetJoystick();
        }}
        onTouchCancel={resetJoystick}
        className="pointer-events-auto relative w-32 h-32 md:w-36 md:h-36 rounded-full bg-slate-900/65 backdrop-blur-md border-2 border-slate-500/50 flex items-center justify-center shadow-2xl touch-none"
      >
        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400/60 select-none">
          MOVER
        </div>
        <div
          style={{
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
          }}
          className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 border-2 border-white/80 shadow-lg"
        />
      </div>

      {/* RIGHT: Arcade Action Buttons Cluster */}
      <div className="pointer-events-auto flex flex-col items-end gap-2.5 touch-none">
        {showGateButton && (
          <button
            type="button"
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sceneManager?.triggerMobileGate();
            }}
            onClick={() => sceneManager?.triggerMobileGate()}
            className="px-4 py-2.5 rounded-2xl bg-sky-500 active:bg-sky-400 text-slate-950 font-black text-xs border-2 border-white/70 shadow-lg"
          >
            🔓 ABRIR/CERRAR PUERTA
          </button>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          {/* Grab / Drop Button */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sceneManager?.triggerMobileGrab();
            }}
            onClick={() => sceneManager?.triggerMobileGrab()}
            className="w-16 h-16 md:w-18 md:h-18 rounded-full bg-emerald-500/90 active:scale-90 border-2 border-white/80 text-slate-950 font-black text-[11px] flex flex-col items-center justify-center shadow-xl"
          >
            <span className="text-lg">✋</span>
            <span>{hasCarriedItem ? "SOLTAR" : "AGARRAR"}</span>
          </button>

          {/* Charge Throw Button */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sceneManager?.startMobileThrowCharge();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sceneManager?.releaseMobileThrow();
            }}
            onMouseDown={() => sceneManager?.startMobileThrowCharge()}
            onMouseUp={() => sceneManager?.releaseMobileThrow()}
            className="w-16 h-16 md:w-18 md:h-18 rounded-full bg-amber-400/90 active:scale-90 border-2 border-white/80 text-slate-950 font-black text-[11px] flex flex-col items-center justify-center shadow-xl"
          >
            <span className="text-lg">🎯</span>
            <span>LANZAR</span>
          </button>

          {/* Melee Stun Push Button */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sceneManager?.triggerMobilePush();
            }}
            onClick={() => sceneManager?.triggerMobilePush()}
            className={`w-16 h-16 md:w-18 md:h-18 rounded-full border-2 border-white/80 font-black text-[11px] flex flex-col items-center justify-center shadow-xl active:scale-90 ${
              pushReady
                ? "bg-rose-500/90 text-white"
                : "bg-slate-800/80 text-slate-400 border-slate-600"
            }`}
          >
            <span className="text-lg">💥</span>
            <span>EMPUJAR</span>
          </button>

          {/* Jump Button */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sceneManager?.triggerMobileJump();
            }}
            onClick={() => sceneManager?.triggerMobileJump()}
            className="w-16 h-16 md:w-18 md:h-18 rounded-full bg-sky-400/90 active:scale-90 border-2 border-white/80 text-slate-950 font-black text-[11px] flex flex-col items-center justify-center shadow-xl"
          >
            <span className="text-lg">🦘</span>
            <span>SALTAR</span>
          </button>
        </div>
      </div>
    </div>
  );
}
