import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { InteractiveObject, IWorldModule, TeamId } from "../types/game";
import { createInteractiveObjectMesh } from "../engine/CharacterMesh";
import { TextureGenerator } from "../engine/TextureGenerator";

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

interface SecurityDrone {
  group: THREE.Group;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  speed: number;
  phase: number;
}

export class WorldMuseo implements IWorldModule {
  public id = "museo" as const;
  public name = "Gran Museo Imperial 3.0";
  public subtitle =
    "¡Esquiva los Drones Centinela y láseres móviles! Sube a las galerías por las Gemas o lleva la Reliquia Pesada en equipo (Peso Compartido = 90% vel).";

  private worldGroup: THREE.Group = new THREE.Group();
  private bodies: RAPIER.RigidBody[] = [];
  private lasers: MovingLaser[] = [];
  private drones: SecurityDrone[] = [];
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
    this.drones = [];
    this.vaultLockTimer = 0;
    this.redTotal = 0;
    this.blueTotal = 0;
    this.laserCooldowns.clear();

    scene.background = new THREE.Color(0x090f1d);
    scene.fog = new THREE.FogExp2(0x090f1d, 0.0085);

    const hemi = new THREE.HemisphereLight(0xcbd5e1, 0x1e293b, 0.72);
    this.worldGroup.add(hemi);

    const moonLight = new THREE.DirectionalLight(0xe0f2fe, 1.35);
    moonLight.position.set(22, 42, 24);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    moonLight.shadow.camera.left = -45;
    moonLight.shadow.camera.right = 45;
    moonLight.shadow.camera.top = 35;
    moonLight.shadow.camera.bottom = -35;
    this.worldGroup.add(moonLight);

    this.alarmLight = new THREE.PointLight(0xfacc15, 3.2, 34);
    this.alarmLight.position.set(0, 9.0, 0);
    this.worldGroup.add(this.alarmLight);

    // 1. Wide Marble Hall Floor (84m x 56m)
    const floorGeo = new THREE.BoxGeometry(84, 1.0, 56);
    const floorMat = new THREE.MeshPhysicalMaterial({
      map: TextureGenerator.createMarbleTexture(),
      roughness: 0.22,
      metalness: 0.15,
      clearcoat: 0.65,
      clearcoatRoughness: 0.18,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, -0.5, 0);
    floorMesh.receiveShadow = true;
    this.worldGroup.add(floorMesh);

    const floorRb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cuboid(42, 0.5, 28), floorRb);
    this.bodies.push(floorRb);

    // Royal Velvet Carpet Runner with Gold Trim
    const carpetGeo = new THREE.BoxGeometry(58, 0.05, 5.4);
    const carpetMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.85 });
    const carpet = new THREE.Mesh(carpetGeo, carpetMat);
    carpet.position.set(0, 0.03, 0);
    carpet.receiveShadow = true;
    this.worldGroup.add(carpet);

    const trimGeo = new THREE.BoxGeometry(58, 0.06, 5.8);
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.7, roughness: 0.3 });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.set(0, 0.015, 0);
    this.worldGroup.add(trim);

    // Outer Architectural Walls + Glass Skylight Arches
    this.addStaticBox(physicsWorld, rapier, [0, 4.0, -28], [42, 4.0, 0.8], 0x1e293b);
    this.addStaticBox(physicsWorld, rapier, [0, 4.0, 28], [42, 4.0, 0.8], 0x1e293b);
    this.addStaticBox(physicsWorld, rapier, [-42, 4.0, 0], [0.8, 4.0, 28], 0x1e293b);
    this.addStaticBox(physicsWorld, rapier, [42, 4.0, 0], [0.8, 4.0, 28], 0x1e293b);

    // Grand Fluted Corinthian Columns (Cylindrical instead of boxy!)
    const colPositions: [number, number][] = [
      [-18, -10],
      [-18, 10],
      [-8, -10],
      [-8, 10],
      [8, -10],
      [8, 10],
      [18, -10],
      [18, 10],
    ];
    for (const [cx, cz] of colPositions) {
      this.buildCorinthianColumn(physicsWorld, rapier, cx, cz);
    }

    // 2nd Floor Grand Mezzanine Galleries (North z = -19.5, South z = +19.5)
    this.buildGrandMezzanine(physicsWorld, rapier, 0, -19.5);
    this.buildGrandMezzanine(physicsWorld, rapier, 0, 19.5);

    // Central High-Security Rotunda Vault (Cylindrical Glass & Steel Pillars)
    const vaultAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    for (const ang of vaultAngles) {
      const vx = Math.cos(ang) * 6.2;
      const vz = Math.sin(ang) * 6.2;
      this.buildVaultPillar(physicsWorld, rapier, vx, vz);
    }

    // Central Sculpted Golden Rotunda Pedestal
    const pedGeo = new THREE.CylinderGeometry(2.1, 2.5, 0.8, 24);
    const pedMat = new THREE.MeshPhysicalMaterial({
      color: 0xd97706,
      metalness: 0.75,
      roughness: 0.2,
      clearcoat: 0.8,
    });
    const pedMesh = new THREE.Mesh(pedGeo, pedMat);
    pedMesh.position.set(0, 0.4, 0);
    pedMesh.castShadow = true;
    pedMesh.receiveShadow = true;
    this.worldGroup.add(pedMesh);

    const pedRb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(0, 0.4, 0)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cylinder(0.4, 2.3), pedRb);
    this.bodies.push(pedRb);

    // Decorative Glass Display Domes on side wings
    this.buildGlassDisplayCase(physicsWorld, rapier, -13, 0);
    this.buildGlassDisplayCase(physicsWorld, rapier, 13, 0);

    // Security Blast Doors
    const doorGeo = new THREE.BoxGeometry(8.8, 3.8, 0.35);
    const doorMat = new THREE.MeshPhysicalMaterial({
      color: 0xef4444,
      metalness: 0.75,
      roughness: 0.2,
      clearcoat: 0.6,
    });
    this.vaultDoorNorth = new THREE.Mesh(doorGeo, doorMat);
    this.vaultDoorNorth.position.set(0, -2.2, -5.2);
    this.worldGroup.add(this.vaultDoorNorth);

    this.vaultDoorSouth = new THREE.Mesh(doorGeo, doorMat);
    this.vaultDoorSouth.position.set(0, -2.2, 5.2);
    this.worldGroup.add(this.vaultDoorSouth);

    this.vaultBodyNorth = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -2.2, -5.2)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cuboid(4.4, 1.9, 0.2), this.vaultBodyNorth);
    this.bodies.push(this.vaultBodyNorth);

    this.vaultBodySouth = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -2.2, 5.2)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cuboid(4.4, 1.9, 0.2), this.vaultBodySouth);
    this.bodies.push(this.vaultBodySouth);

    // Armored Escape Vans & Extraction Pads (Moved outward to x = ±33.5 for wide hall)
    this.buildArmoredEscapeVan(physicsWorld, rapier, "red", -33.5, 0);
    this.buildArmoredEscapeVan(physicsWorld, rapier, "blue", 33.5, 0);

    // 6 Moving Security Laser Beams
    this.createLaserBeam(-21, -7, 0, 12.0, 2.0, 0, 0.95);
    this.createLaserBeam(7, 21, 0, 12.0, 2.0, Math.PI, 0.95);
    this.createLaserBeam(-7, 7, -9.5, 4.0, 2.5, 1.1, 0.95);
    this.createLaserBeam(-7, 7, 9.5, 4.0, 2.5, 2.6, 0.95);
    this.createLaserBeam(-12, 12, -19.5, 2.2, 2.8, 0.5, 3.1);
    this.createLaserBeam(-12, 12, 19.5, 2.2, 2.8, 2.1, 3.1);

    // 3 Autonomous Patrol Security Sentry Drones!
    this.createSecurityDrone(0, 0, 15.5, 11.5, 1.15, 0);
    this.createSecurityDrone(-16, 0, 7.5, 13.0, 1.4, 2.1);
    this.createSecurityDrone(16, 0, 7.5, 13.0, 1.4, 4.2);

    const objects: InteractiveObject[] = [];

    // 1 Heavy Main Relic in Central Vault (5 pts, Shared Weight)
    const mainRelic: InteractiveObject = {
      id: "relic_main",
      kind: "relic_heavy",
      points: 5,
      weight: 2.5,
      pos: [0, 1.8, 0],
      vel: [0, 0, 0],
      rotY: 0,
      carrierId: null,
      helperId: null,
      inZone: null,
    };
    this.spawnObjectPhysics(physicsWorld, rapier, mainRelic, 0.65);
    objects.push(mainRelic);

    // 6 Gems across the 2nd Floor Mezzanine Galleries & Display Domes
    const gemCoords: [number, number, number][] = [
      [-8.0, 3.8, -19.5],
      [8.0, 3.8, -19.5],
      [-8.0, 3.8, 19.5],
      [8.0, 3.8, 19.5],
      [-13.0, 2.6, 0],
      [13.0, 2.6, 0],
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

  private buildCorinthianColumn(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    x: number,
    z: number
  ) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const marbleMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2e8f0,
      roughness: 0.25,
      metalness: 0.1,
      clearcoat: 0.5,
    });
    const goldMat = new THREE.MeshPhysicalMaterial({
      color: 0xfbbf24,
      metalness: 0.8,
      roughness: 0.2,
    });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.5, 20), marbleMat);
    base.position.y = 0.25;
    group.add(base);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 6.2, 20), marbleMat);
    shaft.position.y = 3.5;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    group.add(shaft);

    const ringBot = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.1, 10, 24), goldMat);
    ringBot.rotation.x = Math.PI / 2;
    ringBot.position.y = 0.55;
    group.add(ringBot);

    const ringTop = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 10, 24), goldMat);
    ringTop.rotation.x = Math.PI / 2;
    ringTop.position.y = 6.5;
    group.add(ringTop);

    this.worldGroup.add(group);

    const rb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(x, 3.2, z)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cylinder(3.2, 0.95), rb);
    this.bodies.push(rb);
  }

  private buildVaultPillar(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    x: number,
    z: number
  ) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x334155,
      metalness: 0.75,
      roughness: 0.25,
      clearcoat: 0.6,
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.75, 4.6, 18), mat);
    pillar.position.set(x, 2.3, z);
    pillar.castShadow = true;
    this.worldGroup.add(pillar);

    const rb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(x, 2.3, z)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cylinder(2.3, 0.7), rb);
    this.bodies.push(rb);
  }

  private buildGlassDisplayCase(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    x: number,
    z: number
  ) {
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.5, 1.2, 20),
      new THREE.MeshPhysicalMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.5 })
    );
    ped.position.set(x, 0.6, z);
    ped.castShadow = true;
    this.worldGroup.add(ped);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.28,
        roughness: 0.08,
        clearcoat: 1.0,
      })
    );
    dome.position.set(x, 1.2, z);
    this.worldGroup.add(dome);

    const rb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(x, 0.6, z)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cylinder(0.6, 1.4), rb);
    this.bodies.push(rb);
  }

  private buildGrandMezzanine(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    x: number,
    z: number
  ) {
    // Elevated walkway at y = 2.4m (wider 26m span)
    this.addStaticBox(physicsWorld, rapier, [x, 2.4, z], [13.0, 0.3, 3.6], 0x334155);

    // Cylindrical Support Pillars
    for (const px of [-11, 0, 11]) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.5, 2.4, 16),
        new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.5, roughness: 0.3 })
      );
      col.position.set(x + px, 1.2, z);
      this.worldGroup.add(col);
    }

    // Left & Right Wide Stepped Grand Staircases
    for (let s = 0; s < 6; s++) {
      const stepOffset = 14.0 + s * 1.15;
      const stepY = 2.1 - s * 0.38;
      this.addStaticBox(physicsWorld, rapier, [x - stepOffset, stepY, z], [0.75, 0.22, 2.8], 0x475569);
      this.addStaticBox(physicsWorld, rapier, [x + stepOffset, stepY, z], [0.75, 0.22, 2.8], 0x475569);
    }
  }

  private createSecurityDrone(
    centerX: number,
    centerZ: number,
    radiusX: number,
    radiusZ: number,
    speed: number,
    phase: number
  ) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.2,
      clearcoat: 0.9,
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff1133,
      emissive: 0xff1133,
      emissiveIntensity: 1.5,
    });

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.65, 20, 16), bodyMat);
    core.position.y = 4.2;
    group.add(core);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.1, 10, 24), bodyMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 4.2;
    group.add(halo);

    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 14), eyeMat);
    lens.position.set(0, 3.9, 0);
    group.add(lens);

    // Translucent volumetric red spotlight cone down to the floor
    const coneGeo = new THREE.ConeGeometry(2.3, 4.0, 24, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = 2.0;
    group.add(cone);

    // Floor danger ring
    const floorRing = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 2.3, 28),
      new THREE.MeshBasicMaterial({
        color: 0xff1133,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      })
    );
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = 0.08;
    group.add(floorRing);

    this.worldGroup.add(group);
    this.drones.push({ group, centerX, centerZ, radiusX, radiusZ, speed, phase });
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

  private buildArmoredEscapeVan(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    team: TeamId,
    x: number,
    z: number
  ) {
    const color = team === "red" ? 0xef4444 : 0x3b82f6;
    const padX = team === "red" ? x + 4.2 : x - 4.2;

    const padGeo = new THREE.CylinderGeometry(3.8, 3.8, 0.14, 32);
    const padMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.5,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(padX, 0.07, z);
    this.worldGroup.add(pad);

    // Sculpted Armored Van Group
    const vanGroup = new THREE.Group();
    vanGroup.position.set(x, 0, z);

    const bodyMat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.25,
      metalness: 0.4,
      clearcoat: 0.85,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 6.8), bodyMat);
    chassis.position.y = 1.65;
    chassis.castShadow = true;
    vanGroup.add(chassis);

    const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 6.6, 16), bodyMat);
    roof.rotation.x = Math.PI / 2;
    roof.scale.set(1.0, 0.35, 1.0);
    roof.position.y = 2.95;
    vanGroup.add(roof);

    // 4 Tires
    const wheelGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.5, 18);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [
      [-2.1, -2.1],
      [2.1, -2.1],
      [-2.1, 2.1],
      [2.1, 2.1],
    ]) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(wx, 0.65, wz);
      vanGroup.add(w);
    }

    this.worldGroup.add(vanGroup);

    const rb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(x, 1.6, z)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cuboid(2.1, 1.6, 3.4), rb);
    this.bodies.push(rb);
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
    colorHex: number
  ) {
    const geo = new THREE.BoxGeometry(halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2);
    const mat = new THREE.MeshPhysicalMaterial({
      color: colorHex,
      roughness: 0.35,
      metalness: 0.3,
      clearcoat: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
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
        this.alarmLight.intensity = 4.0;
      }
    } else if (this.alarmLight) {
      this.alarmLight.color.setHex(0xfacc15);
      this.alarmLight.intensity = 2.4;
    }

    const doorTargetY = this.vaultLockTimer > 0 ? 1.8 : -2.2;
    if (this.vaultDoorNorth && this.vaultBodyNorth && this.vaultDoorSouth && this.vaultBodySouth) {
      const ny = THREE.MathUtils.lerp(this.vaultDoorNorth.position.y, doorTargetY, dt * 9);
      this.vaultDoorNorth.position.y = ny;
      this.vaultDoorSouth.position.y = ny;
      this.vaultBodyNorth.setNextKinematicTranslation({ x: 0, y: ny, z: -5.2 });
      this.vaultBodySouth.setNextKinematicTranslation({ x: 0, y: ny, z: 5.2 });
    }

    // Update Moving Lasers
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
          Math.abs(p.pos.y + 0.9 - laser.yHeight) < 1.1
        ) {
          this.laserCooldowns.set(p.id, elapsedTime + 2.5);
          this.vaultLockTimer = 5.0;
          callbacks.onLaserTrip(p.id, p.pos.clone());
        }
      });
    }

    // Update Autonomous Security Sentry Drones
    for (const drone of this.drones) {
      const angle = elapsedTime * drone.speed + drone.phase;
      const dx = drone.centerX + Math.cos(angle) * drone.radiusX;
      const dz = drone.centerZ + Math.sin(angle * 1.3) * drone.radiusZ;
      drone.group.position.set(dx, 0, dz);
      drone.group.rotation.y = angle;

      players.forEach((p) => {
        const cd = this.laserCooldowns.get(p.id) || 0;
        if (elapsedTime < cd) return;
        if (Math.hypot(p.pos.x - dx, p.pos.z - dz) < 2.15 && p.pos.y < 2.2) {
          this.laserCooldowns.set(p.id, elapsedTime + 2.6);
          this.vaultLockTimer = 5.0;
          callbacks.onLaserTrip(p.id, p.pos.clone());
        }
      });
    }

    // Score Check at Armored Escape Vans (-29.3 and +29.3)
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

      const inRedVan = Math.hypot(ox - -29.3, oz - 0) < 3.8;
      const inBlueVan = Math.hypot(ox - 29.3, oz - 0) < 3.8;

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
            ? [0, 2.4, 0]
            : [(Math.random() - 0.5) * 14, 4.2, Math.random() > 0.5 ? -19.5 : 19.5];
        obj.pos = respawnPos;
        obj.body.setTranslation({ x: respawnPos[0], y: respawnPos[1], z: respawnPos[2] }, true);
        obj.body.setLinvel({ x: 0, y: 2, z: 0 }, true);
        obj.mesh.position.set(respawnPos[0], respawnPos[1], respawnPos[2]);

        callbacks.onScoreChange(this.redTotal, this.blueTotal, scoringTeam, obj.points, scorerId);
      }
    }
  }

  public getSpawnPoint(team: TeamId, index: number): [number, number, number] {
    const zOffsets = [0, -3.5, 3.5, -7.0, 7.0];
    const z = zOffsets[index % zOffsets.length];
    return team === "red" ? [-24.0, 2.0, z] : [24.0, 2.0, z];
  }

  public getGoalPosition(team: TeamId): THREE.Vector3 {
    return team === "red" ? new THREE.Vector3(-29.3, 0.5, 0) : new THREE.Vector3(29.3, 0.5, 0);
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
    this.drones = [];
  }
}
