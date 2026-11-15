import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { InteractiveObject, IWorldModule, TeamId } from "../types/game";
import { createInteractiveObjectMesh } from "../engine/CharacterMesh";
import { OrganicPropBuilder, TextureGenerator } from "../engine/TextureGenerator";

interface RollingBoulderHazard {
  mesh: THREE.Object3D;
  z: number;
  dirZ: number;
  x: number;
  speed: number;
}

export class WorldCanyon implements IWorldModule {
  public id = "canyon" as const;
  public name = "Gran Cañón Blood Gulch 3.0";
  public subtitle =
    "¡Valle abierto con formaciones rocosas orgánicas, Meteoros Rodantes, Cañones de Impulso y Bases Circulares de 2 pisos!";

  private worldGroup: THREE.Group = new THREE.Group();
  private bodies: RAPIER.RigidBody[] = [];
  private redTotal = 0;
  private blueTotal = 0;
  private gravRings: THREE.Mesh[] = [];
  private rollingBoulders: RollingBoulderHazard[] = [];
  private boulderCooldowns: Map<string, number> = new Map();

  public init(
    scene: THREE.Scene,
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    _isHost: boolean
  ): InteractiveObject[] {
    this.worldGroup = new THREE.Group();
    scene.add(this.worldGroup);
    this.bodies = [];
    this.gravRings = [];
    this.rollingBoulders = [];
    this.boulderCooldowns.clear();
    this.redTotal = 0;
    this.blueTotal = 0;

    scene.background = new THREE.Color(0xea580c);
    scene.fog = new THREE.FogExp2(0xea580c, 0.0075);

    const hemi = new THREE.HemisphereLight(0xffedd5, 0x7c2d12, 0.8);
    this.worldGroup.add(hemi);

    const sun = new THREE.DirectionalLight(0xfef08a, 1.55);
    sun.position.set(-28, 46, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -48;
    sun.shadow.camera.right = 48;
    sun.shadow.camera.top = 36;
    sun.shadow.camera.bottom = -36;
    this.worldGroup.add(sun);

    // 1. Wide Sandstone Canyon Floor (92m x 62m)
    const floorGeo = new THREE.BoxGeometry(92, 1.0, 62);
    const floorMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createCanyonTexture(),
      roughness: 0.88,
      metalness: 0.05,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, -0.5, 0);
    floorMesh.receiveShadow = true;
    this.worldGroup.add(floorMesh);

    const floorRb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cuboid(46, 0.5, 31), floorRb);
    this.bodies.push(floorRb);

    // Invisible Outer Physics Boundaries + Organic Sculpted Cliff Rim
    this.addInvisibleWall(physicsWorld, rapier, [0, 5, -31], [46, 5, 0.8]);
    this.addInvisibleWall(physicsWorld, rapier, [0, 5, 31], [46, 5, 0.8]);
    this.addInvisibleWall(physicsWorld, rapier, [-46, 5, 0], [0.8, 5, 31]);
    this.addInvisibleWall(physicsWorld, rapier, [46, 5, 0], [0.8, 5, 31]);

    this.buildOrganicCliffPerimeter();

    // High-Altitude Sunset Clouds
    for (const [cx, cy, cz, sc] of [
      [-26, 22, -20, 2.2],
      [18, 24, -22, 2.5],
      [-12, 23, 22, 2.0],
      [28, 21, 18, 2.3],
    ]) {
      const cloud = OrganicPropBuilder.createCloudCluster(sc);
      cloud.position.set(cx, cy, cz);
      this.worldGroup.add(cloud);
    }

    // 2. Central Natural Stone Arch & Sky-Bridge + Sculpted Rock Mesas
    this.buildCentralStoneArchBridge(physicsWorld, rapier);

    // 3. Organic Sculpted Boulder Clusters across the valley (instead of square cubes!)
    const boulderCoords: [number, number, number][] = [
      [-13, -9, 2.1],
      [13, 9, 2.1],
      [-13, 9, 1.9],
      [13, -9, 1.9],
      [-20, -16, 2.4],
      [20, -16, 2.4],
      [-20, 16, 2.4],
      [20, 16, 2.4],
    ];
    for (const [bx, bz, br] of boulderCoords) {
      const boulder = OrganicPropBuilder.createSculptedBoulder(br, 0x9a3412);
      boulder.position.set(bx, br * 0.55, bz);
      this.worldGroup.add(boulder);

      const rb = physicsWorld.createRigidBody(
        rapier.RigidBodyDesc.fixed().setTranslation(bx, br * 0.6, bz)
      );
      physicsWorld.createCollider(rapier.ColliderDesc.ball(br * 0.85), rb);
      this.bodies.push(rb);
    }

    // 4. Two-Story Circular Halo Bunker Bases (Red West x = -30, Blue East x = +30)
    this.buildCircularHaloBase(physicsWorld, rapier, "red", -30, 0);
    this.buildCircularHaloBase(physicsWorld, rapier, "blue", 30, 0);

    // 5. Covenant Purple Gravity Lifts & Man-Cannons
    this.buildGravityLift(0, -17);
    this.buildGravityLift(0, 17);
    this.buildGravityLift(-17.5, 0);
    this.buildGravityLift(17.5, 0);

    // 6. Dynamic Rolling Flaming Meteor Boulders in the Canyon Trenches!
    this.createRollingBoulder(-7.5, 1, 13.5);
    this.createRollingBoulder(7.5, -1, 13.5);

    const objects: InteractiveObject[] = [];

    // Red Flag & Blue Flag on the 2nd-floor roof of each base
    const redFlag: InteractiveObject = {
      id: "flag_red",
      kind: "flag_red",
      points: 5,
      weight: 1.2,
      pos: [-30, 4.2, 0],
      vel: [0, 0, 0],
      rotY: 0,
      carrierId: null,
      helperId: null,
      inZone: null,
    };
    this.spawnObject(physicsWorld, rapier, redFlag);
    objects.push(redFlag);

    const blueFlag: InteractiveObject = {
      id: "flag_blue",
      kind: "flag_blue",
      points: 5,
      weight: 1.2,
      pos: [30, 4.2, 0],
      vel: [0, 0, 0],
      rotY: 0,
      carrierId: null,
      helperId: null,
      inZone: null,
    };
    this.spawnObject(physicsWorld, rapier, blueFlag);
    objects.push(blueFlag);

    // 4 Neutral Power Cores
    const coreCoords: [number, number, number][] = [
      [0, 4.2, 0],
      [0, 1.8, -17],
      [0, 1.8, 17],
      [0, 1.5, 0],
    ];
    coreCoords.forEach(([cx, cy, cz], idx) => {
      const core: InteractiveObject = {
        id: `core_${idx + 1}`,
        kind: "power_core",
        points: 3,
        weight: 1.0,
        pos: [cx, cy, cz],
        vel: [0, 0, 0],
        rotY: 0,
        carrierId: null,
        helperId: null,
        inZone: null,
      };
      this.spawnObject(physicsWorld, rapier, core);
      objects.push(core);
    });

    return objects;
  }

  private buildOrganicCliffPerimeter() {
    for (let x = -44; x <= 44; x += 7.5) {
      const northRock = OrganicPropBuilder.createSculptedBoulder(4.8, 0x7c2d12);
      northRock.position.set(x, 2.2, -31.5);
      northRock.scale.set(1.3, 1.4, 0.9);
      this.worldGroup.add(northRock);

      const southRock = OrganicPropBuilder.createSculptedBoulder(4.8, 0x7c2d12);
      southRock.position.set(x, 2.2, 31.5);
      southRock.scale.set(1.3, 1.4, 0.9);
      this.worldGroup.add(southRock);
    }
    for (let z = -26; z <= 26; z += 7.5) {
      const westRock = OrganicPropBuilder.createSculptedBoulder(4.8, 0x7c2d12);
      westRock.position.set(-46.5, 2.2, z);
      westRock.scale.set(0.9, 1.4, 1.3);
      this.worldGroup.add(westRock);

      const eastRock = OrganicPropBuilder.createSculptedBoulder(4.8, 0x7c2d12);
      eastRock.position.set(46.5, 2.2, z);
      eastRock.scale.set(0.9, 1.4, 1.3);
      this.worldGroup.add(eastRock);
    }
  }

  private buildCentralStoneArchBridge(physicsWorld: RAPIER.World, rapier: typeof RAPIER) {
    // North & South Rounded Sandstone Mesas (z = -11 and z = +11)
    for (const mz of [-11, 11]) {
      const mesaGeo = new THREE.CylinderGeometry(3.8, 4.8, 2.5, 16);
      const mesaMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.85 });
      const mesa = new THREE.Mesh(mesaGeo, mesaMat);
      mesa.position.set(0, 1.25, mz);
      mesa.castShadow = true;
      mesa.receiveShadow = true;
      this.worldGroup.add(mesa);

      const rb = physicsWorld.createRigidBody(
        rapier.RigidBodyDesc.fixed().setTranslation(0, 1.25, mz)
      );
      physicsWorld.createCollider(rapier.ColliderDesc.cylinder(1.25, 4.0), rb);
      this.bodies.push(rb);
    }

    // Elevated Metallic Halo Sky-Bridge spanning between the two mesas at y = 2.45m
    const bridgeGeo = new THREE.BoxGeometry(4.4, 0.35, 16.5);
    const bridgeMat = new THREE.MeshPhysicalMaterial({
      color: 0x475569,
      metalness: 0.65,
      roughness: 0.3,
      clearcoat: 0.5,
    });
    const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
    bridge.position.set(0, 2.45, 0);
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    this.worldGroup.add(bridge);

    const bridgeRb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(0, 2.45, 0)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cuboid(2.2, 0.18, 8.25), bridgeRb);
    this.bodies.push(bridgeRb);
  }

  private buildCircularHaloBase(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    team: TeamId,
    x: number,
    z: number
  ) {
    const color = team === "red" ? 0xef4444 : 0x3b82f6;

    // Sculpted Octagonal/Cylindrical Bunker Base (walkable roof at y = 2.5m)
    const bunkerGeo = new THREE.CylinderGeometry(4.6, 5.2, 2.5, 16);
    const bunkerMat = new THREE.MeshPhysicalMaterial({
      color: 0x475569,
      metalness: 0.55,
      roughness: 0.35,
      clearcoat: 0.4,
    });
    const bunker = new THREE.Mesh(bunkerGeo, bunkerMat);
    bunker.position.set(x, 1.25, z);
    bunker.castShadow = true;
    bunker.receiveShadow = true;
    this.worldGroup.add(bunker);

    // Team glowing trim ring around roof
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.65, 0.16, 10, 32),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 2.5, z);
    this.worldGroup.add(ring);

    const rb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(x, 1.25, z)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cylinder(1.25, 4.7), rb);
    this.bodies.push(rb);

    // Stepped Ramps on North & South sides of the circular bunker
    for (let s = 0; s < 5; s++) {
      const stepZNorth = z - 5.2 - s * 0.95;
      const stepZSouth = z + 5.2 + s * 0.95;
      const stepY = 2.05 - s * 0.4;
      this.addRampStep(physicsWorld, rapier, [x, stepY, stepZNorth], [2.4, 0.22, 0.55]);
      this.addRampStep(physicsWorld, rapier, [x, stepY, stepZSouth], [2.4, 0.22, 0.55]);
    }

    // Scoring Pad behind each base (x = -36.5 and x = +36.5)
    const padGeo = new THREE.CylinderGeometry(3.8, 3.8, 0.16, 32);
    const padMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.55,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    const padX = team === "red" ? x - 6.5 : x + 6.5;
    pad.position.set(padX, 0.08, z);
    this.worldGroup.add(pad);
  }

  private addRampStep(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    pos: [number, number, number],
    half: [number, number, number]
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2),
      new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.4, roughness: 0.4 })
    );
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.worldGroup.add(mesh);

    const rb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2])
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cuboid(half[0], half[1], half[2]), rb);
    this.bodies.push(rb);
  }

  private createRollingBoulder(x: number, dirZ: number, speed: number) {
    const mesh = OrganicPropBuilder.createSculptedBoulder(1.55, 0xdc2626);
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.12, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    mesh.add(glow);
    mesh.position.set(x, 1.5, 0);
    this.worldGroup.add(mesh);
    this.rollingBoulders.push({ mesh, z: 0, dirZ, x, speed });
  }

  private buildGravityLift(x: number, z: number) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.9, 0.22, 24),
      new THREE.MeshPhysicalMaterial({ color: 0x4c1d95, metalness: 0.7, roughness: 0.2 })
    );
    base.position.set(x, 0.11, z);
    this.worldGroup.add(base);

    const geo = new THREE.TorusGeometry(1.55, 0.18, 12, 28);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xc084fc });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.set(x, 0.45, z);
    this.worldGroup.add(ring);
    this.gravRings.push(ring);
  }

  private spawnObject(physicsWorld: RAPIER.World, rapier: typeof RAPIER, obj: InteractiveObject) {
    const mesh = createInteractiveObjectMesh(obj);
    mesh.position.set(obj.pos[0], obj.pos[1], obj.pos[2]);
    this.worldGroup.add(mesh);
    obj.mesh = mesh;

    const rbDesc = rapier.RigidBodyDesc.dynamic()
      .setTranslation(obj.pos[0], obj.pos[1], obj.pos[2])
      .setLinearDamping(1.2)
      .setAngularDamping(2.0);
    const rb = physicsWorld.createRigidBody(rbDesc);
    const colDesc = rapier.ColliderDesc.ball(0.48).setRestitution(0.4).setFriction(0.6);
    physicsWorld.createCollider(colDesc, rb);
    obj.body = rb;
    this.bodies.push(rb);
  }

  private addInvisibleWall(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    pos: [number, number, number],
    halfExtents: [number, number, number]
  ) {
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
    for (const r of this.gravRings) {
      r.position.y = 0.45 + Math.sin(elapsedTime * 5) * 0.22;
      r.rotation.y += dt * 3;
    }

    // Update Rolling Flaming Meteor Boulders
    for (const b of this.rollingBoulders) {
      b.z += b.dirZ * b.speed * dt;
      if (b.z > 24) {
        b.z = 24;
        b.dirZ = -1;
      } else if (b.z < -24) {
        b.z = -24;
        b.dirZ = 1;
      }
      b.mesh.position.set(b.x, 1.5, b.z);
      b.mesh.rotation.x += b.dirZ * dt * 4.5;

      players.forEach((p) => {
        if (!p.body) return;
        const cd = this.boulderCooldowns.get(p.id) || 0;
        if (elapsedTime < cd) return;
        if (Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < 2.2 && p.pos.y < 2.3) {
          this.boulderCooldowns.set(p.id, elapsedTime + 1.8);
          p.body.setLinvel({ x: (p.pos.x >= b.x ? 1 : -1) * 14, y: 10.5, z: b.dirZ * 8 }, true);
        }
      });
    }

    // Directional Man-Cannons at (-17.5, 0) and (+17.5, 0) + Vertical Lifts at (0, ±17)
    players.forEach((p) => {
      if (!p.body) return;
      if (Math.hypot(p.pos.x - -17.5, p.pos.z) < 1.9 && p.pos.y < 1.3) {
        p.body.setLinvel({ x: 14.5, y: 13.5, z: 0 }, true);
      } else if (Math.hypot(p.pos.x - 17.5, p.pos.z) < 1.9 && p.pos.y < 1.3) {
        p.body.setLinvel({ x: -14.5, y: 13.5, z: 0 }, true);
      } else if (
        (Math.hypot(p.pos.x, p.pos.z - -17) < 1.9 || Math.hypot(p.pos.x, p.pos.z - 17) < 1.9) &&
        p.pos.y < 1.3
      ) {
        const lv = p.body.linvel();
        p.body.setLinvel({ x: lv.x, y: 14.5, z: lv.z }, true);
      }
    });

    // Check scoring at Red Pad (-36.5, 0) & Blue Pad (+36.5, 0)
    for (const obj of objects) {
      if (!obj.body || !obj.mesh) continue;
      if (!obj.carrierId) {
        const t = obj.body.translation();
        obj.pos = [t.x, t.y, t.z];
        obj.mesh.position.set(t.x, Math.max(0.05, t.y - 0.4), t.z);
      }

      const ox = obj.pos[0];
      const oz = obj.pos[2];
      const inRedPad = Math.hypot(ox - -36.5, oz) < 3.8 && obj.kind !== "flag_red";
      const inBluePad = Math.hypot(ox - 36.5, oz) < 3.8 && obj.kind !== "flag_blue";

      if (inRedPad || inBluePad) {
        const team: TeamId = inRedPad ? "red" : "blue";
        const scorerId = obj.carrierId || undefined;
        if (team === "red") this.redTotal += obj.points;
        else this.blueTotal += obj.points;

        obj.carrierId = null;
        obj.helperId = null;
        const respawn: [number, number, number] =
          obj.kind === "flag_blue"
            ? [30, 4.2, 0]
            : obj.kind === "flag_red"
            ? [-30, 4.2, 0]
            : [0, 4.2, 0];
        obj.pos = respawn;
        obj.body.setTranslation({ x: respawn[0], y: respawn[1], z: respawn[2] }, true);
        obj.body.setLinvel({ x: 0, y: 2, z: 0 }, true);
        obj.mesh.position.set(respawn[0], respawn[1], respawn[2]);

        callbacks.onScoreChange(this.redTotal, this.blueTotal, team, obj.points, scorerId);
      }
    }
  }

  public getSpawnPoint(team: TeamId, index: number): [number, number, number] {
    const zOffsets = [-7.5, 7.5, -11.0, 11.0, 0];
    const z = zOffsets[index % zOffsets.length];
    return team === "red" ? [-23.0, 2.0, z] : [23.0, 2.0, z];
  }

  public getGoalPosition(team: TeamId): THREE.Vector3 {
    return team === "red" ? new THREE.Vector3(-36.5, 0.5, 0) : new THREE.Vector3(36.5, 0.5, 0);
  }

  public dispose(scene: THREE.Scene, physicsWorld: RAPIER.World): void {
    scene.remove(this.worldGroup);
    for (const b of this.bodies) {
      try {
        physicsWorld.removeRigidBody(b);
      } catch {}
    }
    this.bodies = [];
    this.rollingBoulders = [];
  }
}
