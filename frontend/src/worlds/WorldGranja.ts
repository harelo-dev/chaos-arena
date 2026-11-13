import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { InteractiveObject, IWorldModule, TeamId } from "../types/game";
import { createInteractiveObjectMesh } from "../engine/CharacterMesh";

export class WorldGranja implements IWorldModule {
  public id = "granja" as const;
  public name = "Granja Caótica 2.0";
  public subtitle =
    "¡Cruza los puentes del río, esquiva el Rotor Espantapájaros central, sube a los techos y encierra los pollos en tu corral ([Q] Puerta)!";

  private worldGroup: THREE.Group = new THREE.Group();
  private bodies: RAPIER.RigidBody[] = [];
  private windmillBlades: THREE.Group | null = null;
  private sweeperMesh: THREE.Group | null = null;
  private sweeperBody: RAPIER.RigidBody | null = null;
  private sweeperAngle: number = 0;

  private redGateMesh: THREE.Mesh | null = null;
  private blueGateMesh: THREE.Mesh | null = null;
  private redGateBody: RAPIER.RigidBody | null = null;
  private blueGateBody: RAPIER.RigidBody | null = null;
  private lastRedScore = 0;
  private lastBlueScore = 0;

  public init(
    scene: THREE.Scene,
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    _isHost: boolean
  ): InteractiveObject[] {
    this.worldGroup = new THREE.Group();
    scene.add(this.worldGroup);
    this.bodies = [];
    this.lastRedScore = 0;
    this.lastBlueScore = 0;
    this.sweeperAngle = 0;

    // Sky & Golden Hour Farm Atmosphere
    scene.background = new THREE.Color(0x60a5fa);
    scene.fog = new THREE.FogExp2(0x60a5fa, 0.01);

    const amb = new THREE.AmbientLight(0xffffff, 0.72);
    this.worldGroup.add(amb);

    const sun = new THREE.DirectionalLight(0xfffbeb, 1.45);
    sun.position.set(24, 38, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    this.worldGroup.add(sun);

    // Main Farm Meadow Floor (West & East banks + shallow riverbed)
    this.addStaticBox(physicsWorld, rapier, [-15, -0.5, 0], [13, 0.5, 20], 0x4ade80, true);
    this.addStaticBox(physicsWorld, rapier, [15, -0.5, 0], [13, 0.5, 20], 0x4ade80, true);
    // Riverbed floor (slightly lower so water flows)
    this.addStaticBox(physicsWorld, rapier, [0, -0.75, 0], [3.2, 0.5, 20], 0x0284c7, true);

    // Translucent Flowing Water Surface
    const waterGeo = new THREE.BoxGeometry(5.6, 0.18, 39.5);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      roughness: 0.1,
      metalness: 0.3,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(0, -0.15, 0);
    this.worldGroup.add(water);

    // Central Mud Island over the River (at 0,0) with Golden Chicken Pedestal!
    this.addStaticBox(physicsWorld, rapier, [0, 0.2, 0], [3.6, 0.35, 3.6], 0x78350f);

    // Physical Rotating Sweeper ("Espantapájaros Loco" obstacle on the Central Island!)
    this.buildCentralSweeper(physicsWorld, rapier, 0, 0.85, 0);

    // 2 Wooden Bridges crossing the river at z = -8.5 and z = +8.5 with angled approaches!
    this.buildWoodenBridge(physicsWorld, rapier, 0, -8.5);
    this.buildWoodenBridge(physicsWorld, rapier, 0, 8.5);

    // 2 Elevated Barn Hay-Loft Platforms (2nd floor at y = 2.4m) with Ramps!
    this.buildElevatedLoft(physicsWorld, rapier, -8.5, -13.5, 1);
    this.buildElevatedLoft(physicsWorld, rapier, 8.5, 13.5, -1);

    // Outer Arena Boundary Fences
    this.addStaticBox(physicsWorld, rapier, [0, 1.8, -20], [28, 2.2, 0.5], 0x92400e);
    this.addStaticBox(physicsWorld, rapier, [0, 1.8, 20], [28, 2.2, 0.5], 0x92400e);
    this.addStaticBox(physicsWorld, rapier, [-28, 1.8, 0], [0.5, 2.2, 20], 0x92400e);
    this.addStaticBox(physicsWorld, rapier, [28, 1.8, 0], [0.5, 2.2, 20], 0x92400e);

    // Red Corral (West: x = -20.5) & Blue Corral (East: x = +20.5)
    this.buildCorral(physicsWorld, rapier, "red", -20.5, 0);
    this.buildCorral(physicsWorld, rapier, "blue", 20.5, 0);

    // Decorative Low-Poly Trees, Silos & Hay Stacks
    const treePositions: [number, number][] = [
      [-12, -16],
      [-18, -15],
      [12, -16],
      [18, -15],
      [-12, 16],
      [-18, 15],
      [12, 16],
      [18, 15],
    ];
    for (const [tx, tz] of treePositions) {
      this.buildLowPolyTree(tx, tz);
    }

    this.buildSilo(-24, -12, 0xdc2626);
    this.buildSilo(24, 12, 0x2563eb);
    this.buildWindmill(0, -18);

    // Hay Bales for Jump Cover
    const hayPositions: [number, number, number][] = [
      [-7.5, 0.7, -3.5],
      [7.5, 0.7, 3.5],
      [-7.5, 0.7, 3.5],
      [7.5, 0.7, -3.5],
    ];
    for (const hp of hayPositions) {
      this.addStaticBox(physicsWorld, rapier, hp, [1.0, 0.7, 1.0], 0xfacc15);
    }

    // Spawn 15 Normal Chickens + 1 Golden Chicken
    const objects: InteractiveObject[] = [];
    for (let i = 0; i < 16; i++) {
      const isGold = i === 15;
      const angle = (Math.PI * 2 * i) / 15;
      const radius = isGold ? 0 : 4.8 + (i % 3) * 3.0;
      const x = isGold ? 0 : Math.cos(angle) * radius;
      const z = isGold ? 0 : Math.sin(angle) * radius;

      const obj: InteractiveObject = {
        id: isGold ? "chicken_gold" : `chicken_${i + 1}`,
        kind: isGold ? "golden_chicken" : "chicken",
        points: isGold ? 5 : 1,
        weight: 1.0,
        pos: [x, isGold ? 2.4 : 1.5 + (i % 3) * 0.3, z],
        vel: [0, 0, 0],
        rotY: Math.random() * Math.PI * 2,
        carrierId: null,
        helperId: null,
        inZone: null,
        aiTimer: Math.random() * 1.5,
        aiDir: [Math.cos(angle), Math.sin(angle)],
      };

      const mesh = createInteractiveObjectMesh(obj);
      mesh.position.set(obj.pos[0], obj.pos[1], obj.pos[2]);
      this.worldGroup.add(mesh);
      obj.mesh = mesh;

      const rbDesc = rapier.RigidBodyDesc.dynamic()
        .setTranslation(obj.pos[0], obj.pos[1], obj.pos[2])
        .setLinearDamping(1.2)
        .setAngularDamping(2.5);
      const rb = physicsWorld.createRigidBody(rbDesc);
      const colDesc = rapier.ColliderDesc.ball(isGold ? 0.48 : 0.36)
        .setRestitution(0.45)
        .setFriction(0.6);
      physicsWorld.createCollider(colDesc, rb);
      obj.body = rb;
      this.bodies.push(rb);

      objects.push(obj);
    }

    return objects;
  }

  private buildCentralSweeper(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    x: number,
    y: number,
    z: number
  ) {
    this.sweeperMesh = new THREE.Group();
    this.sweeperMesh.position.set(x, y, z);

    const postMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.4, 10), postMat);
    this.sweeperMesh.add(post);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.36, 0.36), barMat);
    bar.castShadow = true;
    this.sweeperMesh.add(bar);
    this.worldGroup.add(this.sweeperMesh);

    const rbDesc = rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z);
    this.sweeperBody = physicsWorld.createRigidBody(rbDesc);
    const colDesc = rapier.ColliderDesc.cuboid(3.1, 0.22, 0.22).setRestitution(0.8);
    physicsWorld.createCollider(colDesc, this.sweeperBody);
    this.bodies.push(this.sweeperBody);
  }

  private buildWoodenBridge(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    x: number,
    z: number
  ) {
    // Bridge deck & railings
    this.addStaticBox(physicsWorld, rapier, [x, 0.45, z], [3.6, 0.2, 1.9], 0x92400e);
    this.addStaticBox(physicsWorld, rapier, [x - 4.2, 0.2, z], [1.2, 0.18, 1.9], 0xb45309);
    this.addStaticBox(physicsWorld, rapier, [x + 4.2, 0.2, z], [1.2, 0.18, 1.9], 0xb45309);
    // Low side rails
    this.addStaticBox(physicsWorld, rapier, [x, 0.9, z - 1.8], [3.4, 0.3, 0.15], 0x78350f);
    this.addStaticBox(physicsWorld, rapier, [x, 0.9, z + 1.8], [3.4, 0.3, 0.15], 0x78350f);
  }

  private buildElevatedLoft(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    x: number,
    z: number,
    rampDirX: number
  ) {
    // 2nd Floor Hay-Loft Platform at y = 2.2m
    this.addStaticBox(physicsWorld, rapier, [x, 2.2, z], [3.2, 0.25, 2.6], 0xb45309);
    // Support pillars
    this.addStaticBox(physicsWorld, rapier, [x - 2.8, 1.1, z - 2.2], [0.25, 1.1, 0.25], 0x78350f);
    this.addStaticBox(physicsWorld, rapier, [x + 2.8, 1.1, z - 2.2], [0.25, 1.1, 0.25], 0x78350f);
    this.addStaticBox(physicsWorld, rapier, [x - 2.8, 1.1, z + 2.2], [0.25, 1.1, 0.25], 0x78350f);
    this.addStaticBox(physicsWorld, rapier, [x + 2.8, 1.1, z + 2.2], [0.25, 1.1, 0.25], 0x78350f);

    // Stepped Ramp leading up to the 2nd floor platform
    for (let s = 0; s < 5; s++) {
      const stepX = x + rampDirX * (3.6 + s * 0.95);
      const stepY = 1.9 - s * 0.4;
      this.addStaticBox(physicsWorld, rapier, [stepX, stepY, z], [0.6, 0.2, 1.8], 0xd97706);
    }
  }

  private buildLowPolyTree(x: number, z: number) {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.6 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.0, 7), trunkMat);
    trunk.position.set(x, 1.0, z);
    trunk.castShadow = true;
    this.worldGroup.add(trunk);

    const leaves1 = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.6, 7), leafMat);
    leaves1.position.set(x, 2.8, z);
    leaves1.castShadow = true;
    const leaves2 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 7), leafMat);
    leaves2.position.set(x, 4.1, z);
    leaves2.castShadow = true;
    this.worldGroup.add(leaves1, leaves2);
  }

  private buildSilo(x: number, z: number, domeColor: number) {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.3, roughness: 0.4 });
    const domeMat = new THREE.MeshStandardMaterial({ color: domeColor, roughness: 0.4 });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 7.5, 12), bodyMat);
    cyl.position.set(x, 3.75, z);
    cyl.castShadow = true;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.0, 12, 10), domeMat);
    dome.position.set(x, 7.5, z);
    this.worldGroup.add(cyl, dome);
  }

  private buildCorral(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    team: TeamId,
    centerX: number,
    centerZ: number
  ) {
    const color = team === "red" ? 0xef4444 : 0x3b82f6;
    const floorColor = team === "red" ? 0xfca5a5 : 0x93c5fd;

    const zoneGeo = new THREE.BoxGeometry(8.5, 0.12, 11.5);
    const zoneMat = new THREE.MeshStandardMaterial({
      color: floorColor,
      emissive: color,
      emissiveIntensity: 0.25,
      roughness: 0.6,
    });
    const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
    zoneMesh.position.set(centerX, 0.05, centerZ);
    zoneMesh.receiveShadow = true;
    this.worldGroup.add(zoneMesh);

    const halfW = 4.25;
    const halfD = 5.75;
    const fenceH = 0.85;
    const backX = team === "red" ? centerX - halfW : centerX + halfW;
    const frontX = team === "red" ? centerX + halfW : centerX - halfW;

    this.addStaticBox(physicsWorld, rapier, [centerX, fenceH, centerZ - halfD], [halfW, fenceH, 0.25], color);
    this.addStaticBox(physicsWorld, rapier, [centerX, fenceH, centerZ + halfD], [halfW, fenceH, 0.25], color);
    this.addStaticBox(physicsWorld, rapier, [backX, fenceH, centerZ], [0.25, fenceH, halfD], color);
    this.addStaticBox(physicsWorld, rapier, [frontX, fenceH, centerZ - 4.0], [0.25, fenceH, 1.8], color);
    this.addStaticBox(physicsWorld, rapier, [frontX, fenceH, centerZ + 4.0], [0.25, fenceH, 1.8], color);

    const gateGeo = new THREE.BoxGeometry(0.3, 1.5, 4.2);
    const gateMat = new THREE.MeshStandardMaterial({
      color: team === "red" ? 0xb91c1c : 0x1d4ed8,
      roughness: 0.4,
    });
    const gateMesh = new THREE.Mesh(gateGeo, gateMat);
    gateMesh.position.set(frontX, 0.8, centerZ);
    gateMesh.castShadow = true;
    this.worldGroup.add(gateMesh);

    const rbDesc = rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(frontX, 0.8, centerZ);
    const gateBody = physicsWorld.createRigidBody(rbDesc);
    const colDesc = rapier.ColliderDesc.cuboid(0.18, 0.8, 2.1);
    physicsWorld.createCollider(colDesc, gateBody);
    this.bodies.push(gateBody);

    const switchGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.8, 8);
    const switchMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xd97706, emissiveIntensity: 0.3 });
    const switchMesh = new THREE.Mesh(switchGeo, switchMat);
    switchMesh.position.set(frontX, 0.9, centerZ - 2.5);
    this.worldGroup.add(switchMesh);

    if (team === "red") {
      this.redGateMesh = gateMesh;
      this.redGateBody = gateBody;
    } else {
      this.blueGateMesh = gateMesh;
      this.blueGateBody = gateBody;
    }
  }

  private buildWindmill(x: number, z: number) {
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 });
    const tower = new THREE.Mesh(new THREE.ConeGeometry(3.2, 11, 6), towerMat);
    tower.position.set(x, 5.5, z);
    tower.castShadow = true;
    this.worldGroup.add(tower);

    this.windmillBlades = new THREE.Group();
    this.windmillBlades.position.set(x, 8.5, z + 1.8);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7 });
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.2, 0.12), bladeMat);
      blade.rotation.z = (Math.PI / 2) * i;
      this.windmillBlades.add(blade);
    }
    this.worldGroup.add(this.windmillBlades);
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
      roughness: isFloor ? 0.85 : 0.55,
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
    _elapsedTime: number,
    objects: InteractiveObject[],
    players: Map<string, { pos: THREE.Vector3; team: TeamId; id: string; stunnedUntil: number; body?: RAPIER.RigidBody }>,
    gates: { red_gate: boolean; blue_gate: boolean; vault_locked: boolean },
    callbacks: {
      onScoreChange: (redScore: number, blueScore: number, deltaTeam?: TeamId, deltaPts?: number, scorerId?: string) => void;
      onLaserTrip: (playerId: string, pos: THREE.Vector3) => void;
      onGateHint: (hintText: string | null) => void;
    }
  ): void {
    if (this.windmillBlades) {
      this.windmillBlades.rotation.z += dt * 0.9;
    }

    // Rotate central physical sweeper bar
    if (this.sweeperMesh && this.sweeperBody) {
      this.sweeperAngle += dt * 2.1;
      this.sweeperMesh.rotation.y = this.sweeperAngle;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.sweeperAngle);
      this.sweeperBody.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }

    // River current: push players standing in the water (x between -2.6 and 2.6, y < 0.25)
    players.forEach((p) => {
      if (p.body && Math.abs(p.pos.x) < 2.6 && Math.abs(p.pos.z) > 3.8 && p.pos.y < 0.2) {
        const lv = p.body.linvel();
        p.body.setLinvel({ x: lv.x, y: lv.y, z: lv.z + 10.5 * dt }, true);
      }
    });

    // Update Red & Blue corral gates (false = closed, true = open)
    if (this.redGateMesh && this.redGateBody) {
      const targetY = gates.red_gate ? -1.5 : 0.8;
      this.redGateMesh.position.y = THREE.MathUtils.lerp(this.redGateMesh.position.y, targetY, dt * 8);
      this.redGateBody.setNextKinematicTranslation({
        x: -16.25,
        y: this.redGateMesh.position.y,
        z: 0,
      });
    }
    if (this.blueGateMesh && this.blueGateBody) {
      const targetY = gates.blue_gate ? -1.5 : 0.8;
      this.blueGateMesh.position.y = THREE.MathUtils.lerp(this.blueGateMesh.position.y, targetY, dt * 8);
      this.blueGateBody.setNextKinematicTranslation({
        x: 16.25,
        y: this.blueGateMesh.position.y,
        z: 0,
      });
    }

    let redPts = 0;
    let bluePts = 0;

    for (const obj of objects) {
      if (!obj.body || !obj.mesh) continue;
      if (obj.carrierId) {
        obj.inZone = null;
        continue;
      }

      const t = obj.body.translation();
      obj.pos = [t.x, t.y, t.z];

      // Check if inside Red Corral (x: -24.8 to -16.2, z: -5.7 to 5.7)
      const inRed = t.x >= -24.8 && t.x <= -16.2 && Math.abs(t.z) <= 5.7;
      // Check if inside Blue Corral (x: 16.2 to 24.8, z: -5.7 to 5.7)
      const inBlue = t.x >= 16.2 && t.x <= 24.8 && Math.abs(t.z) <= 5.7;

      const prevZone = obj.inZone;
      if (inRed) {
        obj.inZone = "red";
        redPts += obj.points;
      } else if (inBlue) {
        obj.inZone = "blue";
        bluePts += obj.points;
      } else {
        obj.inZone = null;
      }

      obj.aiTimer = (obj.aiTimer ?? 0) - dt;
      if (obj.aiTimer <= 0 && t.y < 1.55) {
        obj.aiTimer = 0.55 + Math.random() * 0.75;

        let fleeX = 0;
        let fleeZ = 0;
        let minDist = 7.0;
        players.forEach((p) => {
          const dx = t.x - p.pos.x;
          const dz = t.z - p.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < minDist && dist > 0.01) {
            minDist = dist;
            fleeX = dx / dist;
            fleeZ = dz / dist;
          }
        });

        if (inRed && gates.red_gate) {
          fleeX = 1.0;
          fleeZ = -t.z * 0.2;
        } else if (inBlue && gates.blue_gate) {
          fleeX = -1.0;
          fleeZ = -t.z * 0.2;
        } else if (fleeX === 0 && fleeZ === 0) {
          const randAngle = Math.random() * Math.PI * 2;
          fleeX = Math.cos(randAngle);
          fleeZ = Math.sin(randAngle);
        }

        const speed = obj.kind === "golden_chicken" ? 5.2 : 3.6;
        obj.body.setLinvel({ x: fleeX * speed, y: 4.2, z: fleeZ * speed }, true);
        obj.rotY = Math.atan2(fleeX, fleeZ);
      }

      obj.mesh.position.set(t.x, Math.max(0.05, t.y - 0.32), t.z);
      obj.mesh.rotation.y = obj.rotY;

      if (obj.inZone && obj.inZone !== prevZone) {
        callbacks.onScoreChange(redPts, bluePts, obj.inZone, obj.points);
      }
    }

    if (redPts !== this.lastRedScore || bluePts !== this.lastBlueScore) {
      this.lastRedScore = redPts;
      this.lastBlueScore = bluePts;
      callbacks.onScoreChange(redPts, bluePts);
    }
  }

  public getSpawnPoint(team: TeamId, index: number): [number, number, number] {
    const zOffsets = [0, -2.5, 2.5, -5.0, 5.0];
    const z = zOffsets[index % zOffsets.length];
    return team === "red" ? [-12.5, 2.0, z] : [12.5, 2.0, z];
  }

  public getGoalPosition(team: TeamId): THREE.Vector3 {
    return team === "red" ? new THREE.Vector3(-20.5, 0.5, 0) : new THREE.Vector3(20.5, 0.5, 0);
  }

  public dispose(scene: THREE.Scene, physicsWorld: RAPIER.World): void {
    scene.remove(this.worldGroup);
    for (const b of this.bodies) {
      try {
        physicsWorld.removeRigidBody(b);
      } catch {}
    }
    this.bodies = [];
  }
}
