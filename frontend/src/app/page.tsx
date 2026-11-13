"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import confetti from "canvas-confetti";
import {
  Trophy,
  Users,
  Play,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Video,
  Sparkles,
  Zap,
  Crown,
  Swords,
  RefreshCw,
  ArrowRight,
  LogOut,
  Gamepad2,
  Globe,
} from "lucide-react";
import type {
  CharacterId,
  GameMode,
  HudNotification,
  Medal,
  PlayerData,
  RoomSnapshot,
  TeamId,
  WorldId,
} from "../types/game";
import type { SceneManager } from "../engine/SceneManager";
import { ClipRecorder } from "../engine/ClipRecorder";
import { soundFX } from "../engine/SoundFX";
import { MobileControls } from "../components/MobileControls";

const CHARACTER_CATALOG: {
  id: CharacterId;
  name: string;
  emoji: string;
  desc: string;
}[] = [
  { id: "spartan", name: "Spartan MK-V", emoji: "🛡️", desc: "Casco táctico y visor dorado" },
  { id: "rooster", name: "Gallo Mecha", emoji: "🐔", desc: "Cresta neón y pico ciborg" },
  { id: "ninja", name: "Ninja Sombra", emoji: "🥷", desc: "Ojos cian y katanas dobles" },
  { id: "viking", name: "Vikingo Bárbaro", emoji: "🪓", desc: "Cuernos gigantes, barba y escudo" },
  { id: "dino", name: "Dino Rex", emoji: "🦖", desc: "Fauces jurásicas y cola animada" },
  { id: "astro", name: "Astro-Bot", emoji: "👩‍🚀", desc: "Escafandra de cristal y antena" },
];

const WORLD_META: Record<
  WorldId,
  { name: string; tag: string; desc: string; badgeColor: string; emoji: string }
> = {
  granja: {
    name: "Granja Caótica 2.0",
    tag: "Captura el Pollo + Río y Rotor",
    desc: "Cruza los puentes del río, esquiva el Rotor Espantapájaros, sube a los techos y encierra los pollos en tu corral ([Q] Puerta).",
    badgeColor: "from-emerald-500 to-lime-600",
    emoji: "🐔",
  },
  museo: {
    name: "Atraco al Museo 2.0",
    tag: "2 Pisos + Peso Compartido",
    desc: "Sube a los balcones del 2° piso por gemas o roba la Reliquia Pesada (solo = 40% vel; entre 2 compañeros = 90% vel).",
    badgeColor: "from-amber-500 to-orange-600",
    emoji: "🏛️",
  },
  canyon: {
    name: "Cañón Clásico 2.0",
    tag: "Blood Gulch + Puente y Cañones",
    desc: "Bases de 2 pisos, Puente Colgante central y Cañones Gravitatorios. Captura la bandera enemiga (5 pts) o núcleos (3 pts).",
    badgeColor: "from-purple-500 to-rose-600",
    emoji: "🚩",
  },
};

const CHAMPIONSHIP_ORDER: WorldId[] = ["granja", "museo", "canyon"];

export default function ChaosArenaPage() {
  const [playerName, setPlayerName] = useState("Spartan-117");
  const [selectedChar, setSelectedChar] = useState<CharacterId>("spartan");
  const [serverHost, setServerHost] = useState("192.168.1.3:3000");
  const [playerId, setPlayerId] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeRoomsList, setActiveRoomsList] = useState<any[]>([]);

  const [inRoom, setInRoom] = useState(false);
  const [room, setRoom] = useState<RoomSnapshot>({
    type: "state_snapshot",
    roomCode: "HALO",
    hostId: "local_host",
    status: "lobby",
    mode: "championship",
    currentWorld: "granja",
    roundIndex: 0,
    totalRounds: 3,
    doublePoints: false,
    timeRemaining: 90,
    roundScores: { red: 0, blue: 0 },
    totalScores: { red: 0, blue: 0 },
    roundHistory: [],
    gates: { red_gate: false, blue_gate: false, vault_locked: false },
    players: [],
    objects: {},
    botsCount: 3,
    roundDuration: 90,
  });

  const [medals, setMedals] = useState<Medal[]>([]);
  const [muted, setMuted] = useState(false);
  const [showTouchPad, setShowTouchPad] = useState(false);
  const [clipSavedToast, setClipSavedToast] = useState(false);
  const [notifications, setNotifications] = useState<HudNotification[]>([]);

  const [hud, setHud] = useState({
    throwCharge: 0,
    carryingName: null as string | null,
    sharedCarryBoost: false,
    gateHint: null as string | null,
    stunRemaining: 0,
    pushReady: true,
  });

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const clipRecorderRef = useRef<ClipRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const roomRef = useRef<RoomSnapshot>(room);
  roomRef.current = room;
  const playerIdRef = useRef<string>(playerId);
  playerIdRef.current = playerId;

  const pushNotification = useCallback((text: string, color: string = "#facc15") => {
    const id = `${Date.now()}_${Math.random()}`;
    setNotifications((prev) => [...prev.slice(-3), { id, text, color, createdAt: Date.now() }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3200);
  }, []);

  useEffect(() => {
    const pid = `p_${Date.now().toString().slice(-5)}_${Math.floor(Math.random() * 899 + 100)}`;
    setPlayerId(pid);
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get("room");
    if (urlRoom && urlRoom.length === 4) {
      setJoinCodeInput(urlRoom.toUpperCase());
    }
    if (
      window.location.host &&
      window.location.hostname !== "localhost" &&
      window.location.protocol.startsWith("http")
    ) {
      setServerHost(window.location.host);
    } else if (window.location.port === "3000") {
      setServerHost(window.location.host);
    }
    // Auto-enable on-screen Android/Touch gamepad if on mobile/touch device
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
      setShowTouchPad(true);
    }
    fetchRoomsList();
  }, []);

  const fetchRoomsList = async () => {
    try {
      const res = await fetch(`/api/rooms`);
      if (res.ok) {
        const data = await res.json();
        setActiveRoomsList(data.rooms || []);
      }
    } catch {
      try {
        const host = window.location.hostname || "localhost";
        const res2 = await fetch(`http://${host}:8000/api/rooms`);
        if (res2.ok) {
          const data = await res2.json();
          setActiveRoomsList(data.rooms || []);
        }
      } catch {}
    }
  };

  const buildLocalRoster = useCallback(
    (
      localId: string,
      localName: string,
      localTeam: TeamId,
      localChar: CharacterId,
      botsCount: number
    ): PlayerData[] => {
      const list: PlayerData[] = [
        {
          id: localId,
          name: localName,
          team: localTeam,
          character: localChar,
          isBot: false,
          pos: [0, 2, 0],
          vel: [0, 0, 0],
          rotY: 0,
          anim: "idle",
          carryingId: null,
          stats: { scores: 0, pushes: 0, times_stunned: 0, grabs: 0, carry_time: 0 },
        },
      ];
      const botNames = [
        "Caboose-Bot",
        "Chief-Bot",
        "PolloLoco",
        "TacoMaster",
        "SargentoRojo",
        "NinjaTorpe",
        "CortanaJr",
      ];
      const botChars: CharacterId[] = ["rooster", "spartan", "ninja", "viking", "dino", "astro"];
      for (let i = 0; i < botsCount; i++) {
        const redCount = list.filter((p) => p.team === "red").length;
        const blueCount = list.filter((p) => p.team === "blue").length;
        const team: TeamId = redCount > blueCount ? "blue" : "red";
        list.push({
          id: `bot_${i + 1}`,
          name: `🤖 ${botNames[i % botNames.length]}`,
          team,
          character: botChars[i % botChars.length],
          isBot: true,
          pos: [0, 2, 0],
          vel: [0, 0, 0],
          rotY: 0,
          anim: "idle",
          carryingId: null,
          stats: { scores: 0, pushes: 0, times_stunned: 0, grabs: 0, carry_time: 0 },
        });
      }
      return list;
    },
    []
  );

  const connectToRoom = useCallback(
    (code: string, initialMode: GameMode = "championship", initialWorld: WorldId = "granja") => {
      const cleanCode = code.trim().toUpperCase().slice(0, 4) || "HALO";
      const pid = playerIdRef.current || `p_${Date.now()}`;
      if (wsRef.current) {
        wsRef.current.close();
      }

      const initialPlayers = buildLocalRoster(pid, playerName, "red", selectedChar, 3);
      const initialSnap: RoomSnapshot = {
        type: "state_snapshot",
        roomCode: cleanCode,
        hostId: pid,
        status: "lobby",
        mode: initialMode,
        currentWorld: initialMode === "championship" ? "granja" : initialWorld,
        roundIndex: 0,
        totalRounds: initialMode === "championship" ? 3 : 1,
        doublePoints: false,
        timeRemaining: 90,
        roundScores: { red: 0, blue: 0 },
        totalScores: { red: 0, blue: 0 },
        roundHistory: [],
        gates: { red_gate: false, blue_gate: false, vault_locked: false },
        players: initialPlayers,
        objects: {},
        botsCount: 3,
        roundDuration: 90,
      };
      setRoom(initialSnap);
      setInRoom(true);

      const query = `player_id=${encodeURIComponent(pid)}&name=${encodeURIComponent(
        playerName
      )}&character=${encodeURIComponent(selectedChar)}`;

      const attachHandlers = (ws: WebSocket, allowFallback8000: boolean) => {
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "welcome") {
              setRoom(msg.room);
            } else if (msg.type === "state_snapshot") {
              setRoom(msg);
              if (sceneManagerRef.current && msg.status === "playing") {
                sceneManagerRef.current.syncFromServerSnapshot(
                  msg.players,
                  msg.gates,
                  msg.objects
                );
              }
            } else if (msg.type === "round_start") {
              setRoom(msg.room);
              startWorldScene(msg.room);
            } else if (msg.type === "round_end") {
              setRoom(msg.room);
            } else if (msg.type === "match_over") {
              setRoom(msg.room);
              if (msg.medals) setMedals(msg.medals);
              confetti({ particleCount: 110, spread: 80, origin: { y: 0.6 } });
            } else if (msg.type === "action_event") {
              if (sceneManagerRef.current && msg.event) {
                sceneManagerRef.current.handleRemoteActionEvent(msg.event);
              }
            }
          } catch {}
        };

        ws.onclose = () => {
          setWsConnected(false);
        };

        ws.onerror = () => {
          if (allowFallback8000 && window.location.protocol === "http:") {
            try {
              const host = window.location.hostname || "localhost";
              const fallbackWs = new WebSocket(`ws://${host}:8000/ws/${cleanCode}?${query}`);
              attachHandlers(fallbackWs, false);
            } catch {
              setWsConnected(false);
            }
          } else {
            setWsConnected(false);
          }
        };
      };

      try {
        const rawHost = (serverHost || window.location.host || "192.168.1.3:3000").trim();
        const forcedWss = rawHost.startsWith("wss://") || rawHost.startsWith("https://");
        const cleanHost = rawHost
          .replace(/^https?:\/\//, "")
          .replace(/^wss?:\/\//, "")
          .replace(/\/$/, "");
        const isLocal =
          cleanHost.startsWith("localhost") ||
          cleanHost.startsWith("127.") ||
          cleanHost.startsWith("192.168.") ||
          cleanHost.startsWith("10.");
        const useWss =
          forcedWss ||
          (window.location.protocol === "https:" && cleanHost === window.location.host) ||
          !isLocal;
        const proto = useWss ? "wss:" : "ws:";
        const primaryUrl = `${proto}//${cleanHost}/ws/${cleanCode}?${query}`;
        const ws = new WebSocket(primaryUrl);
        attachHandlers(ws, true);
      } catch {
        setWsConnected(false);
      }
    },
    [buildLocalRoster, playerName, selectedChar, serverHost]
  );

  const startWorldScene = useCallback(
    async (targetRoom: RoomSnapshot) => {
      if (!canvasContainerRef.current) return;
      const RAPIER = await import("@dimforge/rapier3d-compat");
      await RAPIER.init();

      const { SceneManager: SceneManagerClass } = await import("../engine/SceneManager");

      if (!sceneManagerRef.current) {
        sceneManagerRef.current = new SceneManagerClass(
          canvasContainerRef.current,
          RAPIER,
          {
            onHudUpdate: (hudData) => setHud(hudData),
            onScoreChange: (redScore, blueScore, deltaTeam, deltaPts, scorerId) => {
              const mult = targetRoom.doublePoints ? 2 : 1;
              const finalRed = redScore * mult;
              const finalBlue = blueScore * mult;

              setRoom((prev) => ({
                ...prev,
                roundScores: { red: finalRed, blue: finalBlue },
              }));

              if (deltaTeam && deltaPts) {
                const ptsText = deltaPts * mult;
                pushNotification(
                  `${
                    deltaTeam === "red" ? "🔴 EQUIPO ROJO" : "🔵 EQUIPO AZUL"
                  } +${ptsText} PTS!`,
                  deltaTeam === "red" ? "#f87171" : "#60a5fa"
                );
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(
                    JSON.stringify({
                      type: "action_event",
                      kind: "score_event",
                      team: deltaTeam,
                      points: deltaPts,
                      actorId: scorerId || playerIdRef.current,
                    })
                  );
                }
              }
            },
            onActionEvent: (ev) => {
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "action_event", ...ev }));
              }
            },
            onNotification: (text, color) => pushNotification(text, color),
          }
        );

        clipRecorderRef.current = new ClipRecorder();
        clipRecorderRef.current.startBuffering(sceneManagerRef.current.renderer.domElement);
      }

      const isHost = targetRoom.hostId === playerIdRef.current || !wsConnected;
      sceneManagerRef.current.loadWorld(
        targetRoom.currentWorld,
        playerIdRef.current,
        isHost,
        targetRoom.players
      );
    },
    [pushNotification, wsConnected]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const cur = roomRef.current;
      if (cur.status !== "playing") return;

      if (sceneManagerRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        const payload = sceneManagerRef.current.getNetworkPayload();
        if (payload) {
          payload.roundScores = cur.roundScores;
          wsRef.current.send(JSON.stringify(payload));
        }
      }

      if (!wsConnected) {
        setRoom((prev) => {
          if (prev.status !== "playing") return prev;
          const nextTime = Math.max(0, prev.timeRemaining - 0.05);
          if (nextTime <= 0) {
            const rPts = prev.roundScores.red;
            const bPts = prev.roundScores.blue;
            const newTotal = {
              red: prev.totalScores.red + rPts,
              blue: prev.totalScores.blue + bPts,
            };
            const newHist = [
              ...prev.roundHistory,
              {
                round: prev.roundIndex + 1,
                world: prev.currentWorld,
                red: rPts,
                blue: bPts,
                doublePoints: prev.doublePoints,
              },
            ];
            const isLast =
              prev.mode === "quick" || prev.roundIndex + 1 >= CHAMPIONSHIP_ORDER.length;

            if (isLast) {
              setMedals([
                {
                  title: "Terror del Escenario",
                  icon: "crown",
                  winner: playerName,
                  team: "red",
                  desc: "Dominó los objetivos y llevó a su equipo a la gloria",
                },
                {
                  title: "Culatazo Espartano",
                  icon: "zap",
                  winner: "🤖 Chief-Bot",
                  team: "blue",
                  desc: "Aturdió rivales sin piedad con empujones cuerpo a cuerpo",
                },
                {
                  title: "Saco de Boxeo",
                  icon: "skull",
                  winner: "🤖 Caboose-Bot",
                  team: "red",
                  desc: "Vio estrellitas más veces que nadie en la arena",
                },
                {
                  title: "Manos de Mantequilla",
                  icon: "hand",
                  winner: "🤖 PolloLoco",
                  team: "blue",
                  desc: "Agarró y lanzó todo lo que se movía en el mapa",
                },
              ]);
              confetti({ particleCount: 110, spread: 80, origin: { y: 0.6 } });
            }

            return {
              ...prev,
              timeRemaining: 0,
              totalScores: newTotal,
              roundHistory: newHist,
              status: isLast ? "match_over" : "round_end",
            };
          }
          return { ...prev, timeRemaining: nextTime };
        });
      }
    }, 50);

    return () => clearInterval(interval);
  }, [wsConnected, playerName]);

  const updateLobbyConfig = (
    mode: GameMode,
    world: WorldId,
    botsCount: number,
    roundDuration: number
  ) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "configure_lobby",
          mode,
          world,
          botsCount,
          roundDuration,
        })
      );
    } else {
      const localTeam =
        room.players.find((p) => p.id === playerId)?.team || ("red" as TeamId);
      setRoom((prev) => ({
        ...prev,
        mode,
        currentWorld: mode === "championship" ? "granja" : world,
        totalRounds: mode === "championship" ? 3 : 1,
        botsCount,
        roundDuration,
        timeRemaining: roundDuration,
        players: buildLocalRoster(playerId, playerName, localTeam, selectedChar, botsCount),
      }));
    }
  };

  const handleSelectCharacter = (charId: CharacterId) => {
    setSelectedChar(charId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "select_character", character: charId }));
    } else {
      setRoom((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          p.id === playerId ? { ...p, character: charId } : p
        ),
      }));
    }
  };

  const handleSwitchTeam = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "switch_team" }));
    } else {
      setRoom((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          p.id === playerId ? { ...p, team: p.team === "red" ? "blue" : "red" } : p
        ),
      }));
    }
  };

  const handleStartMatch = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "start_match" }));
    } else {
      const firstWorld: WorldId =
        room.mode === "championship" ? CHAMPIONSHIP_ORDER[0] : room.currentWorld;
      const nextSnap: RoomSnapshot = {
        ...room,
        status: "playing",
        roundIndex: 0,
        currentWorld: firstWorld,
        doublePoints: false,
        timeRemaining: room.roundDuration,
        roundScores: { red: 0, blue: 0 },
        totalScores: { red: 0, blue: 0 },
        roundHistory: [],
      };
      setRoom(nextSnap);
      startWorldScene(nextSnap);
    }
  };

  const handleNextRound = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "next_round" }));
    } else {
      const nextIdx = room.roundIndex + 1;
      const nextWorld = CHAMPIONSHIP_ORDER[nextIdx] || "canyon";
      const isDouble = nextIdx === CHAMPIONSHIP_ORDER.length - 1;
      const nextSnap: RoomSnapshot = {
        ...room,
        status: "playing",
        roundIndex: nextIdx,
        currentWorld: nextWorld,
        doublePoints: isDouble,
        timeRemaining: room.roundDuration,
        roundScores: { red: 0, blue: 0 },
      };
      setRoom(nextSnap);
      startWorldScene(nextSnap);
    }
  };

  const handleReturnToLobby = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "return_lobby" }));
    } else {
      setRoom((prev) => ({
        ...prev,
        status: "lobby",
        roundIndex: 0,
        roundScores: { red: 0, blue: 0 },
        totalScores: { red: 0, blue: 0 },
      }));
    }
  };

  const handleSaveViralClip = () => {
    if (clipRecorderRef.current) {
      const ok = clipRecorderRef.current.saveLast10Seconds(room.roomCode);
      if (ok) {
        setClipSavedToast(true);
        setTimeout(() => setClipSavedToast(false), 3000);
      }
    }
  };

  const formatTime = (secs: number) => {
    const s = Math.max(0, Math.ceil(secs));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? "0" : ""}${rem}`;
  };

  const wMeta = WORLD_META[room.currentWorld] || WORLD_META.granja;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* Persistent 3D WebGL Canvas Container */}
      <div
        ref={canvasContainerRef}
        className="absolute inset-0 w-full h-full z-0"
      />

      {/* ==================== 1. MAIN ENTRY MENU ==================== */}
      {!inRoom && (
        <div className="relative z-20 flex flex-col items-center justify-center w-full h-full px-4 overflow-y-auto py-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-black">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-bold tracking-widest uppercase mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Three.js + Rapier3D + Multijugador Online
            </div>
            <h1 className="text-5xl md:text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 drop-shadow-[0_5px_25px_rgba(251,146,60,0.35)]">
              CHAOS ARENA
            </h1>
            <p className="mt-1.5 text-slate-300 text-sm md:text-base max-w-xl mx-auto">
              Elige tu personaje 3D, crea una sala y comparte el enlace o código de 4 letras con tus amigos.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full max-w-5xl">
            {/* Left Card: Name, 3D Character Picker & Create Room */}
            <div className="lg:col-span-7 bg-slate-900/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-5 md:p-6 shadow-2xl">
              <div className="mb-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  1. Tu Apodo de Jugador
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  maxLength={16}
                  placeholder="Spartan-117"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold text-base focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Character Selector Grid */}
              <div className="mb-5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  2. Elige tu Personaje 3D
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CHARACTER_CATALOG.map((c) => {
                    const active = selectedChar === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedChar(c.id)}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                          active
                            ? "bg-amber-500/20 border-amber-400 text-white shadow-md shadow-amber-500/10"
                            : "bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">{c.emoji}</span>
                          {active && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400 text-slate-950">
                              LISTO
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-xs mt-1">{c.name}</div>
                        <div className="text-[10px] text-slate-400 leading-tight">{c.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2.5">
                <button
                  onClick={() => {
                    const randomCode = Array.from({ length: 4 }, () =>
                      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32))
                    ).join("");
                    connectToRoom(randomCode, "championship", "granja");
                  }}
                  className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-slate-950 font-black text-base shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2.5 transition transform active:scale-95"
                >
                  <Trophy className="w-5 h-5" />
                  CREAR SALA (MODO CAMPEONATO 3 MUNDOS)
                </button>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    onClick={() => connectToRoom("FARM", "quick", "granja")}
                    className="py-2.5 px-3 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-200 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    🐔 Granja 2.0
                  </button>
                  <button
                    onClick={() => connectToRoom("HEIST", "quick", "museo")}
                    className="py-2.5 px-3 rounded-xl bg-amber-600/25 hover:bg-amber-600/40 border border-amber-500/40 text-amber-200 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    🏛️ Museo 2.0
                  </button>
                  <button
                    onClick={() => connectToRoom("GULCH", "quick", "canyon")}
                    className="py-2.5 px-3 rounded-xl bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    🚩 Cañón 2.0
                  </button>
                </div>
              </div>
            </div>

            {/* Right Card: Join by 4-letter Code & Active Online Rooms */}
            <div className="lg:col-span-5 bg-slate-900/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-5 md:p-6 shadow-2xl flex flex-col justify-between">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2 mb-3">
                  <Gamepad2 className="w-5 h-5 text-sky-400" /> Unirse con Código (4 Letras)
                </h2>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    maxLength={4}
                    placeholder="HALO"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-center font-mono font-black text-2xl tracking-widest text-sky-300 uppercase focus:outline-none focus:border-sky-400"
                  />
                  <button
                    onClick={() => connectToRoom(joinCodeInput || "HALO")}
                    className="px-5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black transition"
                  >
                    ENTRAR
                  </button>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      🌐 Servidor Multijugador (Cloud Railway / LAN)
                    </label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setServerHost("chaos-arena-server-production.up.railway.app")
                        }
                        className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400/40 text-[10px] font-bold text-purple-300 hover:bg-purple-500/30"
                      >
                        ☁️ Railway
                      </button>
                      <button
                        type="button"
                        onClick={() => setServerHost("192.168.1.3:3000")}
                        className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/30"
                      >
                        🏠 Wi-Fi LAN
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={serverHost}
                    onChange={(e) => setServerHost(e.target.value)}
                    placeholder="chaos-arena-server-production.up.railway.app"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" /> Salas Abiertas en el Servidor
                  </span>
                  <button
                    onClick={fetchRoomsList}
                    className="text-xs text-sky-400 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Actualizar
                  </button>
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {activeRoomsList.length === 0 ? (
                    <div className="text-xs text-slate-400 bg-slate-950/60 rounded-xl p-3.5 text-center">
                      No hay salas abiertas aún. ¡Crea una sala y pásale el enlace o el código de 4 letras a tu amigo!
                    </div>
                  ) : (
                    activeRoomsList.map((r) => (
                      <div
                        key={r.code}
                        onClick={() => connectToRoom(r.code)}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 cursor-pointer transition"
                      >
                        <div>
                          <span className="font-mono font-black text-amber-400 mr-2">
                            #{r.code}
                          </span>
                          <span className="text-xs text-slate-300">
                            {r.mode === "championship" ? "🏆 Campeonato" : "⚡ Rápida"}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-sky-400">
                          {r.playersCount} jug + {r.botsCount} bots
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 space-y-2.5">
                <a
                  href="/ChaosArena.apk"
                  download="ChaosArena.apk"
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 font-black text-xs flex items-center justify-center gap-2 transition"
                >
                  📲 DESCARGAR APK NATIVO ANDROID (5.4 MB)
                </a>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                  <div className="bg-slate-950/70 p-2 rounded-lg">
                    <b className="text-amber-300">WASD + Space:</b> Mover / Saltar
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded-lg">
                    <b className="text-amber-300">Clic Izq / E:</b> Agarrar / Soltar
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded-lg">
                    <b className="text-amber-300">Clic Der:</b> Cargar y Lanzar
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded-lg">
                    <b className="text-rose-400">F / Shift:</b> Culatazo (Stun 1.5s)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. ROOM LOBBY OVERLAY ==================== */}
      {inRoom && room.status === "lobby" && (
        <div className="relative z-20 flex flex-col items-center justify-center w-full h-full px-4 overflow-y-auto py-6 bg-slate-950/90 backdrop-blur-md">
          <div className="w-full max-w-5xl bg-slate-900 border border-slate-700/80 rounded-3xl p-6 md:p-7 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800">
              <div className="flex items-center gap-4">
                <div className="bg-slate-950 border-2 border-amber-400/60 rounded-2xl px-5 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    CÓDIGO DE SALA
                  </div>
                  <div className="text-3xl font-mono font-black tracking-widest text-amber-300">
                    {room.roomCode}
                  </div>
                </div>

                <button
                  onClick={() => {
                    const url = `${window.location.origin}?room=${room.roomCode}`;
                    navigator.clipboard.writeText(url);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" /> ¡Link de Invitación Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copiar Link para Amigo
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                    wsConnected
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      wsConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                    }`}
                  />
                  {wsConnected ? "Online WebSocket Conectado (20Hz)" : "Servidor Local Activo"}
                </span>

                <button
                  onClick={() => {
                    wsRef.current?.close();
                    setInRoom(false);
                  }}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 transition"
                  title="Salir de la sala"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-5">
              {/* Left 7 cols */}
              <div className="lg:col-span-7 space-y-4">
                {/* Character Quick Switcher in Lobby */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Tu Personaje 3D
                  </label>
                  <div className="grid grid-cols-6 gap-1.5">
                    {CHARACTER_CATALOG.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleSelectCharacter(c.id)}
                        className={`p-2 rounded-xl border text-center transition ${
                          selectedChar === c.id
                            ? "bg-amber-500/20 border-amber-400 text-white"
                            : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="text-xl">{c.emoji}</div>
                        <div className="text-[10px] font-bold truncate mt-0.5">{c.name}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Modo de Juego y Escenario
                  </label>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <button
                      onClick={() =>
                        updateLobbyConfig(
                          "championship",
                          room.currentWorld,
                          room.botsCount,
                          room.roundDuration
                        )
                      }
                      className={`p-3.5 rounded-2xl border text-left transition ${
                        room.mode === "championship"
                          ? "bg-amber-500/15 border-amber-400 text-white"
                          : "bg-slate-950/60 border-slate-800 text-slate-400"
                      }`}
                    >
                      <div className="font-black text-sm flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400" /> Modo Campeonato (3 Rondas)
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Granja 2.0 → Museo 2.0 → Cañón 2.0 (<b className="text-amber-300">x2 PTS</b>)
                      </p>
                    </button>

                    <button
                      onClick={() =>
                        updateLobbyConfig(
                          "quick",
                          room.currentWorld,
                          room.botsCount,
                          room.roundDuration
                        )
                      }
                      className={`p-3.5 rounded-2xl border text-left transition ${
                        room.mode === "quick"
                          ? "bg-sky-500/15 border-sky-400 text-white"
                          : "bg-slate-950/60 border-slate-800 text-slate-400"
                      }`}
                    >
                      <div className="font-black text-sm flex items-center gap-2">
                        <Zap className="w-4 h-4 text-sky-400" /> Partida Rápida
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Elige cualquiera de los 3 mapas complejos abajo.
                      </p>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    {(["granja", "museo", "canyon"] as WorldId[]).map((wid, idx) => {
                      const m = WORLD_META[wid];
                      const selected =
                        room.mode === "championship" || room.currentWorld === wid;
                      return (
                        <div
                          key={wid}
                          onClick={() => {
                            if (room.mode === "quick") {
                              updateLobbyConfig(
                                "quick",
                                wid,
                                room.botsCount,
                                room.roundDuration
                              );
                            }
                          }}
                          className={`p-3 rounded-2xl border transition cursor-pointer ${
                            selected
                              ? "bg-slate-800/90 border-amber-400/70 text-white"
                              : "bg-slate-950/50 border-slate-800 text-slate-400 opacity-60 hover:opacity-100"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-2xl">{m.emoji}</span>
                            {room.mode === "championship" && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-950 text-amber-300">
                                {idx === 2 ? "R3 (x2 PTS)" : `Ronda ${idx + 1}`}
                              </span>
                            )}
                          </div>
                          <div className="font-bold text-xs">{m.name}</div>
                          <div className="text-[10px] text-amber-300/90 font-semibold">
                            {m.tag}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bots & Duration */}
                <div className="grid grid-cols-2 gap-4 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">
                      Bots con IA en la Sala: <b className="text-amber-300">{room.botsCount}</b>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={7}
                      value={room.botsCount}
                      onChange={(e) =>
                        updateLobbyConfig(
                          room.mode,
                          room.currentWorld,
                          parseInt(e.target.value, 10),
                          room.roundDuration
                        )
                      }
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">
                      Duración por Ronda: <b className="text-sky-300">{room.roundDuration}s</b>
                    </label>
                    <div className="flex gap-1.5 mt-1">
                      {[60, 90, 120, 180].map((sec) => (
                        <button
                          key={sec}
                          onClick={() =>
                            updateLobbyConfig(
                              room.mode,
                              room.currentWorld,
                              room.botsCount,
                              sec
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            room.roundDuration === sec
                              ? "bg-sky-500 text-slate-950"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 5 cols: Team Rosters with Character Badges */}
              <div className="lg:col-span-5 flex flex-col justify-between bg-slate-950/80 border border-slate-800 rounded-2xl p-5">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-300 flex items-center gap-2">
                      <Users className="w-4 h-4 text-amber-400" /> Equipos ({room.players.length})
                    </h3>
                    <button
                      onClick={handleSwitchTeam}
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-300 transition"
                    >
                      ⇄ Cambiar mi Equipo
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Red Team */}
                    <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-3">
                      <div className="text-xs font-black uppercase text-rose-400 mb-2">
                        🔴 EQUIPO ROJO
                      </div>
                      <div className="space-y-1.5">
                        {room.players
                          .filter((p) => p.team === "red")
                          .map((p) => {
                            const ch =
                              CHARACTER_CATALOG.find((c) => c.id === p.character) ||
                              CHARACTER_CATALOG[0];
                            return (
                              <div
                                key={p.id}
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-rose-950/60 text-rose-100 flex items-center justify-between gap-1"
                              >
                                <span className="truncate">
                                  {ch.emoji} {p.name}
                                </span>
                                {p.id === playerId && (
                                  <span className="text-[10px] px-1.5 rounded bg-amber-400 text-slate-950 font-black">
                                    TÚ
                                  </span>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* Blue Team */}
                    <div className="bg-sky-950/30 border border-sky-500/30 rounded-xl p-3">
                      <div className="text-xs font-black uppercase text-sky-400 mb-2">
                        🔵 EQUIPO AZUL
                      </div>
                      <div className="space-y-1.5">
                        {room.players
                          .filter((p) => p.team === "blue")
                          .map((p) => {
                            const ch =
                              CHARACTER_CATALOG.find((c) => c.id === p.character) ||
                              CHARACTER_CATALOG[0];
                            return (
                              <div
                                key={p.id}
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-sky-950/60 text-sky-100 flex items-center justify-between gap-1"
                              >
                                <span className="truncate">
                                  {ch.emoji} {p.name}
                                </span>
                                {p.id === playerId && (
                                  <span className="text-[10px] px-1.5 rounded bg-amber-400 text-slate-950 font-black">
                                    TÚ
                                  </span>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleStartMatch}
                  className="mt-6 w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 hover:from-emerald-300 hover:to-sky-300 text-slate-950 font-black text-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3 transition transform active:scale-95"
                >
                  <Play className="w-6 h-6 fill-current" /> ¡INICIAR PARTIDA AHORA!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 3. IN-GAME HUD ==================== */}
      {inRoom && room.status === "playing" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="pointer-events-auto flex flex-col gap-2">
              <div className="flex items-center gap-2 bg-slate-900/85 backdrop-blur-md border border-slate-700/80 px-3.5 py-2 rounded-2xl">
                <span className="text-xs font-bold text-slate-400">SALA</span>
                <span className="font-mono font-black text-amber-400 text-base">
                  #{room.roomCode}
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-xs font-extrabold text-sky-300">
                  {room.mode === "championship"
                    ? `🏆 RONDA ${room.roundIndex + 1}/${room.totalRounds}`
                    : "⚡ PARTIDA RÁPIDA"}
                </span>
                {room.doublePoints && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] animate-bounce">
                    ¡PUNTOS DOBLES x2!
                  </span>
                )}
              </div>

              <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 px-3.5 py-2 rounded-xl max-w-xs">
                <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <span>{wMeta.emoji}</span>
                  <span>{wMeta.name}</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-tight mt-0.5">
                  {wMeta.desc}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-900/90 backdrop-blur-xl border-2 border-slate-700/80 px-6 py-2.5 rounded-3xl shadow-2xl">
              <div className="text-center min-w-[72px]">
                <div className="text-[10px] font-black uppercase tracking-widest text-rose-400">
                  ROJO
                </div>
                <div className="text-3xl md:text-4xl font-black text-rose-500">
                  {room.roundScores.red}
                </div>
              </div>

              <div
                className={`px-5 py-1.5 rounded-2xl border text-center ${
                  room.timeRemaining <= 10
                    ? "bg-rose-950/90 border-rose-500 text-rose-300 animate-pulse"
                    : "bg-slate-950 border-slate-800 text-white"
                }`}
              >
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  TIEMPO
                </div>
                <div className="text-2xl md:text-3xl font-mono font-black">
                  {formatTime(room.timeRemaining)}
                </div>
              </div>

              <div className="text-center min-w-[72px]">
                <div className="text-[10px] font-black uppercase tracking-widest text-sky-400">
                  AZUL
                </div>
                <div className="text-3xl md:text-4xl font-black text-sky-400">
                  {room.roundScores.blue}
                </div>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <button
                onClick={handleSaveViralClip}
                className="px-3.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-rose-600/30 transition"
                title="Descargar video WebM de los últimos 10 segundos"
              >
                <Video className="w-4 h-4" /> Guardar Clip (10s)
              </button>

              <button
                onClick={() => {
                  soundFX.muted = !muted;
                  setMuted(!muted);
                }}
                className="p-2.5 rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-slate-700 text-slate-200 transition"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setShowTouchPad((v) => !v)}
                className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition ${
                  showTouchPad
                    ? "bg-amber-400 text-slate-950 border-amber-300"
                    : "bg-slate-900/85 text-slate-300 border-slate-700 hover:bg-slate-800"
                }`}
                title="Mostrar u ocultar Joystick y Botones Táctiles de Android"
              >
                📱 Touch
              </button>

              <button
                onClick={handleReturnToLobby}
                className="px-3 py-2.5 rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold transition"
              >
                Lobby
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 my-auto">
            {clipSavedToast && (
              <div className="px-4 py-2 rounded-full bg-emerald-500 text-slate-950 font-black text-sm shadow-lg">
                🎬 ¡Clip viral de los últimos 10s descargado en formato .webm!
              </div>
            )}

            {hud.stunRemaining > 0 && (
              <div className="px-5 py-2.5 rounded-2xl bg-amber-400 text-slate-950 font-black text-base shadow-xl animate-bounce flex items-center gap-2">
                💫 ¡ATURDIDO! ({hud.stunRemaining.toFixed(1)}s)
              </div>
            )}

            {hud.gateHint && (
              <div className="px-4 py-2 rounded-xl bg-slate-900/95 border border-amber-400 text-amber-300 font-bold text-sm shadow-lg">
                {hud.gateHint}
              </div>
            )}

            {notifications.map((n) => (
              <div
                key={n.id}
                style={{ borderColor: n.color, color: n.color }}
                className="px-4 py-1.5 rounded-full bg-slate-950/90 border font-black text-sm shadow-lg"
              >
                {n.text}
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-3">
            {hud.carryingName && (
              <div className="bg-slate-900/95 border border-amber-400/60 px-5 py-3 rounded-2xl shadow-xl flex flex-col items-center gap-2 min-w-[290px]">
                <div className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-2">
                  <span>📦 Cargando: {hud.carryingName}</span>
                </div>

                {hud.carryingName.includes("Reliquia Pesada") && (
                  <div
                    className={`text-xs font-extrabold px-3 py-1 rounded-lg ${
                      hud.sharedCarryBoost
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                    }`}
                  >
                    {hud.sharedCarryBoost
                      ? "🤝 ¡PESO COMPARTIDO CON ALIADO! (90% Velocidad)"
                      : "⚠️ MUY PESADA (40% Vel) — ¡Acércate a un aliado para ir al 90%!"}
                  </div>
                )}

                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 transition-all duration-75"
                    style={{ width: `${Math.round(hud.throwCharge * 100)}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-400">
                  Mantén <b>[Clic Derecho]</b> o <b>[E]</b> para cargar lanzamiento
                </div>
              </div>
            )}

            {!showTouchPad && (
              <div className="bg-slate-900/85 backdrop-blur-md border border-slate-800 px-5 py-2.5 rounded-2xl flex flex-wrap items-center justify-center gap-4 text-xs text-slate-300">
                <div>
                  <kbd className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold">
                    WASD
                  </kbd>{" "}
                  +{" "}
                  <kbd className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold">
                    Espacio
                  </kbd>{" "}
                  Mover / Saltar
                </div>
                <div>
                  <kbd className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold">
                    Clic Izq / E
                  </kbd>{" "}
                  Agarrar / Soltar
                </div>
                <div>
                  <kbd className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold">
                    Clic Der
                  </kbd>{" "}
                  Lanzar con Fuerza
                </div>
                <div className={hud.pushReady ? "text-emerald-300 font-bold" : "text-slate-500"}>
                  <kbd className="px-2 py-0.5 rounded bg-slate-800 text-rose-400 font-bold">
                    F / Shift
                  </kbd>{" "}
                  Culatazo Stun {hud.pushReady ? "(LISTO)" : "(Recargando...)"}
                </div>
                {room.currentWorld === "granja" && (
                  <div>
                    <kbd className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-bold">
                      Q
                    </kbd>{" "}
                    Abrir/Cerrar Corral
                  </div>
                )}
              </div>
            )}
          </div>

          {showTouchPad && (
            <MobileControls
              sceneManager={sceneManagerRef.current}
              hasCarriedItem={Boolean(hud.carryingName)}
              pushReady={hud.pushReady}
              showGateButton={Boolean(hud.gateHint)}
            />
          )}
        </div>
      )}

      {/* ==================== 4. BETWEEN-ROUNDS CHAMPIONSHIP SUMMARY ==================== */}
      {inRoom && room.status === "round_end" && (
        <div className="relative z-20 flex flex-col items-center justify-center w-full h-full px-4 bg-slate-950/90 backdrop-blur-lg">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl p-8 text-center shadow-2xl">
            <div className="text-xs font-black uppercase tracking-widest text-amber-400 mb-1">
              FIN DE LA RONDA {room.roundIndex + 1} DE {room.totalRounds}
            </div>
            <h2 className="text-4xl font-black text-white mb-6">
              Marcador Acumulado del Campeonato
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-500/40">
                <div className="text-xs font-black text-rose-400 uppercase">EQUIPO ROJO</div>
                <div className="text-5xl font-black text-rose-500 mt-1">
                  {room.totalScores.red}
                </div>
                <div className="text-xs text-rose-300 mt-1">
                  (+{room.roundScores.red} pts en esta ronda)
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-sky-950/40 border border-sky-500/40">
                <div className="text-xs font-black text-sky-400 uppercase">EQUIPO AZUL</div>
                <div className="text-5xl font-black text-sky-400 mt-1">
                  {room.totalScores.blue}
                </div>
                <div className="text-xs text-sky-300 mt-1">
                  (+{room.roundScores.blue} pts en esta ronda)
                </div>
              </div>
            </div>

            {room.roundIndex + 1 === room.totalRounds - 1 && (
              <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/50 text-amber-300 font-bold text-sm mb-6">
                🔥 ¡LA SIGUIENTE ES LA RONDA FINAL! Todos los objetivos valen{" "}
                <b>PUNTOS DOBLES (x2)</b>.
              </div>
            )}

            <button
              onClick={handleNextRound}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-lg flex items-center justify-center gap-2 transition"
            >
              SIGUIENTE MUNDO DEL CAMPEONATO <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* ==================== 5. MATCH OVER PODIUM & COMIC MEDALS ==================== */}
      {inRoom && room.status === "match_over" && (
        <div className="relative z-20 flex flex-col items-center justify-center w-full h-full px-4 bg-slate-950/92 backdrop-blur-xl">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-3xl p-6 md:p-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-black uppercase mb-2">
                <Crown className="w-4 h-4" /> Partida Finalizada
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-white">
                {(room.mode === "championship" ? room.totalScores.red : room.roundScores.red) >
                (room.mode === "championship" ? room.totalScores.blue : room.roundScores.blue)
                  ? "🏆 ¡VICTORIA DEL EQUIPO ROJO!"
                  : (room.mode === "championship"
                      ? room.totalScores.blue
                      : room.roundScores.blue) >
                    (room.mode === "championship" ? room.totalScores.red : room.roundScores.red)
                  ? "🏆 ¡VICTORIA DEL EQUIPO AZUL!"
                  : "🤝 ¡EMPATE ÉPICO EN LA ARENA!"}
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Marcador Final:{" "}
                <b className="text-rose-400">
                  Rojo{" "}
                  {room.mode === "championship" ? room.totalScores.red : room.roundScores.red}
                </b>{" "}
                —{" "}
                <b className="text-sky-400">
                  Azul{" "}
                  {room.mode === "championship"
                    ? room.totalScores.blue
                    : room.roundScores.blue}
                </b>
              </p>
            </div>

            <div className="mb-6">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 text-center mb-3">
                🎖️ Medallas Cómicas de la Partida
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {medals.map((m, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-xs font-black uppercase text-amber-400 mb-1">
                        🏅 {m.title}
                      </div>
                      <div
                        className={`text-base font-black ${
                          m.team === "red" ? "text-rose-400" : "text-sky-400"
                        }`}
                      >
                        {m.winner}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{m.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={handleSaveViralClip}
                className="px-6 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm flex items-center gap-2 transition"
              >
                <Video className="w-5 h-5" /> Descargar Clip Final (.webm)
              </button>

              <button
                onClick={handleStartMatch}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black text-sm flex items-center gap-2 transition"
              >
                <Swords className="w-5 h-5" /> Revancha Inmediata
              </button>

              <button
                onClick={handleReturnToLobby}
                className="px-6 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition"
              >
                Volver al Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
