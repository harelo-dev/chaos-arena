import * as THREE from "three";
import { AnimState, CharacterId, InteractiveObject, TeamId } from "../types/game";

export class CharacterVisual {
  public group: THREE.Group;
  public characterId: CharacterId;
  private bodyGroup: THREE.Group;
  private headGroup: THREE.Group;
  private leftArm: THREE.Mesh;
  private rightArm: THREE.Mesh;
  private leftLeg: THREE.Mesh;
  private rightLeg: THREE.Mesh;
  private tailMesh: THREE.Object3D | null = null;
  private stunRing: THREE.Group;
  private animTime: number = Math.random() * 10;

  constructor(
    name: string,
    team: TeamId,
    character: CharacterId = "spartan",
    isLocal: boolean = false
  ) {
    this.characterId = character;
    this.group = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.group.add(this.bodyGroup);

    const primaryHex = team === "red" ? 0xef4444 : 0x3b82f6;
    const secondaryHex = team === "red" ? 0x991b1b : 0x1e40af;

    const armorMat = new THREE.MeshStandardMaterial({
      color: primaryHex,
      roughness: 0.32,
      metalness: 0.18,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: secondaryHex,
      roughness: 0.5,
    });

    // Chubby Toy-Box Torso
    const torsoGeo = new THREE.CapsuleGeometry(0.45, 0.55, 8, 14);
    const torso = new THREE.Mesh(torsoGeo, armorMat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.bodyGroup.add(torso);

    // Team Belt / Chest Accent
    const beltGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.16, 14);
    const belt = new THREE.Mesh(beltGeo, darkMat);
    belt.position.set(0, 0.72, 0);
    this.bodyGroup.add(belt);

    // Head Group
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.68, 0);
    this.bodyGroup.add(this.headGroup);

    // Build Character-Specific Head & Back Accessories
    this.buildCharacterCustomization(character, armorMat, darkMat);

    // Bouncy Arms with Hands
    const armGeo = new THREE.CapsuleGeometry(0.15, 0.36, 4, 8);
    this.leftArm = new THREE.Mesh(armGeo, armorMat);
    this.leftArm.position.set(-0.58, 1.02, 0);
    this.leftArm.castShadow = true;
    this.bodyGroup.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, armorMat);
    this.rightArm.position.set(0.58, 1.02, 0);
    this.rightArm.castShadow = true;
    this.bodyGroup.add(this.rightArm);

    // Bouncy Legs
    const legGeo = new THREE.CapsuleGeometry(0.16, 0.28, 4, 8);
    this.leftLeg = new THREE.Mesh(legGeo, darkMat);
    this.leftLeg.position.set(-0.22, 0.32, 0);
    this.leftLeg.castShadow = true;
    this.bodyGroup.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, darkMat);
    this.rightLeg.position.set(0.22, 0.32, 0);
    this.rightLeg.castShadow = true;
    this.bodyGroup.add(this.rightLeg);

    // Stun Stars Halo (hidden unless stunned)
    this.stunRing = new THREE.Group();
    this.stunRing.position.set(0, 2.38, 0);
    this.stunRing.visible = false;
    const starGeo = new THREE.OctahedronGeometry(0.15, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (let i = 0; i < 4; i++) {
      const star = new THREE.Mesh(starGeo, starMat);
      const angle = (Math.PI * 2 * i) / 4;
      star.position.set(Math.cos(angle) * 0.52, 0, Math.sin(angle) * 0.52);
      this.stunRing.add(star);
    }
    this.group.add(this.stunRing);

    // Local Player Indicator Ring on floor
    if (isLocal) {
      const ringGeo = new THREE.RingGeometry(0.62, 0.78, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      this.group.add(ring);
    }

    // Floating Nameplate Sprite
    const nameplate = this.createNameplate(name, team, isLocal);
    nameplate.position.set(0, 2.68, 0);
    this.group.add(nameplate);
  }

  private buildCharacterCustomization(
    character: CharacterId,
    armorMat: THREE.Material,
    darkMat: THREE.Material
  ) {
    if (character === "spartan") {
      // Halo Spartan Helmet + Gold Visor + Shoulder Pauldrons + Jetpack
      const visorMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.4,
        roughness: 0.1,
        metalness: 0.85,
      });
      const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.72), armorMat);
      helmet.castShadow = true;
      this.headGroup.add(helmet);

      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.12, 0.78), darkMat);
      brim.position.set(0, 0.22, 0.04);
      this.headGroup.add(brim);

      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.26, 0.15), visorMat);
      visor.position.set(0, 0.03, 0.33);
      this.headGroup.add(visor);

      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.28), darkMat);
      pack.position.set(0, 1.05, -0.4);
      this.bodyGroup.add(pack);
    } else if (character === "rooster") {
      // Gallo Mecha: White feather head, big red neon crest, orange beak, tail feathers
      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
      const crestMat = new THREE.MeshStandardMaterial({
        color: 0xff1144,
        emissive: 0xdc2626,
        emissiveIntensity: 0.4,
      });
      const beakMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3 });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.58, 0.64), whiteMat);
      head.castShadow = true;
      this.headGroup.add(head);

      // Mohawk Crest
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.52), crestMat);
      crest.position.set(0, 0.4, 0.05);
      this.headGroup.add(crest);

      // Sharp Beak
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.38, 4), beakMat);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.0, 0.46);
      this.headGroup.add(beak);

      // Wattle under beak
      const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), crestMat);
      wattle.position.set(0, -0.16, 0.36);
      this.headGroup.add(wattle);

      // Eyes
      const lEye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat);
      lEye.position.set(-0.2, 0.1, 0.32);
      const rEye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat);
      rEye.position.set(0.2, 0.1, 0.32);
      this.headGroup.add(lEye, rEye);

      // Tail feathers
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.45, 0.38), whiteMat);
      tail.position.set(0, 0.72, -0.45);
      tail.rotation.x = 0.45;
      this.bodyGroup.add(tail);
      this.tailMesh = tail;
    } else if (character === "ninja") {
      // Ninja Sombra: Dark shinobi mask, glowing cyan eyes, red headband + dual crossed katanas
      const hoodMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
      const bandMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.85,
        roughness: 0.15,
      });

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 14), hoodMat);
      head.castShadow = true;
      this.headGroup.add(head);

      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.12, 16), bandMat);
      band.position.set(0, 0.12, 0);
      this.headGroup.add(band);

      // Headband tails
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.06), bandMat);
      ribbon.position.set(0.15, 0.02, -0.42);
      ribbon.rotation.z = 0.35;
      this.headGroup.add(ribbon);

      // Glowing Ninja Eyes
      const lEye = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.08), eyeMat);
      lEye.position.set(-0.14, 0.02, 0.34);
      const rEye = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.08), eyeMat);
      rEye.position.set(0.14, 0.02, 0.34);
      this.headGroup.add(lEye, rEye);

      // Dual Crossed Katanas on Back
      const k1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.25, 8), bladeMat);
      k1.position.set(0, 1.15, -0.44);
      k1.rotation.z = 0.55;
      const k2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.25, 8), bladeMat);
      k2.position.set(0, 1.15, -0.48);
      k2.rotation.z = -0.55;
      this.bodyGroup.add(k1, k2);
    } else if (character === "viking") {
      // Vikingo Bárbaro: Horned iron helmet, orange braided beard, wooden shield on back
      const ironMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.7,
        roughness: 0.3,
      });
      const hornMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.3 });
      const beardMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 });
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 12), ironMat);
      head.castShadow = true;
      this.headGroup.add(head);

      // Big Curved Horns
      const hornGeo = new THREE.ConeGeometry(0.12, 0.52, 8);
      const lHorn = new THREE.Mesh(hornGeo, hornMat);
      lHorn.position.set(-0.46, 0.22, 0);
      lHorn.rotation.z = 0.85;
      const rHorn = new THREE.Mesh(hornGeo, hornMat);
      rHorn.position.set(0.46, 0.22, 0);
      rHorn.rotation.z = -0.85;
      this.headGroup.add(lHorn, rHorn);

      // Viking Beard
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 6), beardMat);
      beard.rotation.x = Math.PI;
      beard.position.set(0, -0.25, 0.22);
      this.headGroup.add(beard);

      // Round Shield on Back
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.1, 16), woodMat);
      shield.rotation.x = Math.PI / 2;
      shield.position.set(0, 1.05, -0.45);
      this.bodyGroup.add(shield);
    } else if (character === "dino") {
      // Dino Rex: Big snout, dorsal spikes, wagging tail
      const scaleMat = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.4 });
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.65), armorMat);
      head.castShadow = true;
      this.headGroup.add(head);

      // Dino Snout
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.32, 0.48), armorMat);
      snout.position.set(0, -0.04, 0.42);
      this.headGroup.add(snout);

      // Eyes
      const lEye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeMat);
      lEye.position.set(-0.26, 0.12, 0.24);
      const rEye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeMat);
      rEye.position.set(0.26, 0.12, 0.24);
      this.headGroup.add(lEye, rEye);

      // Dorsal Spikes
      for (let i = 0; i < 3; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 4), spikeMat);
        spike.position.set(0, 0.36 - i * 0.08, -0.05 - i * 0.18);
        spike.rotation.x = -0.35;
        this.headGroup.add(spike);
      }

      // Wagging Dino Tail
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.85, 8), scaleMat);
      tail.rotation.x = -Math.PI / 2.3;
      tail.position.set(0, 0.62, -0.58);
      this.bodyGroup.add(tail);
      this.tailMesh = tail;
    } else {
      // Astro-Bot: Space glass bubble helmet, blinking antenna, dual oxygen tanks
      const innerMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.48,
        roughness: 0.05,
        metalness: 0.2,
      });
      const neonMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });

      const innerHead = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 12), innerMat);
      this.headGroup.add(innerHead);

      const lEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), neonMat);
      lEye.position.set(-0.12, 0.04, 0.27);
      const rEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), neonMat);
      rEye.position.set(0.12, 0.04, 0.27);
      this.headGroup.add(lEye, rEye);

      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 16), glassMat);
      this.headGroup.add(dome);

      // Antenna
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), darkMat);
      ant.position.set(0, 0.55, 0);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), neonMat);
      bulb.position.set(0, 0.72, 0);
      this.headGroup.add(ant, bulb);

      // Oxygen Tanks
      const tankGeo = new THREE.CapsuleGeometry(0.14, 0.35, 6, 8);
      const t1 = new THREE.Mesh(tankGeo, darkMat);
      t1.position.set(-0.18, 1.05, -0.42);
      const t2 = new THREE.Mesh(tankGeo, darkMat);
      t2.position.set(0.18, 1.05, -0.42);
      this.bodyGroup.add(t1, t2);
    }
  }

  private createNameplate(name: string, team: TeamId, isLocal: boolean): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = team === "red" ? "rgba(185, 28, 28, 0.88)" : "rgba(29, 78, 216, 0.88)";
    ctx.beginPath();
    ctx.roundRect(12, 10, 232, 44, 12);
    ctx.fill();

    if (isLocal) {
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    ctx.font = "bold 24px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.slice(0, 14), 128, 33);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.1, 0.52, 1);
    return sprite;
  }

  public updateAnimation(dt: number, state: AnimState, pushProgress: number = 0) {
    this.animTime += dt * 10;

    if (this.tailMesh) {
      this.tailMesh.rotation.y = Math.sin(this.animTime * 1.4) * 0.35;
    }

    if (state === "stunned") {
      this.stunRing.visible = true;
      this.stunRing.rotation.y += dt * 6;
      this.bodyGroup.rotation.z = Math.sin(this.animTime * 1.5) * 0.32;
      this.bodyGroup.rotation.x = Math.cos(this.animTime * 1.5) * 0.25;
      this.leftArm.rotation.x = Math.sin(this.animTime * 2) * 0.8;
      this.rightArm.rotation.x = -Math.sin(this.animTime * 2) * 0.8;
      return;
    }

    this.stunRing.visible = false;
    this.bodyGroup.rotation.z = THREE.MathUtils.lerp(this.bodyGroup.rotation.z, 0, dt * 10);

    if (pushProgress > 0) {
      this.bodyGroup.rotation.x = 0.35 * pushProgress;
      this.leftArm.rotation.x = -1.6 * pushProgress;
      this.rightArm.rotation.x = -1.6 * pushProgress;
      return;
    }

    this.bodyGroup.rotation.x = THREE.MathUtils.lerp(this.bodyGroup.rotation.x, 0, dt * 10);

    if (state === "run") {
      const swing = Math.sin(this.animTime * 1.3) * 0.75;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.8;
      this.rightArm.rotation.x = swing * 0.8;
      this.bodyGroup.position.y = Math.abs(Math.sin(this.animTime * 1.3)) * 0.12;
      this.headGroup.rotation.z = Math.sin(this.animTime * 0.65) * 0.06;
    } else if (state === "carrying") {
      const swing = Math.sin(this.animTime * 1.1) * 0.55;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -1.35;
      this.rightArm.rotation.x = -1.35;
      this.bodyGroup.position.y = Math.abs(Math.sin(this.animTime * 1.1)) * 0.08;
    } else {
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, dt * 8);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, dt * 8);
      this.leftArm.rotation.x = Math.sin(this.animTime * 0.3) * 0.08;
      this.rightArm.rotation.x = -Math.sin(this.animTime * 0.3) * 0.08;
      this.bodyGroup.position.y = Math.sin(this.animTime * 0.4) * 0.04;
      this.headGroup.rotation.z = 0;
    }
  }
}

export function createInteractiveObjectMesh(obj: InteractiveObject): THREE.Group {
  const group = new THREE.Group();

  if (obj.kind === "chicken" || obj.kind === "golden_chicken") {
    const isGold = obj.kind === "golden_chicken";
    const scale = isGold ? 1.35 : 1.0;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: isGold ? 0xfbbf24 : 0xffffff,
      emissive: isGold ? 0xd97706 : 0x000000,
      emissiveIntensity: isGold ? 0.35 : 0,
      roughness: isGold ? 0.2 : 0.6,
      metalness: isGold ? 0.8 : 0.05,
    });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.52, 0.65), bodyMat);
    body.position.y = 0.32;
    body.castShadow = true;
    group.add(body);

    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.32), redMat);
    comb.position.set(0, 0.64, 0.12);
    group.add(comb);

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 4), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.42, 0.42);
    group.add(beak);

    const wingGeo = new THREE.BoxGeometry(0.12, 0.28, 0.38);
    const leftWing = new THREE.Mesh(wingGeo, bodyMat);
    leftWing.position.set(-0.32, 0.35, 0);
    group.add(leftWing);
    const rightWing = new THREE.Mesh(wingGeo, bodyMat);
    rightWing.position.set(0.32, 0.35, 0);
    group.add(rightWing);

    group.scale.setScalar(scale);
  } else if (obj.kind === "relic_heavy") {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xb45309,
      emissiveIntensity: 0.35,
      roughness: 0.15,
      metalness: 0.85,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.35, 8), goldMat);
    base.position.y = 0.18;
    base.castShadow = true;
    group.add(base);

    const totem = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), goldMat);
    totem.position.y = 0.85;
    totem.castShadow = true;
    group.add(totem);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), eyeMat);
    leftEye.position.set(-0.2, 0.95, 0.52);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), eyeMat);
    rightEye.position.set(0.2, 0.95, 0.52);
    group.add(rightEye);
  } else if (obj.kind === "gem") {
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
      roughness: 0.1,
      metalness: 0.5,
    });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), gemMat);
    gem.position.y = 0.5;
    gem.castShadow = true;
    group.add(gem);
  } else if (obj.kind === "power_core" || obj.kind === "flag_red" || obj.kind === "flag_blue") {
    const color =
      obj.kind === "flag_red" ? 0xef4444 : obj.kind === "flag_blue" ? 0x3b82f6 : 0xa855f7;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7, roughness: 0.2 });
    const flagMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), poleMat);
    pole.position.y = 1.1;
    pole.castShadow = true;
    group.add(pole);

    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.08), flagMat);
    banner.position.set(0.42, 1.85, 0);
    banner.castShadow = true;
    group.add(banner);
  }

  return group;
}
