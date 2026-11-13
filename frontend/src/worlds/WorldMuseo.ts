import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { InteractiveObject, IWorldModule, TeamId } from "../types/game";
import { createInteractiveObjectMesh } from "../engine/CharacterMesh";

interface MovingLaser {
  mesh: THREE.Mesh;
  baseZ: number;
  ampZ: number;
  speed: number;
  phase: number;
  xMin: number;
  xMax: number;
  yHeight: number;
}

export class WorldMuseo implements IWorldModule {
  public id = "museo" as const;
  public name = "Atraco al Museo 2.0";
  public subtitle =
    "¡Sube a los balcones del 2° piso por las gemas o roba la Reliquia Pesada en la bóveda central (Peso Compartido: 2 aliados = 90% vel)!";

  private worldGroup: THREE.Group = new THREE.Group();
  private bodies: RAPIER.RigidBody[] = [];
  private lasers: MovingLaser[] = [];
  private vaultDoorNorth: THREE.Mesh | null = null;
  private vaultDoorSouth: THREE.Mesh | null = null;
  private vaultBodyNorth: RAPIER.RigidBody | null = null;
  private vaultBodySouth: RAPIER.RigidBody | null = null;
  private alarmLight: THREE.PointLight | null = null;
  private vaultLockTimer: number = 0;
  private redTotal = 0;
  private blueTotal = 0;
  private laserCooldowns: Map<string, number> = new Map();

  public init(
    scene: THREE.Scene,
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    _isHost: boolean
  ): InteractiveObject[] {
    this.worldGroup = new THREE.Group();
    scene.add(this.worldGroup);
    this.bodies = [];
    this.lasers = [];
    this.vaultLockTimer = 0;
    this.redTotal = 0;
    this.blueTotal = 0;
    this.laserCooldowns.clear();

    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.FogExp2(0x090d16, 0.014);

    const amb = new THREE.AmbientLight(0x94a3b8, 0.58);
    this.worldGroup.add(amb);

    const moonLight = new THREE.DirectionalLight(0xe0f2fe, 1.05);
    moonLight.position.set(14, 32, 18);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    this.worldGroup.add(moonLight);

    this.alarmLight = new THREE.PointLight(0xfacc15, 2.5, 24);
    this.alarmLight.position.set(0, 7.5, 0);
    this.worldGroup.add(this.alarmLight);

    // Grand Marble Floor
    this.addStaticBox(physicsWorld, rapier, [0, -0.5, 0], [28, 0.5, 18], 0x1e293b, true);

    // Red Carpet Runner down the center
    const carpetGeo = new THREE.BoxGeometry(34, 0.06, 4.5);
    const carpetMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.9 });
    const carpet = new THREE.Mesh(carpetGeo, carpetMat);
    carpet.position.set(0, 0.03, 0);
    carpet.receiveShadow = true;
    this.worldGroup.add(carpet);

    // Outer Museum Walls
    this.addStaticBox(physicsWorld, rapier, [0, 3.0, -18], [28, 3.0, 0.5], 0x334155);
    this.addStaticBox(physicsWorld, rapier, [0, 3.0, 18], [28, 3.0, 0.5], 0x334155);
    this.addStaticBox(physicsWorld, rapier, [-28, 3.0, 0], [0.5, 3.0, 18], 0x334155);
    this.addStaticBox(physicsWorld, rapier, [28, 3.0, 0], [0.5, 3.0, 18], 0x334155);

    // 2nd Floor Mezzanine Balconies (North z = -13.5, South z = +13.5 at height y = 2.4m)
    this.buildMezzanineBalcony(physicsWorld, rapier, 0, -13.5);
    this.buildMezzanineBalcony(physicsWorld, rapier, 0, 13.5);

    // Grand Columns & Egyptian Obelisks
    const pillarCoords: [number, number][] = [
      [-10, -6.5],
      [-10, 6.5],
      [10, -6.5],
      [10, 6.5],
    ];
    for (const [px, pz] of pillarCoords) {
      this.addStaticBox(physicsWorld, rapier, [px, 2.8, pz], [0.85, 2.8, 0.85], 0x64748b);
    }

    // Central High-Security Vault Enclosure
    this.addStaticBox(physicsWorld, rapier, [-4.5, 2.0, -4.5], [0.45, 2.0, 1.5], 0x475569);
    this.addStaticBox(physicsWorld, rapier, [-4.5, 2.0, 4.5], [0.45, 2.0, 1.5], 0x475569);
    this.addStaticBox(physicsWorld, rapier, [4.5, 2.0, -4.5], [0.45, 2.0, 1.5], 0x475569);
    this.addStaticBox(physicsWorld, rapier, [4.5, 2.0, 4.5], [0.45, 2.0, 1.5], 0x475569);

    // Central Golden Pedestal
    this.addStaticBox(physicsWorld, rapier, [0, 0.35, 0], [1.5, 0.35, 1.5], 0xb45309);

    // Security Blast Doors
    const doorGeo = new THREE.BoxGeometry(7.6, 3.4, 0.35);
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.8,
      roughness: 0.25,
    });
    this.vaultDoorNorth = new THREE.Mesh(doorGeo, doorMat);
    this.vaultDoorNorth.position.set(0, -2.0, -4.5);
    this.worldGroup.add(this.vaultDoorNorth);

    this.vaultDoorSouth = new THREE.Mesh(doorGeo, doorMat);
    this.vaultDoorSouth.position.set(0, -2.0, 4.5);
    this.worldGroup.add(this.vaultDoorSouth);

    this.vaultBodyNorth = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -2.0, -4.5)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cuboid(3.8, 1.7, 0.2), this.vaultBodyNorth);
    this.bodies.push(this.vaultBodyNorth);

    this.vaultBodySouth = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -2.0, 4.5)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cuboid(3.8, 1.7, 0.2), this.vaultBodySouth);
    this.bodies.push(this.vaultBodySouth);

    // Escape Vans & Extraction Pads
    this.buildEscapeVan(physicsWorld, rapier, "red", -23.5, 0);
    this.buildEscapeVan(physicsWorld, rapier, "blue", 23.5, 0);

    // Moving Security Laser Beams
    this.createLaserBeam(-13, -4, 0, 8.5, 1.9, 0, 0.95);
    this.createLaserBeam(4, 13, 0, 8.5, 1.9, Math.PI, 0.95);
    this.createLaserBeam(-6, 6, -7.5, 3.0, 2.4, 1.2, 0.95);
    this.createLaserBeam(-6, 6, 7.5, 3.0, 2.4, 2.7, 0.95);

    const objects: InteractiveObject[] = [];

    // 1 Heavy Main Relic in Central Vault (5 pts, Shared Weight)
    const mainRelic: InteractiveObject = {
      id: "relic_main",
      kind: "relic_heavy",
      points: 5,
      weight: 2.5,
      pos: [0, 1.6, 0],
      vel: [0, 0, 0],
      rotY: 0,
      carrierId: null,
      helperId: null,
      inZone: null,
    };
    this.spawnObjectPhysics(physicsWorld, rapier, mainRelic, 0.65);
    objects.push(mainRelic);

    // 4 Gems on the 2nd Floor Mezzanine Balconies & Side Pedestals!
    const gemCoords: [number, number, number][] = [
      [-5.5, 3.4, -13.5],
      [5.5, 3.4, -13.5],
      [-5.5, 3.4, 13.5],
      [5.5, 3.4, 13.5],
    ];
    gemCoords.forEach(([gx, gy, gz], idx) => {
      const gem: InteractiveObject = {
        id: `gem_${idx + 1}`,
        kind: "gem",
        points: 2,
        weight: 1.0,
        pos: [gx, gy, gz],
        vel: [0, 0, 0],
        rotY: 0,
        carrierId: null,
        helperId: null,
        inZone: null,
      };
      this.spawnObjectPhysics(physicsWorld, rapier, gem, 0.42);
      objects.push(gem);
    });

    return objects;
  }

  private buildMezzanineBalcony(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    x: number,
    z: number
  ) {
    // Elevated walkway at y = 2.2m
    this.addStaticBox(physicsWorld, rapier, [x, 2.2, z], [8.5, 0.25, 2.8], 0x334155);
    // Support columns
    this.addStaticBox(physicsWorld, rapier, [x - 7.5, 1.1, z], [0.4, 1.1, 0.4], 0x475569);
    this.addStaticBox(physicsWorld, rapier, [x + 7.5, 1.1, z], [0.4, 1.1, 0.4], 0x475569);

    // Left & Right Stepped Ramps up to the Balcony
    for (let s = 0; s < 5; s++) {
      const stepOffset = 9.2 + s * 1.05;
      const stepY = 1.9 - s * 0.4;
      this.addStaticBox(physicsWorld, rapier, [x - stepOffset, stepY, z], [0.65, 0.2, 2.2], 0x475569);
      this.addStaticBox(physicsWorld, rapier, [x + stepOffset, stepY, z], [0.65, 0.2, 2.2], 0x475569);
    }
  }

  private spawnObjectPhysics(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    obj: InteractiveObject,
    radius: number
  ) {
    const mesh = createInteractiveObjectMesh(obj);
    mesh.position.set(obj.pos[0], obj.pos[1], obj.pos[2]);
    this.worldGroup.add(mesh);
    obj.mesh = mesh;

    const rbDesc = rapier.RigidBodyDesc.dynamic()
      .setTranslation(obj.pos[0], obj.pos[1], obj.pos[2])
      .setLinearDamping(1.5)
      .setAngularDamping(2.0);
    const rb = physicsWorld.createRigidBody(rbDesc);
    const colDesc = rapier.ColliderDesc.ball(radius).setRestitution(0.35).setFriction(0.7);
    physicsWorld.createCollider(colDesc, rb);
    obj.body = rb;
    this.bodies.push(rb);
  }

  private buildEscapeVan(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    team: TeamId,
    x: number,
    z: number
  ) {
    const color = team === "red" ? 0xef4444 : 0x3b82f6;
    const padX = team === "red" ? x + 3.4 : x - 3.4;
    const padGeo = new THREE.CylinderGeometry(3.3, 3.3, 0.14, 24);
    const padMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.45,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(padX, 0.06, z);
    this.worldGroup.add(pad);

    this.addStaticBox(physicsWorld, rapier, [x, 1.5, z], [2.0, 1.5, 3.4], color);
  }

  private createLaserBeam(
    xMin: number,
    xMax: number,
    baseZ: number,
    ampZ: number,
    speed: number,
    phase: number,
    yHeight: number
  ) {
    const length = Math.abs(xMax - xMin);
    const geo = new THREE.CylinderGeometry(0.06, 0.06, length, 8);
    geo.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff1133 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((xMin + xMax) / 2, yHeight, baseZ);
    this.worldGroup.add(mesh);
    this.lasers.push({ mesh, baseZ, ampZ, speed, phase, xMin, xMax, yHeight });
  }

  private addStaticBox(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    pos: [number, number, number],
    halfExtents: [number, number, number],
    colorHex: number,
    isFloor: boolean = false
  ) {
    const geo = new THREE.BoxGeometry(halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: isFloor ? 0.35 : 0.5,
      metalness: isFloor ? 0.2 : 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.receiveShadow = true;
    if (!isFloor) mesh.castShadow = true;
    this.worldGroup.add(mesh);

    const rbDesc = rapier.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2]);
    const rb = physicsWorld.createRigidBody(rbDesc);
    const colDesc = rapier.ColliderDesc.cuboid(halfExtents[0], halfExtents[1], halfExtents[2]);
    physicsWorld.createCollider(colDesc, rb);
    this.bodies.push(rb);
  }

  public update(
    dt: number,
    elapsedTime: number,
    objects: InteractiveObject[],
    players: Map<string, { pos: THREE.Vector3; team: TeamId; id: string; stunnedUntil: number; body?: RAPIER.RigidBody }>,
    _gates: { red_gate: boolean; blue_gate: boolean; vault_locked: boolean },
    callbacks: {
      onScoreChange: (redScore: number, blueScore: number, deltaTeam?: TeamId, deltaPts?: number, scorerId?: string) => void;
      onLaserTrip: (playerId: string, pos: THREE.Vector3) => void;
      onGateHint: (hintText: string | null) => void;
    }
  ): void {
    if (this.vaultLockTimer > 0) {
      this.vaultLockTimer -= dt;
      if (this.alarmLight) {
        this.alarmLight.color.setHex(Math.sin(elapsedTime * 18) > 0 ? 0xff0000 : 0x330000);
        this.alarmLight.intensity = 3.5;
      }
    } else if (this.alarmLight) {
      this.alarmLight.color.setHex(0xfacc15);
      this.alarmLight.intensity = 2.0;
    }

    const doorTargetY = this.vaultLockTimer > 0 ? 1.6 : -2.0;
    if (this.vaultDoorNorth && this.vaultBodyNorth && this.vaultDoorSouth && this.vaultBodySouth) {
      const ny = THREE.MathUtils.lerp(this.vaultDoorNorth.position.y, doorTargetY, dt * 9);
      this.vaultDoorNorth.position.y = ny;
      this.vaultDoorSouth.position.y = ny;
      this.vaultBodyNorth.setNextKinematicTranslation({ x: 0, y: ny, z: -4.5 });
      this.vaultBodySouth.setNextKinematicTranslation({ x: 0, y: ny, z: 4.5 });
    }

    for (const laser of this.lasers) {
      const z = laser.baseZ + Math.sin(elapsedTime * laser.speed + laser.phase) * laser.ampZ;
      laser.mesh.position.z = z;

      players.forEach((p) => {
        const cd = this.laserCooldowns.get(p.id) || 0;
        if (elapsedTime < cd) return;
        if (
          p.pos.x >= laser.xMin &&
          p.pos.x <= laser.xMax &&
          Math.abs(p.pos.z - z) < 0.55 &&
          p.pos.y < 1.8
        ) {
          this.laserCooldowns.set(p.id, elapsedTime + 2.5);
          this.vaultLockTimer = 5.0;
          callbacks.onLaserTrip(p.id, p.pos.clone());
        }
      });
    }

    for (const obj of objects) {
      if (!obj.body || !obj.mesh) continue;

      if (!obj.carrierId) {
        const t = obj.body.translation();
        obj.pos = [t.x, t.y, t.z];
        obj.mesh.position.set(t.x, Math.max(0.1, t.y - 0.35), t.z);
        obj.mesh.rotation.y += dt * 1.5;
      }

      const ox = obj.pos[0];
      const oz = obj.pos[2];

      const inRedVan = Math.hypot(ox - -20.1, oz - 0) < 3.4;
      const inBlueVan = Math.hypot(ox - 20.1, oz - 0) < 3.4;

      if (inRedVan || inBlueVan) {
        const scoringTeam: TeamId = inRedVan ? "red" : "blue";
        const scorerId = obj.carrierId || undefined;
        if (scoringTeam === "red") {
          this.redTotal += obj.points;
        } else {
          this.blueTotal += obj.points;
        }

        obj.carrierId = null;
        obj.helperId = null;
        const respawnPos: [number, number, number] =
          obj.kind === "relic_heavy"
            ? [0, 2.2, 0]
            : [(Math.random() - 0.5) * 10, 4.0, Math.random() > 0.5 ? -13.5 : 13.5];
        obj.pos = respawnPos;
        obj.body.setTranslation({ x: respawnPos[0], y: respawnPos[1], z: respawnPos[2] }, true);
        obj.body.setLinvel({ x: 0, y: 2, z: 0 }, true);
        obj.mesh.position.set(respawnPos[0], respawnPos[1], respawnPos[2]);

        callbacks.onScoreChange(this.redTotal, this.blueTotal, scoringTeam, obj.points, scorerId);
      }
    }
  }

  public getSpawnPoint(team: TeamId, index: number): [number, number, number] {
    const zOffsets = [0, -2.5, 2.5, -5.0, 5.0];
    const z = zOffsets[index % zOffsets.length];
    return team === "red" ? [-16.5, 2.0, z] : [16.5, 2.0, z];
  }

  public getGoalPosition(team: TeamId): THREE.Vector3 {
    return team === "red" ? new THREE.Vector3(-20.1, 0.5, 0) : new THREE.Vector3(20.1, 0.5, 0);
  }

  public dispose(scene: THREE.Scene, physicsWorld: RAPIER.World): void {
    scene.remove(this.worldGroup);
    for (const b of this.bodies) {
      try {
        physicsWorld.removeRigidBody(b);
      } catch {}
    }
    this.bodies = [];
    this.lasers = [];
  }
}
