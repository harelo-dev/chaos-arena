import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { InteractiveObject, IWorldModule, TeamId } from "../types/game";
import { createInteractiveObjectMesh } from "../engine/CharacterMesh";
import { OrganicPropBuilder, TextureGenerator } from "../engine/TextureGenerator";

interface CrazyTractor {
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  x: number;
  zMin: number;
  zMax: number;
  speed: number;
  phase: number;
}

export class WorldGranja implements IWorldModule {
  public id = "granja" as const;
  public name = "Valle de la Granja (Mundo Abierto)";
  public subtitle =
    "¡Esquiva los Tractores Locos, cruza los puentes de troncos o piedras del río, y encierra los pollos (3 Pollos Dorados de 5 pts) en tu corral!";

  private worldGroup: THREE.Group = new THREE.Group();
  private bodies: RAPIER.RigidBody[] = [];
  private windmillBlades: THREE.Group | null = null;
  private sweeperMesh: THREE.Group | null = null;
  private sweeperBody: RAPIER.RigidBody | null = null;
  private sweeperAngle: number = 0;
  private tractors: CrazyTractor[] = [];
  private clouds: THREE.Group[] = [];

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
    this.tractors = [];
    this.clouds = [];
    this.lastRedScore = 0;
    this.lastBlueScore = 0;
    this.sweeperAngle = 0;

    // Warm Golden-Hour Sky & Hemisphere Lighting
    scene.background = new THREE.Color(0x38bdf8);
    scene.fog = new THREE.FogExp2(0x7dd3fc, 0.0065);

    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x166534, 0.85);
    this.worldGroup.add(hemi);

    const sun = new THREE.DirectionalLight(0xfffbeb, 1.65);
    sun.position.set(35, 52, 28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -48;
    sun.shadow.camera.right = 48;
    sun.shadow.camera.top = 48;
    sun.shadow.camera.bottom = -48;
    this.worldGroup.add(sun);

    const grassTex = TextureGenerator.createGrassTexture();
    const woodTex = TextureGenerator.createWoodTexture();

    // Expansive Valley Floor (West Meadow & East Meadow separated by a wide scenic River)
    this.addTexturedGround(physicsWorld, rapier, [-22, -0.5, 0], [18, 0.5, 28], grassTex);
    this.addTexturedGround(physicsWorld, rapier, [22, -0.5, 0], [18, 0.5, 28], grassTex);
    // Riverbed floor
    this.addStaticCylinder(physicsWorld, rapier, [0, -1.1, 0], 40, 0.5, 0x0369a1);

    // Shimmering Translucent River Water
    const waterGeo = new THREE.PlaneGeometry(8.5, 56);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.78,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(0, -0.12, 0);
    this.worldGroup.add(water);

    // Central Rounded Island in the River (Cylinder + Sculpted Rock Rim)
    this.addStaticCylinder(physicsWorld, rapier, [0, 0.15, 0], 5.2, 0.45, 0x65a30d);

    // River Stepping Stones (Round boulders you can hop across!)
    const stoneZ = [-18, -15, 15, 18];
    for (const sz of stoneZ) {
      this.addStaticCylinder(
        physicsWorld,
        rapier,
        [(sz % 2 === 0 ? -1.2 : 1.2), 0.1, sz],
        1.35,
        0.35,
        0x64748b
      );
    }

    // Double-Blade Rotating Sweeper Obstacle on the Central Island!
    this.buildCentralSweeper(physicsWorld, rapier, 0, 0.95, 0);

    // 2 Arched Log Bridges crossing the River at z = -10 and z = +10
    this.buildLogBridge(physicsWorld, rapier, 0, -10, woodTex);
    this.buildLogBridge(physicsWorld, rapier, 0, 10, woodTex);

    // Sculpted Rolling Green Hills on the North & South Horizons (Walkable!)
    this.buildRollingHill(physicsWorld, rapier, -14, -20, 6.5, 2.4);
    this.buildRollingHill(physicsWorld, rapier, 14, -20, 6.5, 2.4);
    this.buildRollingHill(physicsWorld, rapier, -14, 20, 6.5, 2.4);
    this.buildRollingHill(physicsWorld, rapier, 14, 20, 6.5, 2.4);

    // Outer Valley Wooden Post Boundaries (80m x 56m arena!)
    this.addStaticBox(physicsWorld, rapier, [0, 1.8, -28], [40, 2.2, 0.6], 0x78350f);
    this.addStaticBox(physicsWorld, rapier, [0, 1.8, 28], [40, 2.2, 0.6], 0x78350f);
    this.addStaticBox(physicsWorld, rapier, [-40, 1.8, 0], [0.6, 2.2, 28], 0x78350f);
    this.addStaticBox(physicsWorld, rapier, [40, 1.8, 0], [0.6, 2.2, 28], 0x78350f);

    // Red Corral (West: x = -30) & Blue Corral (East: x = +30)
    this.buildCorral(physicsWorld, rapier, "red", -30.0, 0);
    this.buildCorral(physicsWorld, rapier, "blue", 30.0, 0);

    // 2 Autonomous Crazy Tractors patrolling the West & East roads!
    this.spawnCrazyTractor(physicsWorld, rapier, -11.5, -18, 18, 1.35, 0, 0xdc2626);
    this.spawnCrazyTractor(physicsWorld, rapier, 11.5, -18, 18, 1.35, Math.PI, 0xfacc15);

    // Cylindrical Rolled Hay Bales scattered for cover & jumping
    const hayCoords: [number, number][] = [
      [-17, -9],
      [-17, 9],
      [17, -9],
      [17, 9],
      [-8, 0],
      [8, 0],
    ];
    for (const [hx, hz] of hayCoords) {
      this.buildRoundHayBale(physicsWorld, rapier, hx, hz);
    }

    // Lush Organic Trees & Sculpted Boulders around the Valley
    const treeSpots: [number, number, number, number][] = [
      [-24, -22, 1.25, 0x15803d],
      [-33, -18, 1.1, 0x16a34a],
      [-24, 22, 1.3, 0x15803d],
      [-33, 18, 1.15, 0x22c55e],
      [24, -22, 1.25, 0x15803d],
      [33, -18, 1.1, 0x16a34a],
      [24, 22, 1.3, 0x15803d],
      [33, 18, 1.15, 0x22c55e],
      [-6, -23, 1.35, 0x16a34a],
      [6, 23, 1.35, 0x16a34a],
    ];
    for (const [tx, tz, sc, col] of treeSpots) {
      const tree = OrganicPropBuilder.createOrganicTree(sc, col);
      tree.position.set(tx, 0, tz);
      this.worldGroup.add(tree);
    }

    // Fluffy Volumetric 3D Clouds in the Sky
    const cloudCoords: [number, number, number, number][] = [
      [-25, 22, -20, 1.6],
      [18, 25, -15, 1.9],
      [0, 24, 22, 1.7],
      [-20, 26, 15, 1.4],
      [28, 23, 12, 1.5],
    ];
    for (const [cx, cy, cz, sc] of cloudCoords) {
      const cl = OrganicPropBuilder.createCloudCluster(sc);
      cl.position.set(cx, cy, cz);
      this.worldGroup.add(cl);
      this.clouds.push(cl);
    }

    this.buildSilo(-35, -14, 0xdc2626);
    this.buildSilo(35, 14, 0x2563eb);
    this.buildWindmill(0, -25);

    // Spawn 16 Normal Chickens + 3 Golden Chickens (1 on central island, 2 on the rolling hills!)
    const objects: InteractiveObject[] = [];
    for (let i = 0; i < 19; i++) {
      const isGold = i >= 16;
      const angle = (Math.PI * 2 * i) / 16;
      let x = Math.cos(angle) * (7 + (i % 3) * 4.5);
      let z = Math.sin(angle) * (6 + (i % 4) * 3.8);
      let y = 1.6;

      if (i === 16) {
        x = 0;
        y = 2.5;
        z = 0;
      } else if (i === 17) {
        x = -14;
        y = 3.8;
        z = -20;
      } else if (i === 18) {
        x = 14;
        y = 3.8;
        z = 20;
      }

      const obj: InteractiveObject = {
        id: isGold ? `chicken_gold_${i - 15}` : `chicken_${i + 1}`,
        kind: isGold ? "golden_chicken" : "chicken",
        points: isGold ? 5 : 1,
        weight: 1.0,
        pos: [x, y, z],
        vel: [0, 0, 0],
        rotY: Math.random() * Math.PI * 2,
        carrierId: null,
        helperId: null,
        inZone: null,
        aiTimer: Math.random() * 1.2,
        aiDir: [Math.cos(angle), Math.sin(angle)],
      };

      const mesh = createInteractiveObjectMesh(obj);
      mesh.position.set(obj.pos[0], obj.pos[1], obj.pos[2]);
      this.worldGroup.add(mesh);
      obj.mesh = mesh;

      const rbDesc = rapier.RigidBodyDesc.dynamic()
        .setTranslation(obj.pos[0], obj.pos[1], obj.pos[2])
        .setLinearDamping(1.1)
        .setAngularDamping(2.5);
      const rb = physicsWorld.createRigidBody(rbDesc);
      const colDesc = rapier.ColliderDesc.ball(isGold ? 0.48 : 0.36)
        .setRestitution(0.48)
        .setFriction(0.55);
      physicsWorld.createCollider(colDesc, rb);
      obj.body = rb;
      this.bodies.push(rb);

      objects.push(obj);
    }

    return objects;
  }

  private addTexturedGround(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    pos: [number, number, number],
    halfExtents: [number, number, number],
    texture: THREE.Texture
  ) {
    const geo = new THREE.BoxGeometry(halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.82,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.receiveShadow = true;
    this.worldGroup.add(mesh);

    const rb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2])
    );
    physicsWorld.createCollider(
      rapier.ColliderDesc.cuboid(halfExtents[0], halfExtents[1], halfExtents[2]),
      rb
    );
    this.bodies.push(rb);
  }

  private addStaticCylinder(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    pos: [number, number, number],
    radius: number,
    halfHeight: number,
    colorHex: number
  ) {
    const geo = new THREE.CylinderGeometry(radius, radius * 1.08, halfHeight * 2, 24);
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.worldGroup.add(mesh);

    const rb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2])
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cylinder(halfHeight, radius), rb);
    this.bodies.push(rb);
  }

  private buildRollingHill(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    x: number,
    z: number,
    radius: number,
    height: number
  ) {
    // Smooth terraced organic hill (3 stacked wide rounded cylinders so players can run right up!)
    const colors = [0x22c55e, 0x4ade80, 0x86efac];
    for (let i = 0; i < 3; i++) {
      const r = radius * (1 - i * 0.25);
      const y = (i + 0.5) * (height / 3);
      this.addStaticCylinder(physicsWorld, rapier, [x, y - 0.1, z], r, height / 6, colors[i]);
    }
    const boulder = OrganicPropBuilder.createSculptedBoulder(1.2, 0x64748b);
    boulder.position.set(x + 1.5, height, z - 1.0);
    this.worldGroup.add(boulder);
  }

  private buildRoundHayBale(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    x: number,
    z: number
  ) {
    const geo = new THREE.CylinderGeometry(1.05, 1.05, 1.5, 18);
    geo.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.75 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1.05, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.worldGroup.add(mesh);

    const rb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(x, 1.05, z)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.ball(1.05), rb);
    this.bodies.push(rb);
  }

  private spawnCrazyTractor(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    x: number,
    zMin: number,
    zMax: number,
    speed: number,
    phase: number,
    colorHex: number
  ) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: colorHex,
      roughness: 0.25,
      metalness: 0.3,
      clearcoat: 0.7,
    });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });

    // Tractor Chassis & Hood
    const hood = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.4, 12, 16), bodyMat);
    hood.rotation.x = Math.PI / 2;
    hood.position.set(0, 1.1, 0);
    hood.castShadow = true;
    group.add(hood);

    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.75, 1.1, 12), bodyMat);
    cab.position.set(0, 1.85, -0.35);
    group.add(cab);

    // Exhaust Pipe
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), tireMat);
    pipe.position.set(0.45, 1.9, 0.55);
    group.add(pipe);

    // 4 Round Tires
    const wheelGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.42, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    [
      [-0.9, 0.65, -0.7],
      [0.9, 0.65, -0.7],
      [-0.85, 0.5, 0.85],
      [0.85, 0.5, 0.85],
    ].forEach(([wx, wy, wz]) => {
      const w = new THREE.Mesh(wheelGeo, tireMat);
      w.position.set(wx, wy, wz);
      group.add(w);
    });

    group.position.set(x, 0, 0);
    this.worldGroup.add(group);

    const rb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 1.0, 0)
    );
    physicsWorld.createCollider(
      rapier.ColliderDesc.cuboid(1.1, 1.0, 1.4).setRestitution(1.1),
      rb
    );
    this.bodies.push(rb);

    this.tractors.push({ mesh: group, body: rb, x, zMin, zMax, speed, phase });
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
    const barMat = new THREE.MeshPhysicalMaterial({
      color: 0xef4444,
      roughness: 0.25,
      clearcoat: 0.8,
    });

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.5, 16), postMat);
    this.sweeperMesh.add(post);

    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 7.6, 12, 16), barMat);
    bar.rotation.z = Math.PI / 2;
    bar.castShadow = true;
    this.sweeperMesh.add(bar);
    this.worldGroup.add(this.sweeperMesh);

    const rbDesc = rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z);
    this.sweeperBody = physicsWorld.createRigidBody(rbDesc);
    const colDesc = rapier.ColliderDesc.cuboid(4.0, 0.26, 0.26).setRestitution(0.95);
    physicsWorld.createCollider(colDesc, this.sweeperBody);
    this.bodies.push(this.sweeperBody);
  }

  private buildLogBridge(
    physicsWorld: RAPIER.World,
    rapier: typeof RAPIER,
    x: number,
    z: number,
    woodTex: THREE.Texture
  ) {
    const mat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 });
    // Gently arched log planks
    for (let i = -5; i <= 5; i++) {
      const lx = x + i * 0.9;
      const archY = 0.15 + Math.cos((i / 5) * (Math.PI / 2)) * 0.45;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.2, 12), mat);
      log.rotation.x = Math.PI / 2;
      log.position.set(lx, archY, z);
      log.castShadow = true;
      log.receiveShadow = true;
      this.worldGroup.add(log);
    }

    // Physics collider for bridge deck & ramps
    const rb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(x, 0.35, z)
    );
    physicsWorld.createCollider(rapier.ColliderDesc.cuboid(5.2, 0.25, 2.1), rb);
    this.bodies.push(rb);
  }

  private buildSilo(x: number, z: number, domeColor: number) {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.35,
      roughness: 0.35,
    });
    const domeMat = new THREE.MeshPhysicalMaterial({
      color: domeColor,
      roughness: 0.3,
      clearcoat: 0.6,
    });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 9.0, 20), bodyMat);
    cyl.position.set(x, 4.5, z);
    cyl.castShadow = true;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 16), domeMat);
    dome.position.set(x, 9.0, z);
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

    const zoneGeo = new THREE.CylinderGeometry(6.2, 6.2, 0.14, 32);
    const zoneMat = new THREE.MeshStandardMaterial({
      color: floorColor,
      emissive: color,
      emissiveIntensity: 0.28,
      roughness: 0.5,
    });
    const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
    zoneMesh.position.set(centerX, 0.06, centerZ);
    zoneMesh.receiveShadow = true;
    this.worldGroup.add(zoneMesh);

    const halfW = 5.0;
    const halfD = 6.2;
    const fenceH = 0.9;
    const backX = team === "red" ? centerX - halfW : centerX + halfW;
    const frontX = team === "red" ? centerX + halfW : centerX - halfW;

    this.addStaticBox(
      physicsWorld,
      rapier,
      [centerX, fenceH, centerZ - halfD],
      [halfW, fenceH, 0.25],
      color
    );
    this.addStaticBox(
      physicsWorld,
      rapier,
      [centerX, fenceH, centerZ + halfD],
      [halfW, fenceH, 0.25],
      color
    );
    this.addStaticBox(
      physicsWorld,
      rapier,
      [backX, fenceH, centerZ],
      [0.25, fenceH, halfD],
      color
    );
    this.addStaticBox(
      physicsWorld,
      rapier,
      [frontX, fenceH, centerZ - 4.3],
      [0.25, fenceH, 1.9],
      color
    );
    this.addStaticBox(
      physicsWorld,
      rapier,
      [frontX, fenceH, centerZ + 4.3],
      [0.25, fenceH, 1.9],
      color
    );

    const gateGeo = new THREE.BoxGeometry(0.32, 1.6, 4.6);
    const gateMat = new THREE.MeshStandardMaterial({
      color: team === "red" ? 0xb91c1c : 0x1d4ed8,
      roughness: 0.4,
    });
    const gateMesh = new THREE.Mesh(gateGeo, gateMat);
    gateMesh.position.set(frontX, 0.8, centerZ);
    gateMesh.castShadow = true;
    this.worldGroup.add(gateMesh);

    const rbDesc = rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(
      frontX,
      0.8,
      centerZ
    );
    const gateBody = physicsWorld.createRigidBody(rbDesc);
    const colDesc = rapier.ColliderDesc.cuboid(0.18, 0.8, 2.3);
    physicsWorld.createCollider(colDesc, gateBody);
    this.bodies.push(gateBody);

    const switchGeo = new THREE.CylinderGeometry(0.38, 0.45, 1.9, 14);
    const switchMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xd97706,
      emissiveIntensity: 0.35,
    });
    const switchMesh = new THREE.Mesh(switchGeo, switchMat);
    switchMesh.position.set(frontX, 0.95, centerZ - 2.7);
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
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.55 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.6, 13, 16), towerMat);
    tower.position.set(x, 6.5, z);
    tower.castShadow = true;
    this.worldGroup.add(tower);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(1.75, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x78350f })
    );
    cap.position.set(x, 13.0, z);
    this.worldGroup.add(cap);

    this.windmillBlades = new THREE.Group();
    this.windmillBlades.position.set(x, 10.5, z + 2.1);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7 });
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.75, 6.8, 0.14), bladeMat);
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
    colorHex: number
  ) {
    const geo = new THREE.BoxGeometry(halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2);
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.worldGroup.add(mesh);

    const rb = physicsWorld.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2])
    );
    physicsWorld.createCollider(
      rapier.ColliderDesc.cuboid(halfExtents[0], halfExtents[1], halfExtents[2]),
      rb
    );
    this.bodies.push(rb);
  }

  public update(
    dt: number,
    elapsedTime: number,
    objects: InteractiveObject[],
    players: Map<
      string,
      {
        pos: THREE.Vector3;
        team: TeamId;
        id: string;
        stunnedUntil: number;
        body?: RAPIER.RigidBody;
      }
    >,
    gates: { red_gate: boolean; blue_gate: boolean; vault_locked: boolean },
    callbacks: {
      onScoreChange: (
        redScore: number,
        blueScore: number,
        deltaTeam?: TeamId,
        deltaPts?: number,
        scorerId?: string
      ) => void;
      onLaserTrip: (playerId: string, pos: THREE.Vector3) => void;
      onGateHint: (hintText: string | null) => void;
    }
  ): void {
    if (this.windmillBlades) {
      this.windmillBlades.rotation.z += dt * 0.9;
    }

    // Drift sky clouds gently
    for (const cl of this.clouds) {
      cl.position.x += dt * 0.6;
      if (cl.position.x > 45) cl.position.x = -45;
    }

    // Rotate central double-sweeper
    if (this.sweeperMesh && this.sweeperBody) {
      this.sweeperAngle += dt * 2.4;
      this.sweeperMesh.rotation.y = this.sweeperAngle;
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.sweeperAngle
      );
      this.sweeperBody.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }

    // Update Autonomous Crazy Tractors & knock back players hit by them!
    for (const tr of this.tractors) {
      const s = Math.sin(elapsedTime * tr.speed + tr.phase);
      const c = Math.cos(elapsedTime * tr.speed + tr.phase);
      const z = ((tr.zMin + tr.zMax) / 2) + s * ((tr.zMax - tr.zMin) / 2);
      tr.mesh.position.set(tr.x, 0, z);
      tr.mesh.rotation.y = c >= 0 ? 0 : Math.PI;
      tr.body.setNextKinematicTranslation({ x: tr.x, y: 1.0, z });

      players.forEach((p) => {
        if (Math.hypot(p.pos.x - tr.x, p.pos.z - z) < 2.2 && p.pos.y < 2.0 && p.body) {
          p.body.setLinvel(
            { x: (p.pos.x >= tr.x ? 1 : -1) * 14, y: 10.5, z: c >= 0 ? 12 : -12 },
            true
          );
        }
      });
    }

    // River current: push players wading in the river
    players.forEach((p) => {
      if (p.body && Math.abs(p.pos.x) < 3.8 && Math.abs(p.pos.z) > 5.0 && p.pos.y < 0.15) {
        const lv = p.body.linvel();
        p.body.setLinvel({ x: lv.x, y: lv.y, z: lv.z + 12.0 * dt }, true);
      }
    });

    // Update Red & Blue corral gates
    if (this.redGateMesh && this.redGateBody) {
      const targetY = gates.red_gate ? -1.5 : 0.8;
      this.redGateMesh.position.y = THREE.MathUtils.lerp(
        this.redGateMesh.position.y,
        targetY,
        dt * 8
      );
      this.redGateBody.setNextKinematicTranslation({
        x: -25.0,
        y: this.redGateMesh.position.y,
        z: 0,
      });
    }
    if (this.blueGateMesh && this.blueGateBody) {
      const targetY = gates.blue_gate ? -1.5 : 0.8;
      this.blueGateMesh.position.y = THREE.MathUtils.lerp(
        this.blueGateMesh.position.y,
        targetY,
        dt * 8
      );
      this.blueGateBody.setNextKinematicTranslation({
        x: 25.0,
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

      // Red Corral at (-30, 0), Blue Corral at (+30, 0)
      const inRed = t.x >= -35.0 && t.x <= -25.0 && Math.abs(t.z) <= 6.2;
      const inBlue = t.x >= 25.0 && t.x <= 35.0 && Math.abs(t.z) <= 6.2;

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
      if (obj.aiTimer <= 0 && t.y < 3.5) {
        obj.aiTimer = 0.45 + Math.random() * 0.65;

        let fleeX = 0;
        let fleeZ = 0;
        let minDist = 8.5;
        players.forEach((p) => {
          const dx = t.x - p.pos.x;
          const dz = t.z - p.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < minDist && dist > 0.01) {
            minDist = dist;
            // Smart zigzag evade!
            const perpX = -dz / dist;
            const perpZ = dx / dist;
            const zig = (Math.random() - 0.5) * 0.8;
            fleeX = dx / dist + perpX * zig;
            fleeZ = dz / dist + perpZ * zig;
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

        const speed = obj.kind === "golden_chicken" ? 5.8 : 4.1;
        obj.body.setLinvel({ x: fleeX * speed, y: 4.4, z: fleeZ * speed }, true);
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
    const zOffsets = [0, -3.0, 3.0, -6.0, 6.0];
    const z = zOffsets[index % zOffsets.length];
    return team === "red" ? [-20.0, 2.0, z] : [20.0, 2.0, z];
  }

  public getGoalPosition(team: TeamId): THREE.Vector3 {
    return team === "red"
      ? new THREE.Vector3(-30.0, 0.5, 0)
      : new THREE.Vector3(30.0, 0.5, 0);
  }

  public dispose(scene: THREE.Scene, physicsWorld: RAPIER.World): void {
    scene.remove(this.worldGroup);
    for (const b of this.bodies) {
      try {
        physicsWorld.removeRigidBody(b);
      } catch {}
    }
    this.bodies = [];
    this.tractors = [];
    this.clouds = [];
  }
}
