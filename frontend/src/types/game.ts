import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";

export type WorldId = "granja" | "museo" | "canyon";
export type GameMode = "quick" | "championship";
export type TeamId = "red" | "blue";
export type AnimState = "idle" | "run" | "carrying" | "stunned";
export type CharacterId = "spartan" | "rooster" | "ninja" | "viking" | "dino" | "astro";

export interface PlayerStats {
  scores: number;
  pushes: number;
  times_stunned: number;
  grabs: number;
  carry_time: number;
}

export interface PlayerData {
  id: string;
  name: string;
  team: TeamId;
  character: CharacterId;
  isBot: boolean;
  pos: [number, number, number];
  vel: [number, number, number];
  rotY: number;
  anim: AnimState;
  carryingId: string | null;
  stats?: PlayerStats;
}

export interface InteractiveObject {
  id: string;
  kind: "chicken" | "golden_chicken" | "relic_heavy" | "gem" | "flag_red" | "flag_blue" | "power_core";
  points: number;
  weight: number; // 1 = normal, 2.5 = heavy shared weight
  pos: [number, number, number];
  vel: [number, number, number];
  rotY: number;
  carrierId: string | null;
  helperId: string | null; // Second teammate helping carry heavy object
  inZone: TeamId | null;   // If currently inside a scoring corral/zone
  mesh?: THREE.Object3D;
  body?: RAPIER.RigidBody;
  aiTimer?: number;
  aiDir?: [number, number];
}

export interface RoundHistoryEntry {
  round: number;
  world: WorldId;
  red: number;
  blue: number;
  doublePoints: boolean;
}

export interface Medal {
  title: string;
  icon: string;
  winner: string;
  team: TeamId;
  desc: string;
}

export interface RoomSnapshot {
  type: string;
  roomCode: string;
  hostId: string;
  status: "lobby" | "playing" | "round_end" | "match_over";
  mode: GameMode;
  currentWorld: WorldId;
  roundIndex: number;
  totalRounds: number;
  doublePoints: boolean;
  timeRemaining: number;
  roundScores: { red: number; blue: number };
  totalScores: { red: number; blue: number };
  roundHistory: RoundHistoryEntry[];
  gates: {
    red_gate: boolean;
    blue_gate: boolean;
    vault_locked: boolean;
  };
  players: PlayerData[];
  objects: Record<string, any>;
  botsCount: number;
  roundDuration: number;
}

export interface HudNotification {
  id: string;
  text: string;
  color: string;
  createdAt: number;
}

export interface IWorldModule {
  id: WorldId;
  name: string;
  subtitle: string;
  init(
    scene: THREE.Scene,
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    isHost: boolean
  ): InteractiveObject[];
  update(
    dt: number,
    elapsedTime: number,
    objects: InteractiveObject[],
    players: Map<string, { pos: THREE.Vector3; team: TeamId; id: string; stunnedUntil: number; body?: RAPIER.RigidBody }>,
    gates: { red_gate: boolean; blue_gate: boolean; vault_locked: boolean },
    callbacks: {
      onScoreChange: (redScore: number, blueScore: number, deltaTeam?: TeamId, deltaPts?: number, scorerId?: string) => void;
      onLaserTrip: (playerId: string, pos: THREE.Vector3) => void;
      onGateHint: (hintText: string | null) => void;
    }
  ): void;
  getSpawnPoint(team: TeamId, index: number): [number, number, number];
  getGoalPosition(team: TeamId): THREE.Vector3;
  dispose(scene: THREE.Scene, physicsWorld: RAPIER.World): void;
}
