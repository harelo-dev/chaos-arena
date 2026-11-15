import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import {
  AnimState,
  CharacterId,
  InteractiveObject,
  IWorldModule,
  PlayerData,
  TeamId,
  WorldId,
} from "../types/game";
import { CharacterVisual } from "./CharacterMesh";
import { ParticleSystem } from "./ParticleSystem";
import { soundFX } from "./SoundFX";
import { WorldGranja } from "../worlds/WorldGranja";
import { WorldMuseo } from "../worlds/WorldMuseo";
import { WorldCanyon } from "../worlds/WorldCanyon";

interface RuntimePlayer {
  id: string;
  name: string;
  team: TeamId;
  character: CharacterId;
  isBot: boolean;
  isLocal: boolean;
  pos: THREE.Vector3;
  targetPos: THREE.Vector3;
  vel: THREE.Vector3;
  rotY: number;
  targetRotY: number;
  anim: AnimState;
  carryingId: string | null;
  stunnedUntil: number;
  pushCooldownUntil: number;
  pushAnimProgress: number;
  visual: CharacterVisual;
  body?: RAPIER.RigidBody;
  botTargetId?: string | null;
  botJumpTimer?: number;
}

export interface SceneCallbacks {
  onHudUpdate: (data: {
    throwCharge: number;
    carryingName: string | null;
    sharedCarryBoost: boolean;
    gateHint: string | null;
    stunRemaining: number;
    pushReady: boolean;
  }) => void;
  onScoreChange: (
    redScore: number,
    blueScore: number,
    deltaTeam?: TeamId,
    deltaPts?: number,
    scorerId?: string
  ) => void;
  onActionEvent: (event: Record<string, unknown>) => void;
  onNotification: (text: string, color?: string) => void;
}

export class SceneManager {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  private rapier: typeof RAPIER;
  private physicsWorld: RAPIER.World;
  private particles: ParticleSystem;
  private currentWorldModule: IWorldModule | null = null;

  private players: Map<string, RuntimePlayer> = new Map();
  private objects: InteractiveObject[] = [];
  private synergyLine: THREE.Line | null = null;

  private localPlayerId: string = "";
  private isHost: boolean = true;
  private gates = { red_gate: false, blue_gate: false, vault_locked: false };
  private callbacks: SceneCallbacks;

  // Input state
  private keys: Set<string> = new Set();
  private mobileMoveX: number = 0;
  private mobileMoveZ: number = 0;
  private mobileJumpRequested: boolean = false;
  private cameraYaw: number = 0;
  private cameraPitch: number = 0.38;
  private lastManualCameraTime: number = -10;
  private isChargingThrow: boolean = false;
  private throwCharge: number = 0;
  private elapsedTime: number = 0;
  private animFrameId: number = 0;
  private lastFrameTime: number = performance.now();
  private disposed: boolean = false;

  constructor(
    container: HTMLElement,
    rapierModule: typeof RAPIER,
    callbacks: SceneCallbacks
  ) {
    this.rapier = rapierModule;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      62,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      260
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.innerHTML = "";
    container.appendChild(this.renderer.domElement);

    this.physicsWorld = new this.rapier.World({ x: 0.0, y: -22.0, z: 0.0 });
    this.particles = new ParticleSystem(this.scene);

    // Synergy beam for Shared Weight carrying in Museum
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x4ade80, linewidth: 3 });
    this.synergyLine = new THREE.Line(lineGeo, lineMat);
    this.synergyLine.visible = false;
    this.scene.add(this.synergyLine);

    this.bindInputs(container);
    this.startLoop();
  }

  private bindInputs(container: HTMLElement) {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      const code = e.code;
      this.keys.add(code);

      if (code === "KeyE") {
        const local = this.players.get(this.localPlayerId);
        if (local && local.carryingId) {
          this.isChargingThrow = true;
        } else {
          this.tryGrabOrDrop();
        }
      } else if (code === "KeyF" || code === "ShiftLeft" || code === "ShiftRight") {
        this.tryMeleePush();
      } else if (code === "KeyQ") {
        this.tryToggleNearestGate();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      this.keys.delete(code);
      if (code === "KeyE" && this.isChargingThrow) {
        this.releaseThrow();
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        // Left click: Grab or drop
        this.tryGrabOrDrop();
      } else if (e.button === 2) {
        // Right click: Charge throw if carrying, else melee push
        const local = this.players.get(this.localPlayerId);
        if (local && local.carryingId) {
          this.isChargingThrow = true;
        } else {
          this.tryMeleePush();
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2 && this.isChargingThrow) {
        this.releaseThrow();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (e.buttons === 1 || document.pointerLockElement === this.renderer.domElement) {
        this.cameraYaw -= e.movementX * 0.0045;
        this.cameraPitch = Math.max(
          0.16,
          Math.min(1.15, this.cameraPitch + e.movementY * 0.0035)
        );
        this.lastManualCameraTime = this.elapsedTime;
      }
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onResize = () => {
      if (!container) return;
      this.camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this.renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    this.renderer.domElement.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("resize", onResize);

    // Touch Camera Orbit on Canvas (for Android / Mobile)
    let lastTouchX = 0;
    let lastTouchY = 0;
    this.renderer.domElement.addEventListener(
      "touchstart",
      (e: TouchEvent) => {
        if (e.touches.length > 0) {
          const t = e.touches[e.touches.length - 1];
          lastTouchX = t.clientX;
          lastTouchY = t.clientY;
        }
      },
      { passive: true }
    );
    this.renderer.domElement.addEventListener(
      "touchmove",
      (e: TouchEvent) => {
        if (e.touches.length > 0) {
          const t = e.touches[e.touches.length - 1];
          const dx = t.clientX - lastTouchX;
          const dy = t.clientY - lastTouchY;
          lastTouchX = t.clientX;
          lastTouchY = t.clientY;
          this.cameraYaw -= dx * 0.006;
          this.cameraPitch = Math.max(0.16, Math.min(1.15, this.cameraPitch + dy * 0.0045));
          this.lastManualCameraTime = this.elapsedTime;
        }
      },
      { passive: true }
    );
  }

  // Mobile / Android Public Control API
  public setMobileMoveVector(x: number, z: number) {
    this.mobileMoveX = x;
    this.mobileMoveZ = z;
  }

  public triggerMobileJump() {
    this.mobileJumpRequested = true;
  }

  public triggerMobileGrab() {
    this.tryGrabOrDrop();
  }

  public startMobileThrowCharge() {
    const local = this.players.get(this.localPlayerId);
    if (local && local.carryingId) {
      this.isChargingThrow = true;
    } else {
      this.tryGrabOrDrop();
    }
  }

  public releaseMobileThrow() {
    if (this.isChargingThrow) {
      this.releaseThrow();
    }
  }

  public triggerMobilePush() {
    this.tryMeleePush();
  }

  public triggerMobileGate() {
    this.tryToggleNearestGate();
  }

  public loadWorld(
    worldId: WorldId,
    localPlayerId: string,
    isHost: boolean,
    roster: PlayerData[]
  ) {
    this.localPlayerId = localPlayerId;
    this.isHost = isHost;

    // Clean up previous world & players
    if (this.currentWorldModule) {
      this.currentWorldModule.dispose(this.scene, this.physicsWorld);
    }
    this.particles.clear();
    this.players.forEach((p) => {
      this.scene.remove(p.visual.group);
    });
    this.players.clear();
    this.objects = [];

    // Re-create clean Rapier physics world
    this.physicsWorld = new this.rapier.World({ x: 0.0, y: -22.0, z: 0.0 });

    if (worldId === "granja") {
      this.currentWorldModule = new WorldGranja();
    } else if (worldId === "museo") {
      this.currentWorldModule = new WorldMuseo();
    } else {
      this.currentWorldModule = new WorldCanyon();
    }

    this.objects = this.currentWorldModule.init(
      this.scene,
      this.physicsWorld,
      this.rapier,
      isHost
    );

    // Spawn players
    let redIdx = 0;
    let blueIdx = 0;
    for (const pdata of roster) {
      const idx = pdata.team === "red" ? redIdx++ : blueIdx++;
      const spawn = this.currentWorldModule.getSpawnPoint(pdata.team, idx);
      const rp = this.ensurePlayerEntity(pdata, spawn);
      // Orient players toward the center of the arena on spawn
      rp.rotY = pdata.team === "red" ? Math.PI / 2 : -Math.PI / 2;
      rp.targetRotY = rp.rotY;
    }

    const local = this.players.get(this.localPlayerId);
    if (local) {
      // Position camera directly behind the character's back looking forward
      this.cameraYaw = local.rotY + Math.PI;
      this.cameraPitch = 0.36;
      this.lastManualCameraTime = -10;
    } else {
      this.cameraYaw = 0;
    }
  }

  private ensurePlayerEntity(
    pdata: PlayerData,
    spawnOverride?: [number, number, number]
  ): RuntimePlayer {
    let rp = this.players.get(pdata.id);
    if (rp) return rp;

    const isLocal = pdata.id === this.localPlayerId;
    const posArr = spawnOverride || pdata.pos || [0, 2, 0];
    const charId: CharacterId = pdata.character || "spartan";
    const visual = new CharacterVisual(pdata.name, pdata.team, charId, isLocal);
    visual.group.position.set(posArr[0], posArr[1], posArr[2]);
    this.scene.add(visual.group);

    let body: RAPIER.RigidBody | undefined;
    if (isLocal || (pdata.isBot && this.isHost)) {
      const rbDesc = this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(posArr[0], posArr[1], posArr[2])
        .lockRotations()
        .setLinearDamping(3.0);
      body = this.physicsWorld.createRigidBody(rbDesc);
      const colDesc = this.rapier.ColliderDesc.capsule(0.45, 0.45)
        .setFriction(0.2)
        .setRestitution(0.35);
      this.physicsWorld.createCollider(colDesc, body);
    }

    rp = {
      id: pdata.id,
      name: pdata.name,
      team: pdata.team,
      character: charId,
      isBot: pdata.isBot,
      isLocal,
      pos: new THREE.Vector3(posArr[0], posArr[1], posArr[2]),
      targetPos: new THREE.Vector3(posArr[0], posArr[1], posArr[2]),
      vel: new THREE.Vector3(),
      rotY: pdata.rotY || 0,
      targetRotY: pdata.rotY || 0,
      anim: "idle",
      carryingId: null,
      stunnedUntil: 0,
      pushCooldownUntil: 0,
      pushAnimProgress: 0,
      visual,
      body,
    };

    this.players.set(pdata.id, rp);
    return rp;
  }

  public syncFromServerSnapshot(
    playersData: PlayerData[],
    gates: { red_gate: boolean; blue_gate: boolean; vault_locked: boolean },
    objectsSnapshot?: Record<string, any>
  ) {
    this.gates = gates;

    const seenIds = new Set<string>();
    for (const pd of playersData) {
      seenIds.add(pd.id);
      const rp = this.ensurePlayerEntity(pd);
      if (!rp.isLocal && !(rp.isBot && this.isHost)) {
        rp.targetPos.set(pd.pos[0], pd.pos[1], pd.pos[2]);
        rp.targetRotY = pd.rotY;
        rp.anim = pd.anim;
        rp.carryingId = pd.carryingId;
      }
    }

    // Remove disconnected players
    this.players.forEach((rp, id) => {
      if (!seenIds.has(id)) {
        this.scene.remove(rp.visual.group);
        if (rp.body) {
          try {
            this.physicsWorld.removeRigidBody(rp.body);
          } catch {}
        }
        this.players.delete(id);
      }
    });

    // Non-host syncs objects from host snapshot
    if (!this.isHost && objectsSnapshot) {
      for (const obj of this.objects) {
        const snap = objectsSnapshot[obj.id];
        if (snap && obj.body && obj.mesh) {
          obj.carrierId = snap.carrierId;
          obj.helperId = snap.helperId;
          if (!obj.carrierId) {
            obj.body.setTranslation(
              { x: snap.pos[0], y: snap.pos[1], z: snap.pos[2] },
              true
            );
          }
        }
      }
    }
  }

  public handleRemoteActionEvent(ev: Record<string, any>) {
    const kind = ev.kind;
    if (kind === "push_hit") {
      const targetId = ev.targetId as string;
      const dir = ev.dir as [number, number] | undefined;
      const target = this.players.get(targetId);
      if (target) {
        target.stunnedUntil = this.elapsedTime + 1.5;
        target.anim = "stunned";
        if (target.carryingId) {
          this.dropObject(target);
        }
        if (target.body && dir) {
          target.body.setLinvel({ x: dir[0] * 14, y: 6.5, z: dir[1] * 14 }, true);
        }
        this.particles.spawnImpactBurst(
          target.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
          0xfacc15
        );
        soundFX.stun();
      }
    } else if (kind === "toggle_gate") {
      soundFX.gateToggle();
    }
  }

  private tryGrabOrDrop() {
    const local = this.players.get(this.localPlayerId);
    if (!local || this.elapsedTime < local.stunnedUntil) return;

    if (local.carryingId) {
      // Drop gently
      this.dropObject(local, 3.0);
      soundFX.grab();
      return;
    }

    // Find nearest interactive object within 2.7m
    let nearest: InteractiveObject | null = null;
    let bestDist = 2.7;

    for (const obj of this.objects) {
      const d = Math.hypot(
        obj.pos[0] - local.pos.x,
        obj.pos[1] - local.pos.y,
        obj.pos[2] - local.pos.z
      );
      if (d < bestDist) {
        bestDist = d;
        nearest = obj;
      }
    }

    if (nearest) {
      // If it's the Heavy Relic already carried by a friendly teammate, join as helper!
      if (nearest.carrierId && nearest.carrierId !== local.id) {
        const carrier = this.players.get(nearest.carrierId);
        if (carrier && carrier.team === local.team && nearest.weight > 1.5) {
          nearest.helperId = local.id;
          local.carryingId = nearest.id;
          soundFX.grab();
          this.callbacks.onNotification(
            "🤝 ¡PESO COMPARTIDO ACTIVO! Velocidad al 90%",
            "#4ade80"
          );
          return;
        }
      }

      if (!nearest.carrierId) {
        nearest.carrierId = local.id;
        nearest.helperId = null;
        local.carryingId = nearest.id;
        if (nearest.kind === "chicken" || nearest.kind === "golden_chicken") {
          soundFX.cluck();
        } else {
          soundFX.grab();
        }
        this.callbacks.onActionEvent({
          kind: "grab",
          actorId: local.id,
          objectId: nearest.id,
        });
      }
    }
  }

  private dropObject(player: RuntimePlayer, forwardImpulse: number = 0) {
    if (!player.carryingId) return;
    const obj = this.objects.find((o) => o.id === player.carryingId);
    player.carryingId = null;

    if (!obj) return;
    if (obj.helperId === player.id) {
      obj.helperId = null;
      return;
    }
    if (obj.carrierId === player.id) {
      obj.carrierId = null;
      obj.helperId = null;
      if (obj.body) {
        const fx = Math.sin(player.rotY);
        const fz = Math.cos(player.rotY);
        const dropPos = {
          x: player.pos.x + fx * 1.1,
          y: player.pos.y + 1.1,
          z: player.pos.z + fz * 1.1,
        };
        obj.body.setTranslation(dropPos, true);
        obj.body.setLinvel(
          {
            x: fx * forwardImpulse,
            y: forwardImpulse > 4 ? 4.5 + forwardImpulse * 0.35 : 2.0,
            z: fz * forwardImpulse,
          },
          true
        );
      }
    }
  }

  private releaseThrow() {
    this.isChargingThrow = false;
    const local = this.players.get(this.localPlayerId);
    if (!local || !local.carryingId) {
      this.throwCharge = 0;
      return;
    }
    const power = 6.5 + this.throwCharge * 15.0;
    this.dropObject(local, power);
    soundFX.throwItem(this.throwCharge);
    this.throwCharge = 0;
  }

  private tryMeleePush() {
    const local = this.players.get(this.localPlayerId);
    if (
      !local ||
      this.elapsedTime < local.stunnedUntil ||
      this.elapsedTime < local.pushCooldownUntil
    ) {
      return;
    }

    local.pushCooldownUntil = this.elapsedTime + 1.1;
    local.pushAnimProgress = 1.0;
    soundFX.punch();

    const fx = Math.sin(local.rotY);
    const fz = Math.cos(local.rotY);
    if (local.body) {
      const lv = local.body.linvel();
      local.body.setLinvel({ x: lv.x + fx * 7, y: lv.y + 1.5, z: lv.z + fz * 7 }, true);
    }

    const attackCenter = new THREE.Vector3(
      local.pos.x + fx * 1.35,
      local.pos.y + 0.9,
      local.pos.z + fz * 1.35
    );
    this.particles.spawnDustPuff(attackCenter);

    // Check players in range (2.5m)
    this.players.forEach((other) => {
      if (other.id === local.id) return;
      const dist = other.pos.distanceTo(attackCenter);
      if (dist < 2.4) {
        const dx = other.pos.x - local.pos.x;
        const dz = other.pos.z - local.pos.z;
        const len = Math.max(0.01, Math.hypot(dx, dz));
        const ndx = dx / len;
        const ndz = dz / len;

        other.stunnedUntil = this.elapsedTime + 1.5;
        other.anim = "stunned";
        if (other.carryingId) {
          this.dropObject(other, 3.0);
        }
        if (other.body) {
          other.body.setLinvel({ x: ndx * 15, y: 6.8, z: ndz * 15 }, true);
        }

        this.particles.spawnImpactBurst(
          other.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
          0xfacc15
        );
        soundFX.stun();
        this.callbacks.onNotification(`💥 ¡Aturdiste a ${other.name}! (1.5s)`, "#facc15");
        this.callbacks.onActionEvent({
          kind: "push_hit",
          actorId: local.id,
          targetId: other.id,
          dir: [ndx, ndz],
        });
      }
    });

    // Also allow melee to kick nearby uncarried objects!
    for (const obj of this.objects) {
      if (obj.carrierId || !obj.body) continue;
      const d = Math.hypot(obj.pos[0] - attackCenter.x, obj.pos[2] - attackCenter.z);
      if (d < 2.2) {
        obj.body.setLinvel({ x: fx * 14, y: 6.5, z: fz * 14 }, true);
      }
    }
  }

  private tryToggleNearestGate() {
    if (!this.currentWorldModule || this.currentWorldModule.id !== "granja") return;
    const local = this.players.get(this.localPlayerId);
    if (!local) return;

    const dRed = Math.hypot(local.pos.x - -25.0, local.pos.z - 0);
    const dBlue = Math.hypot(local.pos.x - 25.0, local.pos.z - 0);

    if (dRed < 5.5) {
      this.gates.red_gate = !this.gates.red_gate;
      soundFX.gateToggle();
      this.callbacks.onActionEvent({
        kind: "toggle_gate",
        gate: "red_gate",
        actorId: local.id,
      });
      this.callbacks.onNotification(
        this.gates.red_gate ? "🔓 Puerta Corral ROJO Abierta" : "🔒 Puerta Corral ROJO Cerrada",
        "#ef4444"
      );
    } else if (dBlue < 5.5) {
      this.gates.blue_gate = !this.gates.blue_gate;
      soundFX.gateToggle();
      this.callbacks.onActionEvent({
        kind: "toggle_gate",
        gate: "blue_gate",
        actorId: local.id,
      });
      this.callbacks.onNotification(
        this.gates.blue_gate ? "🔓 Puerta Corral AZUL Abierta" : "🔒 Puerta Corral AZUL Cerrada",
        "#3b82f6"
      );
    }
  }

  private startLoop() {
    const step = (now: number) => {
      if (this.disposed) return;
      const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;
      this.elapsedTime += dt;

      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.animFrameId = requestAnimationFrame(step);
    };
    this.animFrameId = requestAnimationFrame(step);
  }

  private update(dt: number) {
    this.physicsWorld.step();

    // Charge throw bar if holding right-click or E
    if (this.isChargingThrow) {
      this.throwCharge = Math.min(1.0, this.throwCharge + dt * 1.25);
    }

    const local = this.players.get(this.localPlayerId);
    if (local) {
      this.updateLocalPlayer(local, dt);
    }

    if (this.isHost) {
      this.updateBots(dt);
    }

    // Update carried objects & shared weight synergy beam
    let showSynergy = false;
    for (const obj of this.objects) {
      if (obj.carrierId) {
        const carrier = this.players.get(obj.carrierId);
        if (!carrier || this.elapsedTime < carrier.stunnedUntil) {
          obj.carrierId = null;
          obj.helperId = null;
          continue;
        }

        // Check if a friendly teammate is within 3.6m to auto-assist with Heavy Relic!
        if (obj.weight > 1.5) {
          let helperFound: RuntimePlayer | null = null;
          this.players.forEach((p) => {
            if (
              p.id !== carrier.id &&
              p.team === carrier.team &&
              this.elapsedTime >= p.stunnedUntil &&
              p.pos.distanceTo(carrier.pos) < 3.8
            ) {
              helperFound = p;
            }
          });
          obj.helperId = helperFound ? (helperFound as RuntimePlayer).id : null;

          if (helperFound && this.synergyLine) {
            showSynergy = true;
            const posAttr = this.synergyLine.geometry.attributes
              .position as THREE.BufferAttribute;
            posAttr.setXYZ(0, carrier.pos.x, carrier.pos.y + 1.2, carrier.pos.z);
            posAttr.setXYZ(
              1,
              (helperFound as RuntimePlayer).pos.x,
              (helperFound as RuntimePlayer).pos.y + 1.2,
              (helperFound as RuntimePlayer).pos.z
            );
            posAttr.needsUpdate = true;
          }
        }

        const holdX = carrier.pos.x + Math.sin(carrier.rotY) * 0.65;
        const holdY = carrier.pos.y + 1.55;
        const holdZ = carrier.pos.z + Math.cos(carrier.rotY) * 0.65;
        obj.pos = [holdX, holdY, holdZ];
        if (obj.body) {
          obj.body.setTranslation({ x: holdX, y: holdY, z: holdZ }, true);
          obj.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
        if (obj.mesh) {
          obj.mesh.position.set(holdX, holdY - 0.3, holdZ);
          obj.mesh.rotation.y = carrier.rotY;
        }
      }
    }

    if (this.synergyLine) {
      this.synergyLine.visible = showSynergy;
    }

    // Update all player visuals & remote interpolation
    this.players.forEach((p) => {
      if (p.body && (p.isLocal || (p.isBot && this.isHost))) {
        const t = p.body.translation();
        p.pos.set(t.x, Math.max(0, t.y - 0.9), t.z);
        const lv = p.body.linvel();
        p.vel.set(lv.x, lv.y, lv.z);

        // Respawn if fell out of arena
        if (t.y < -8) {
          const sp = this.currentWorldModule
            ? this.currentWorldModule.getSpawnPoint(p.team, 0)
            : ([0, 3, 0] as [number, number, number]);
          p.body.setTranslation({ x: sp[0], y: sp[1], z: sp[2] }, true);
          p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }

        // Canyon Gravity Lift check
        if (
          this.currentWorldModule?.id === "canyon" &&
          (Math.hypot(p.pos.x, p.pos.z - -11) < 1.8 ||
            Math.hypot(p.pos.x, p.pos.z - 11) < 1.8)
        ) {
          p.body.setLinvel({ x: lv.x, y: 14.5, z: lv.z }, true);
          soundFX.jump();
        }
      } else {
        // Remote player Lerp / Slerp smoothing
        p.pos.lerp(p.targetPos, Math.min(1, dt * 14));
        p.rotY = THREE.MathUtils.lerp(p.rotY, p.targetRotY, Math.min(1, dt * 14));
      }

      if (p.pushAnimProgress > 0) {
        p.pushAnimProgress = Math.max(0, p.pushAnimProgress - dt * 4);
      }

      p.visual.group.position.copy(p.pos);
      p.visual.group.rotation.y = p.rotY;
      p.visual.updateAnimation(dt, p.anim, p.pushAnimProgress);
    });

    // Update active world module
    if (this.currentWorldModule) {
      const playerMap = new Map<
        string,
        {
          pos: THREE.Vector3;
          team: TeamId;
          id: string;
          stunnedUntil: number;
          body?: RAPIER.RigidBody;
        }
      >();
      this.players.forEach((p) =>
        playerMap.set(p.id, {
          pos: p.pos,
          team: p.team,
          id: p.id,
          stunnedUntil: p.stunnedUntil,
          body: p.body,
        })
      );

      this.currentWorldModule.update(
        dt,
        this.elapsedTime,
        this.objects,
        playerMap,
        this.gates,
        {
          onScoreChange: (r, b, deltaTeam, deltaPts, scorerId) => {
            if (deltaTeam && deltaPts) {
              const goalPos = this.currentWorldModule!.getGoalPosition(deltaTeam);
              this.particles.spawnScoreFountain(goalPos, deltaTeam, deltaPts >= 5);
              soundFX.score(deltaPts >= 5);
            }
            this.callbacks.onScoreChange(r, b, deltaTeam, deltaPts, scorerId);
          },
          onLaserTrip: (pid, pos) => {
            const p = this.players.get(pid);
            if (p) {
              p.stunnedUntil = this.elapsedTime + 1.3;
              p.anim = "stunned";
              if (p.carryingId) this.dropObject(p, 2.5);
              if (p.body) {
                p.body.setLinvel({ x: -Math.sin(p.rotY) * 10, y: 6, z: -Math.cos(p.rotY) * 10 }, true);
              }
            }
            this.particles.spawnImpactBurst(pos, 0xff1133, 18);
            soundFX.alarm();
            this.callbacks.onNotification(
              "🚨 ¡LÁSER ACTIVADO! Bóveda cerrada por 5s",
              "#ef4444"
            );
          },
          onGateHint: () => {},
        }
      );
    }

    this.particles.update(dt);
  }

  private updateLocalPlayer(local: RuntimePlayer, _dt: number) {
    if (!local.body) return;

    const isStunned = this.elapsedTime < local.stunnedUntil;
    const lv = local.body.linvel();

    if (isStunned) {
      local.anim = "stunned";
    } else {
      let moveX = this.mobileMoveX;
      let moveZ = this.mobileMoveZ;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) moveZ -= 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) moveZ += 1;
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) moveX -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) moveX += 1;

      // Determine speed multiplier (check Museum Heavy Relic Shared Weight!)
      let speedMult = 1.0;
      let carriedObj: InteractiveObject | undefined;
      if (local.carryingId) {
        carriedObj = this.objects.find((o) => o.id === local.carryingId);
        if (carriedObj && carriedObj.weight > 1.5) {
          // Solo carry = 40% speed; Shared Carry with teammate = 90% speed!
          speedMult = carriedObj.helperId ? 0.9 : 0.4;
        } else {
          speedMult = 0.88;
        }
      }

      const baseSpeed = 8.4 * speedMult;

      if (moveX !== 0 || moveZ !== 0) {
        const len = Math.hypot(moveX, moveZ);
        moveX /= len;
        moveZ /= len;

        // Rotate movement relative to camera yaw
        const sinY = Math.sin(this.cameraYaw);
        const cosY = Math.cos(this.cameraYaw);
        const wx = moveX * cosY + moveZ * sinY;
        const wz = -moveX * sinY + moveZ * cosY;

        local.body.setLinvel({ x: wx * baseSpeed, y: lv.y, z: wz * baseSpeed }, true);
        local.rotY = Math.atan2(wx, wz);
        local.anim = local.carryingId ? "carrying" : "run";

        // Smart Auto-Follow Behind Camera: smoothly align behind character's back when moving
        // if the user hasn't manually orbited the camera in the last 1.6 seconds
        if (this.elapsedTime - this.lastManualCameraTime > 1.6) {
          const desiredYaw = local.rotY + Math.PI;
          const yawDiff = Math.atan2(
            Math.sin(desiredYaw - this.cameraYaw),
            Math.cos(desiredYaw - this.cameraYaw)
          );
          // Smoothly rotate camera behind player (stronger when turning forward/sideways)
          this.cameraYaw += yawDiff * Math.min(1, _dt * 2.8);
          this.cameraPitch = THREE.MathUtils.lerp(this.cameraPitch, 0.36, Math.min(1, _dt * 2.0));
        }
      } else {
        local.body.setLinvel({ x: lv.x * 0.82, y: lv.y, z: lv.z * 0.82 }, true);
        local.anim = local.carryingId ? "carrying" : "idle";
      }

      // Jump with Space or Mobile Jump Button
      if (
        (this.keys.has("Space") || this.mobileJumpRequested) &&
        Math.abs(lv.y) < 0.15 &&
        local.pos.y < 1.5
      ) {
        local.body.setLinvel({ x: lv.x, y: 9.2, z: lv.z }, true);
        this.particles.spawnDustPuff(local.pos);
        soundFX.jump();
        this.keys.delete("Space");
        this.mobileJumpRequested = false;
      } else {
        this.mobileJumpRequested = false;
      }
    }

    // Update 3rd-Person Spring Camera (positioned behind character looking forward)
    const camDist = 12.6;
    const camHeight = 6.8 * Math.sin(this.cameraPitch) + 2.4;
    const horizDist = camDist * Math.cos(this.cameraPitch * 0.5);
    const targetCamPos = new THREE.Vector3(
      local.pos.x + Math.sin(this.cameraYaw) * horizDist,
      local.pos.y + camHeight,
      local.pos.z + Math.cos(this.cameraYaw) * horizDist
    );
    this.camera.position.lerp(targetCamPos, 0.18);
    // Look slightly ahead of the character in the direction the camera is facing
    const lookAheadX = local.pos.x - Math.sin(this.cameraYaw) * 2.2;
    const lookAheadZ = local.pos.z - Math.cos(this.cameraYaw) * 2.2;
    this.camera.lookAt(lookAheadX, local.pos.y + 1.55, lookAheadZ);

    // Check gate proximity hint on Granja
    let gateHint: string | null = null;
    if (this.currentWorldModule?.id === "granja") {
      if (Math.hypot(local.pos.x - -25.0, local.pos.z) < 6.0) {
        gateHint = `Presiona [Q] para ${
          this.gates.red_gate ? "CERRAR" : "ABRIR"
        } Puerta del Corral ROJO`;
      } else if (Math.hypot(local.pos.x - 25.0, local.pos.z) < 6.0) {
        gateHint = `Presiona [Q] para ${
          this.gates.blue_gate ? "CERRAR" : "ABRIR"
        } Puerta del Corral AZUL`;
      }
    }

    const carriedObj = local.carryingId
      ? this.objects.find((o) => o.id === local.carryingId)
      : undefined;

    this.callbacks.onHudUpdate({
      throwCharge: this.throwCharge,
      carryingName: carriedObj
        ? carriedObj.kind === "golden_chicken"
          ? "Pollo Dorado (5 pts)"
          : carriedObj.kind === "chicken"
          ? "Pollo (1 pt)"
          : carriedObj.kind === "relic_heavy"
          ? "Reliquia Pesada (5 pts)"
          : carriedObj.kind === "gem"
          ? "Gema del Museo (2 pts)"
          : "Objetivo (3-5 pts)"
        : null,
      sharedCarryBoost: Boolean(carriedObj && carriedObj.weight > 1.5 && carriedObj.helperId),
      gateHint,
      stunRemaining: Math.max(0, local.stunnedUntil - this.elapsedTime),
      pushReady: this.elapsedTime >= local.pushCooldownUntil,
    });
  }

  private updateBots(dt: number) {
    if (!this.currentWorldModule) return;

    this.players.forEach((bot) => {
      if (!bot.isBot || !bot.body) return;

      if (this.elapsedTime < bot.stunnedUntil) {
        bot.anim = "stunned";
        return;
      }

      const lv = bot.body.linvel();
      let goalPos = new THREE.Vector3();
      let speed = 6.6;

      // 1. If bot is carrying an object, bring it to team's goal!
      if (bot.carryingId) {
        const carried = this.objects.find((o) => o.id === bot.carryingId);
        if (!carried || carried.carrierId !== bot.id) {
          bot.carryingId = null;
        } else {
          goalPos.copy(this.currentWorldModule!.getGoalPosition(bot.team));
          if (carried.weight > 1.5) {
            speed = carried.helperId ? 7.2 : 3.4;
          }
          const distToGoal = Math.hypot(goalPos.x - bot.pos.x, goalPos.z - bot.pos.z);
          if (distToGoal < 2.6) {
            this.dropObject(bot, 4.0);
            return;
          }
        }
      } else {
        // 2. Check if a teammate is carrying the Heavy Relic and needs a Shared Weight helper!
        const heavyBeingCarriedByAlly = this.objects.find(
          (o) =>
            o.weight > 1.5 &&
            o.carrierId &&
            this.players.get(o.carrierId)?.team === bot.team &&
            (!o.helperId || o.helperId === bot.id)
        );

        if (heavyBeingCarriedByAlly && heavyBeingCarriedByAlly.carrierId) {
          const ally = this.players.get(heavyBeingCarriedByAlly.carrierId)!;
          goalPos.copy(ally.pos);
        } else {
          // 3. Otherwise find best available object not already in our corral
          let bestObj: InteractiveObject | null = null;
          let bestScore = -999;

          for (const obj of this.objects) {
            if (obj.inZone === bot.team) continue;
            if (obj.kind === "flag_red" && bot.team === "red") continue;
            if (obj.kind === "flag_blue" && bot.team === "blue") continue;

            const d = Math.hypot(obj.pos[0] - bot.pos.x, obj.pos[2] - bot.pos.z);
            const val = obj.points * 3 - d;
            if (val > bestScore) {
              bestScore = val;
              bestObj = obj;
            }
          }

          if (bestObj) {
            goalPos.set(bestObj.pos[0], bestObj.pos[1], bestObj.pos[2]);
            const d = Math.hypot(bestObj.pos[0] - bot.pos.x, bestObj.pos[2] - bot.pos.z);

            // If enemy is carrying it and bot is close, melee push the enemy!
            if (bestObj.carrierId) {
              const carrier = this.players.get(bestObj.carrierId);
              if (
                carrier &&
                carrier.team !== bot.team &&
                d < 2.2 &&
                this.elapsedTime >= bot.pushCooldownUntil
              ) {
                bot.pushCooldownUntil = this.elapsedTime + 2.2;
                bot.pushAnimProgress = 1.0;
                carrier.stunnedUntil = this.elapsedTime + 1.5;
                carrier.anim = "stunned";
                this.dropObject(carrier, 3.0);
                this.particles.spawnImpactBurst(carrier.pos.clone(), 0xfacc15);
                soundFX.punch();
              }
            } else if (d < 2.1) {
              bestObj.carrierId = bot.id;
              bot.carryingId = bestObj.id;
            }
          }
        }
      }

      const dx = goalPos.x - bot.pos.x;
      const dz = goalPos.z - bot.pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.25) {
        const vx = (dx / len) * speed;
        const vz = (dz / len) * speed;
        bot.body.setLinvel({ x: vx, y: lv.y, z: vz }, true);
        bot.rotY = Math.atan2(vx, vz);
        bot.anim = bot.carryingId ? "carrying" : "run";
      } else {
        bot.anim = "idle";
      }

      // Occasional bot hops to get over low fences or unstuck
      bot.botJumpTimer = (bot.botJumpTimer ?? 1.5) - dt;
      if (bot.botJumpTimer <= 0 && Math.abs(lv.y) < 0.2) {
        bot.botJumpTimer = 2.0 + Math.random() * 2.5;
        bot.body.setLinvel({ x: lv.x, y: 7.8, z: lv.z }, true);
      }
    });
  }

  public getNetworkPayload() {
    const local = this.players.get(this.localPlayerId);
    if (!local) return null;

    const payload: Record<string, any> = {
      type: "input_state",
      pos: [local.pos.x, local.pos.y, local.pos.z],
      vel: [local.vel.x, local.vel.y, local.vel.z],
      rotY: local.rotY,
      anim: local.anim,
      carryingId: local.carryingId,
    };

    if (this.isHost) {
      const bots: any[] = [];
      this.players.forEach((p) => {
        if (p.isBot) {
          bots.push({
            id: p.id,
            pos: [p.pos.x, p.pos.y, p.pos.z],
            vel: [p.vel.x, p.vel.y, p.vel.z],
            rotY: p.rotY,
            anim: p.anim,
            carryingId: p.carryingId,
          });
        }
      });
      payload.bots = bots;

      const objMap: Record<string, any> = {};
      for (const o of this.objects) {
        objMap[o.id] = {
          pos: o.pos,
          carrierId: o.carrierId,
          helperId: o.helperId,
        };
      }
      payload.objects = objMap;
    }

    return payload;
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animFrameId);
    if (this.currentWorldModule) {
      this.currentWorldModule.dispose(this.scene, this.physicsWorld);
    }
    this.renderer.dispose();
  }
}
