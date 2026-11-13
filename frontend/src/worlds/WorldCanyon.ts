import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { InteractiveObject, IWorldModule, TeamId } from "../types/game";
import { createInteractiveObjectMesh } from "../engine/CharacterMesh";

export class WorldCanyon implements IWorldModule {
  public id = "canyon" as const;
  public name = "Cañón Clásico 2.0 (Blood Gulch)";
  public subtitle =
    "¡Sube al Puente Colgante central, usa los Cañones de Impulso morados y captura la Bandera enemiga (5 pts) o los Núcleos (3 pts)!";

  private worldGroup: THREE.Group = new THREE.Group();
  private bodies: RAPIER.RigidBody[] = [];
  private redTotal = 0;
  private blueTotal = 0;
  private gravRings: THREE.Mesh[] = [];

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
    this.redTotal = 0;
    this.blueTotal = 0;

    scene.background = new THREE.Color(0xf97316);
    scene.fog = new THREE.FogExp2(0xf97316, 0.011);

    const amb = new THREE.AmbientLight(0xffedd5, 0.68);
    this.worldGroup.add(amb);

    const sun = new THREE.DirectionalLight(0xfef08a, 1.35);
    sun.position.set(-22, 36, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    this.worldGroup.add(sun);

    // Canyon Floor
    this.addStaticBox(physicsWorld, rapier, [0, -0.5, 0], [30, 0.5, 20], 0xc2410c, true);

    // Canyon Outer Cliffs
    this.addStaticBox(physicsWorld, rapier, [0, 3.5, -20], [30, 3.5, 1.0], 0x7c2d12);
    this.addStaticBox(physicsWorld, rapier, [0, 3.5, 20], [30, 3.5, 1.0], 0x7c2d12);
    this.addStaticBox(physicsWorld, rapier, [-30, 3.5, 0], [1.0, 3.5, 20], 0x7c2d12);
    this.addStaticBox(physicsWorld, rapier, [30, 3.5, 0], [1.0, 3.5, 20], 0x7c2d12);

    // Central High Sky-Bridge (y = 2.6m) + North & South Rock Mesas with Stepped Ramps!
    this.buildCentralSkyBridge(physicsWorld, rapier);

    // Tactical Rock Pillars & Trenches
    this.addStaticBox(physicsWorld, rapier, [-9, 1.0, -6.5], [1.8, 1.0, 1.6], 0x9a3412);
    this.addStaticBox(physicsWorld, rapier, [9, 1.0, 6.5], [1.8, 1.0, 1.6], 0x9a3412);
    this.addStaticBox(physicsWorld, rapier, [-9, 1.0, 6.5], [1.8, 1.0, 1.6], 0x9a3412);
    this.addStaticBox(physicsWorld, rapier, [9, 1.0, -6.5], [1.8, 1.0, 1.6], 0x9a3412);

    // Two-Story Halo Bunker Bases (Red West x = -21, Blue East x = +21)
    this.buildTwoStoryBunkerBase(physicsWorld, rapier, "red", -21, 0);
    this.buildTwoStoryBunkerBase(physicsWorld, rapier, "blue", 21, 0);

    // Covenant Purple Gravity Lifts & Man-Cannons
    this.buildGravityLift(0, -13);
    this.buildGravityLift(0, 13);
    this.buildGravityLift(-12.5, 0);
    this.buildGravityLift(12.5, 0);

    const objects: InteractiveObject[] = [];

    // Red Flag & Blue Flag on the 2nd-floor roof of each base!
    const redFlag: InteractiveObject = {
      id: "flag_red",
      kind: "flag_red",
      points: 5,
      weight: 1.2,
      pos: [-21, 3.8, 0],
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
      pos: [21, 3.8, 0],
      vel: [0, 0, 0],
      rotY: 0,
      carrierId: null,
      helperId: null,
      inZone: null,
    };
    this.spawnObject(physicsWorld, rapier, blueFlag);
    objects.push(blueFlag);

    // 3 Neutral Power Cores (1 on top of the Sky-Bridge, 2 near the Gravity Lifts)
    const coreCoords: [number, number, number][] = [
      [0, 4.0, 0],
      [0, 1.8, -13],
      [0, 1.8, 13],
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

  private buildCentralSkyBridge(physicsWorld: RAPIER.World, rapier: typeof RAPIER) {
    // North & South Rock Mesas (z = -8.5 and z = +8.5, y = 2.4m)
    this.addStaticBox(physicsWorld, rapier, [0, 1.2, -8.5], [3.2, 1.2, 2.5], 0x9a3412);
    this.addStaticBox(physicsWorld, rapier, [0, 1.2, 8.5], [3.2, 1.2, 2.5], 0x9a3412);

    // Elevated Metallic Bridge spanning between the two mesas over (0,0) at y = 2.35m!
    this.addStaticBox(physicsWorld, rapier, [0, 2.35, 0], [2.0, 0.2, 6.2], 0x475569);
  }

  private buildTwoStoryBunkerBase(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    team: TeamId,
    x: number,
    z: number
  ) {
    const color = team === "red" ? 0xef4444 : 0x3b82f6;
    // Main Bunker Structure (Roof is walkable at y = 2.4m!)
    this.addStaticBox(physicsWorld, rapier, [x, 1.2, z], [3.4, 1.2, 4.4], 0x475569);

    // Stepped Ramps on North & South sides of the bunker so players can run up to the roof!
    for (let s = 0; s < 5; s++) {
      const stepZNorth = z - 5.0 - s * 0.9;
      const stepZSouth = z + 5.0 + s * 0.9;
      const stepY = 2.0 - s * 0.4;
      this.addStaticBox(physicsWorld, rapier, [x, stepY, stepZNorth], [2.2, 0.2, 0.55], 0x64748b);
      this.addStaticBox(physicsWorld, rapier, [x, stepY, stepZSouth], [2.2, 0.2, 0.55], 0x64748b);
    }

    // Scoring Pad behind/in-front of base
    const padGeo = new THREE.CylinderGeometry(3.4, 3.4, 0.16, 24);
    const padMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.45,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    const padX = team === "red" ? x - 4.8 : x + 4.8;
    pad.position.set(padX, 0.08, z);
    this.worldGroup.add(pad);
  }

  private buildGravityLift(x: number, z: number) {
    const geo = new THREE.TorusGeometry(1.5, 0.18, 8, 24);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xc084fc });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.set(x, 0.35, z);
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
      r.position.y = 0.35 + Math.sin(elapsedTime * 5) * 0.2;
      r.rotation.y += dt * 3;
    }

    // Directional Man-Cannons at (-12.5, 0) and (+12.5, 0) launching toward the Central Sky-Bridge!
    players.forEach((p) => {
      if (!p.body) return;
      if (Math.hypot(p.pos.x - -12.5, p.pos.z) < 1.7 && p.pos.y < 1.2) {
        p.body.setLinvel({ x: 11.5, y: 12.5, z: 0 }, true);
      } else if (Math.hypot(p.pos.x - 12.5, p.pos.z) < 1.7 && p.pos.y < 1.2) {
        p.body.setLinvel({ x: -11.5, y: 12.5, z: 0 }, true);
      } else if (
        (Math.hypot(p.pos.x, p.pos.z - -13) < 1.7 || Math.hypot(p.pos.x, p.pos.z - 13) < 1.7) &&
        p.pos.y < 1.2
      ) {
        const lv = p.body.linvel();
        p.body.setLinvel({ x: lv.x, y: 13.5, z: lv.z }, true);
      }
    });

    // Check scoring at Red Pad (-25.8, 0) & Blue Pad (+25.8, 0)
    for (const obj of objects) {
      if (!obj.body || !obj.mesh) continue;
      if (!obj.carrierId) {
        const t = obj.body.translation();
        obj.pos = [t.x, t.y, t.z];
        obj.mesh.position.set(t.x, Math.max(0.05, t.y - 0.4), t.z);
      }

      const ox = obj.pos[0];
      const oz = obj.pos[2];
      const inRedPad = Math.hypot(ox - -25.8, oz) < 3.4 && obj.kind !== "flag_red";
      const inBluePad = Math.hypot(ox - 25.8, oz) < 3.4 && obj.kind !== "flag_blue";

      if (inRedPad || inBluePad) {
        const team: TeamId = inRedPad ? "red" : "blue";
        const scorerId = obj.carrierId || undefined;
        if (team === "red") this.redTotal += obj.points;
        else this.blueTotal += obj.points;

        obj.carrierId = null;
        obj.helperId = null;
        const respawn: [number, number, number] =
          obj.kind === "flag_blue"
            ? [21, 3.8, 0]
            : obj.kind === "flag_red"
            ? [-21, 3.8, 0]
            : [0, 4.0, 0];
        obj.pos = respawn;
        obj.body.setTranslation({ x: respawn[0], y: respawn[1], z: respawn[2] }, true);
        obj.body.setLinvel({ x: 0, y: 2, z: 0 }, true);
        obj.mesh.position.set(respawn[0], respawn[1], respawn[2]);

        callbacks.onScoreChange(this.redTotal, this.blueTotal, team, obj.points, scorerId);
      }
    }
  }

  public getSpawnPoint(team: TeamId, index: number): [number, number, number] {
    const zOffsets = [-6.5, 6.5, -9.5, 9.5, 0];
    const z = zOffsets[index % zOffsets.length];
    return team === "red" ? [-16.5, 2.0, z] : [16.5, 2.0, z];
  }

  public getGoalPosition(team: TeamId): THREE.Vector3 {
    return team === "red" ? new THREE.Vector3(-25.8, 0.5, 0) : new THREE.Vector3(25.8, 0.5, 0);
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
