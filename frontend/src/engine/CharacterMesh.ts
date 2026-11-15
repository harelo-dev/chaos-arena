import * as THREE from "three";
import { AnimState, CharacterId, InteractiveObject, TeamId } from "../types/game";

export class CharacterVisual {
  public group: THREE.Group;
  public characterId: CharacterId;
  private bodyGroup: THREE.Group;
  private headGroup: THREE.Group;
  private leftArm: THREE.Group;
  private rightArm: THREE.Group;
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;
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

    // Glossy Toy-Box PBR Armor Material with Clearcoat
    const armorMat = new THREE.MeshPhysicalMaterial({
      color: primaryHex,
      roughness: 0.24,
      metalness: 0.15,
      clearcoat: 0.65,
      clearcoatRoughness: 0.2,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: secondaryHex,
      roughness: 0.42,
      metalness: 0.25,
    });
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.4,
    });

    // Sculpted Organic Bean/Hero Torso (Smooth high-segment Capsule + Contoured Chest)
    const torsoGeo = new THREE.CapsuleGeometry(0.46, 0.52, 16, 24);
    const torso = new THREE.Mesh(torsoGeo, armorMat);
    torso.position.y = 0.96;
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.bodyGroup.add(torso);

    // Contoured Chest Armor Collar (Rounded Torus + Sculpted Breastplate)
    const collarGeo = new THREE.TorusGeometry(0.36, 0.08, 12, 24);
    collarGeo.rotateX(Math.PI / 2);
    const collar = new THREE.Mesh(collarGeo, darkMat);
    collar.position.set(0, 1.32, 0);
    this.bodyGroup.add(collar);

    // Belt with Metallic Buckle
    const beltGeo = new THREE.CylinderGeometry(0.48, 0.47, 0.15, 24);
    const belt = new THREE.Mesh(beltGeo, darkMat);
    belt.position.set(0, 0.72, 0);
    this.bodyGroup.add(belt);

    const buckleMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.85,
      roughness: 0.2,
    });
    const buckle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), buckleMat);
    buckle.scale.set(1.3, 0.9, 0.5);
    buckle.position.set(0, 0.72, 0.46);
    this.bodyGroup.add(buckle);

    // Head Group
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.72, 0);
    this.bodyGroup.add(this.headGroup);

    // Build Character-Specific Sculpted Head & Back Gear
    this.buildCharacterCustomization(character, armorMat, darkMat);

    // Articulated Rounded Arms with Shoulder Pauldrons & Mitten Hands
    this.leftArm = this.createArticulatedArm(armorMat, darkMat, jointMat);
    this.leftArm.position.set(-0.58, 1.18, 0);
    this.bodyGroup.add(this.leftArm);

    this.rightArm = this.createArticulatedArm(armorMat, darkMat, jointMat);
    this.rightArm.position.set(0.58, 1.18, 0);
    this.bodyGroup.add(this.rightArm);

    // Articulated Rounded Legs with Toy-Box Boots
    this.leftLeg = this.createArticulatedLeg(darkMat, jointMat);
    this.leftLeg.position.set(-0.23, 0.42, 0);
    this.bodyGroup.add(this.leftLeg);

    this.rightLeg = this.createArticulatedLeg(darkMat, jointMat);
    this.rightLeg.position.set(0.23, 0.42, 0);
    this.bodyGroup.add(this.rightLeg);

    // Stun Stars Halo (hidden unless stunned)
    this.stunRing = new THREE.Group();
    this.stunRing.position.set(0, 2.45, 0);
    this.stunRing.visible = false;
    const starGeo = new THREE.OctahedronGeometry(0.16, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (let i = 0; i < 5; i++) {
      const star = new THREE.Mesh(starGeo, starMat);
      const angle = (Math.PI * 2 * i) / 5;
      star.position.set(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55);
      this.stunRing.add(star);
    }
    this.group.add(this.stunRing);

    // Local Player Glowing Floor Halo
    if (isLocal) {
      const ringGeo = new THREE.RingGeometry(0.64, 0.82, 32);
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
    nameplate.position.set(0, 2.75, 0);
    this.group.add(nameplate);
  }

  private createArticulatedArm(
    armorMat: THREE.Material,
    darkMat: THREE.Material,
    jointMat: THREE.Material
  ): THREE.Group {
    const armGroup = new THREE.Group();

    // Rounded Shoulder Pauldron
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 14, 14),
      darkMat
    );
    shoulder.scale.set(1.1, 0.9, 1.1);
    shoulder.castShadow = true;
    armGroup.add(shoulder);

    // Forearm Capsule
    const upper = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 0.32, 10, 14),
      armorMat
    );
    upper.position.y = -0.22;
    upper.castShadow = true;
    armGroup.add(upper);

    // Rounded Glove Hand with Thumb
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 14), jointMat);
    glove.position.set(0, -0.45, 0.04);
    glove.castShadow = true;
    armGroup.add(glove);

    return armGroup;
  }

  private createArticulatedLeg(
    darkMat: THREE.Material,
    bootMat: THREE.Material
  ): THREE.Group {
    const legGroup = new THREE.Group();

    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.16, 0.22, 10, 14),
      darkMat
    );
    thigh.position.y = -0.12;
    thigh.castShadow = true;
    legGroup.add(thigh);

    // Rounded Chubby Boot
    const boot = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.17, 0.16, 10, 14),
      bootMat
    );
    boot.rotation.x = Math.PI / 2;
    boot.position.set(0, -0.32, 0.08);
    boot.castShadow = true;
    legGroup.add(boot);

    return legGroup;
  }

  private addExpressiveEyes(y: number, z: number, spacing: number = 0.16) {
    const scleraMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    [-1, 1].forEach((side) => {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * spacing, y, z);

      const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 12), scleraMat);
      eyeball.scale.set(1, 1.15, 0.65);
      eyeGroup.add(eyeball);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), pupilMat);
      pupil.position.set(0, 0, 0.045);
      pupil.scale.set(1, 1.1, 0.5);
      eyeGroup.add(pupil);

      const highlight = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), shineMat);
      highlight.position.set(0.022, 0.028, 0.068);
      eyeGroup.add(highlight);

      this.headGroup.add(eyeGroup);
    });
  }

  private buildCharacterCustomization(
    character: CharacterId,
    armorMat: THREE.Material,
    darkMat: THREE.Material
  ) {
    if (character === "spartan") {
      // Sculpted Curved Spartan Helmet + Wrap-around Gold Metallic Visor + Dual Thruster Pack
      const visorMat = new THREE.MeshPhysicalMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.35,
        roughness: 0.08,
        metalness: 0.92,
        clearcoat: 1.0,
      });

      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.44, 24, 24), armorMat);
      dome.scale.set(1.0, 0.96, 1.08);
      dome.castShadow = true;
      this.headGroup.add(dome);

      // Curved Sun-Visor Ridge
      const ridgeGeo = new THREE.CylinderGeometry(0.45, 0.46, 0.12, 24, 1, false, -1.1, 2.2);
      const ridge = new THREE.Mesh(ridgeGeo, darkMat);
      ridge.position.set(0, 0.14, 0.03);
      this.headGroup.add(ridge);

      // Curved Wrap-around Gold Visor
      const visorGeo = new THREE.CylinderGeometry(0.425, 0.425, 0.24, 24, 1, false, -0.95, 1.9);
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 0.02, 0.03);
      this.headGroup.add(visor);

      // Chin Guard
      const chin = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.22, 10, 14), darkMat);
      chin.rotation.z = Math.PI / 2;
      chin.position.set(0, -0.2, 0.28);
      this.headGroup.add(chin);

      // Dual Jetpack Thrusters on Back
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      [-0.18, 0.18].forEach((ox) => {
        const thruster = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.15, 0.48, 14),
          darkMat
        );
        thruster.position.set(ox, 1.05, -0.44);
        thruster.rotation.x = 0.15;
        const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 12), glowMat);
        nozzle.position.set(ox, 0.78, -0.48);
        nozzle.rotation.x = Math.PI;
        this.bodyGroup.add(thruster, nozzle);
      });
    } else if (character === "rooster") {
      // Sculpted Gallo Mecha: Rounded feathered head, multi-lobe neon crest, curved beak, fan tail
      const featherMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.32,
        clearcoat: 0.3,
      });
      const crestMat = new THREE.MeshStandardMaterial({
        color: 0xff1144,
        emissive: 0xe11d48,
        emissiveIntensity: 0.45,
        roughness: 0.25,
      });
      const beakMat = new THREE.MeshStandardMaterial({
        color: 0xf97316,
        roughness: 0.25,
        metalness: 0.2,
      });

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), featherMat);
      head.scale.set(0.95, 1.05, 1.02);
      head.castShadow = true;
      this.headGroup.add(head);

      // 3 Sculpted Rounded Comb Lobes on top of head
      [
        [0, 0.44, 0.12, 0.15],
        [0, 0.48, -0.04, 0.17],
        [0, 0.4, -0.22, 0.14],
      ].forEach(([cx, cy, cz, r]) => {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), crestMat);
        lobe.scale.set(0.55, 1.3, 1.0);
        lobe.position.set(cx, cy, cz);
        this.headGroup.add(lobe);
      });

      // Sculpted Curved Beak
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.38, 16), beakMat);
      beak.rotation.x = Math.PI / 2 + 0.15;
      beak.position.set(0, -0.02, 0.48);
      this.headGroup.add(beak);

      // Red Wattle Droplets
      [-0.06, 0.06].forEach((wx) => {
        const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), crestMat);
        wattle.scale.set(0.8, 1.4, 0.8);
        wattle.position.set(wx, -0.22, 0.38);
        this.headGroup.add(wattle);
      });

      this.addExpressiveEyes(0.08, 0.36, 0.17);

      // Lush Fan Tail of Feathers
      const tailGroup = new THREE.Group();
      tailGroup.position.set(0, 0.68, -0.42);
      [-0.35, 0, 0.35].forEach((ang, i) => {
        const plume = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.09, 0.36, 8, 12),
          i === 1 ? crestMat : featherMat
        );
        plume.rotation.x = -0.65;
        plume.rotation.z = ang;
        plume.position.set(Math.sin(ang) * 0.15, 0.12, -0.1);
        tailGroup.add(plume);
      });
      this.bodyGroup.add(tailGroup);
      this.tailMesh = tailGroup;
    } else if (character === "ninja") {
      // Sculpted Ninja Sombra: Smooth cowl, glowing cyan eyes, flowing headband + detailed Katanas
      const hoodMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35 });
      const bandMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0x991b1b,
        emissiveIntensity: 0.25,
      });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        metalness: 0.9,
        roughness: 0.15,
      });
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.92,
        roughness: 0.1,
      });

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), hoodMat);
      head.castShadow = true;
      this.headGroup.add(head);

      // Headband Torus
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.055, 12, 24), bandMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 0.14, 0);
      this.headGroup.add(band);

      // Flowing Scarf Tails
      [-0.14, 0.14].forEach((rx, idx) => {
        const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.34, 8, 12), bandMat);
        tail.position.set(rx, 0.05, -0.45);
        tail.rotation.z = idx === 0 ? -0.4 : 0.4;
        tail.rotation.x = 0.3;
        this.headGroup.add(tail);
      });

      // Glowing Cyber-Ninja Eyes
      [-0.14, 0.14].forEach((ex) => {
        const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.1, 8, 8), eyeMat);
        eye.rotation.z = Math.PI / 2 + (ex < 0 ? -0.22 : 0.22);
        eye.position.set(ex, 0.03, 0.39);
        this.headGroup.add(eye);
      });

      // Dual Crossed Katanas with Hilt & Gold Tsuba Guard
      [-0.52, 0.52].forEach((rotZ, idx) => {
        const katana = new THREE.Group();
        katana.position.set(0, 1.08, -0.46 - idx * 0.04);
        katana.rotation.z = rotZ;

        const scabbard = new THREE.Mesh(
          new THREE.CylinderGeometry(0.038, 0.03, 1.1, 12),
          hoodMat
        );
        const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12), goldMat);
        guard.position.y = 0.38;
        const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 12), bandMat);
        hilt.position.y = 0.54;
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12), bladeMat);
        tip.position.y = -0.58;

        katana.add(scabbard, guard, hilt, tip);
        this.bodyGroup.add(katana);
      });
    } else if (character === "viking") {
      // Sculpted Vikingo Bárbaro: Rounded iron helmet with curved Torus horns, plush braided beard, bossed round shield
      const ironMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.78,
        roughness: 0.25,
      });
      const hornMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.3 });
      const beardMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.65 });
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 });

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), ironMat);
      head.castShadow = true;
      this.headGroup.add(head);

      this.addExpressiveEyes(0.04, 0.38, 0.15);

      // Curved Bull Horns (Torus Arcs)
      [-1, 1].forEach((side) => {
        const horn = new THREE.Mesh(
          new THREE.TorusGeometry(0.28, 0.075, 12, 20, Math.PI * 0.75),
          hornMat
        );
        horn.position.set(side * 0.34, 0.18, 0);
        if (side < 0) {
          horn.rotation.z = Math.PI * 0.65;
        } else {
          horn.rotation.y = Math.PI;
          horn.rotation.z = Math.PI * 0.65;
        }
        this.headGroup.add(horn);
      });

      // Lush Rounded Beard & Mustache
      const beard = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), beardMat);
      beard.scale.set(1.05, 1.25, 0.75);
      beard.position.set(0, -0.22, 0.24);
      this.headGroup.add(beard);

      // Round Viking Shield with Iron Boss on Back
      const shieldGroup = new THREE.Group();
      shieldGroup.position.set(0, 1.05, -0.46);
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 24), woodMat);
      disk.rotation.x = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 10, 24), ironMat);
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), ironMat);
      boss.position.z = -0.04;
      shieldGroup.add(disk, rim, boss);
      this.bodyGroup.add(shieldGroup);
    } else if (character === "dino") {
      // Sculpted Organic Dino Rex: Rounded snout, 3D teeth, brow ridges, dorsal spines & segmented wagging tail
      const bellyMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.5 });
      const spikeMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xca8a04,
        emissiveIntensity: 0.2,
        roughness: 0.3,
      });
      const toothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });

      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), armorMat);
      skull.scale.set(0.95, 0.95, 1.1);
      skull.castShadow = true;
      this.headGroup.add(skull);

      // Rounded Upper Snout
      const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.28, 14, 18), armorMat);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, -0.04, 0.36);
      this.headGroup.add(snout);

      // Cute 3D Fangs
      [-0.14, -0.05, 0.05, 0.14].forEach((tx) => {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 8), toothMat);
        tooth.rotation.x = Math.PI;
        tooth.position.set(tx, -0.22, 0.48);
        this.headGroup.add(tooth);
      });

      this.addExpressiveEyes(0.15, 0.32, 0.22);

      // Rounded Dorsal Spines down Head & Back
      for (let i = 0; i < 4; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 12), spikeMat);
        spike.position.set(0, 0.42 - i * 0.1, -0.05 - i * 0.14);
        spike.rotation.x = -0.45;
        this.headGroup.add(spike);
      }

      // Dino Belly Patch
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), bellyMat);
      belly.scale.set(0.85, 1.1, 0.4);
      belly.position.set(0, 0.98, 0.36);
      this.bodyGroup.add(belly);

      // Plump Curved Dino Tail
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.65, 12, 16), armorMat);
      tail.rotation.x = -Math.PI / 2.4;
      tail.position.set(0, 0.62, -0.58);
      this.bodyGroup.add(tail);
      this.tailMesh = tail;
    } else {
      // Sculpted Astro-Bot: Crystal Glass Space Dome, LED cyber face, glowing antenna & thruster pack
      const screenMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.15 });
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.42,
        roughness: 0.05,
        metalness: 0.1,
        clearcoat: 1.0,
      });
      const neonMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });

      const innerHead = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 20), screenMat);
      this.headGroup.add(innerHead);

      // Expressive Glowing LED Eyes + Smile
      [-0.12, 0.12].forEach((ex) => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), neonMat);
        eye.scale.set(1, 1.3, 0.5);
        eye.position.set(ex, 0.05, 0.31);
        this.headGroup.add(eye);
      });

      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.47, 24, 24), glassMat);
      this.headGroup.add(dome);

      // Antenna with Glowing Orb
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.28, 10), darkMat);
      ant.position.set(0, 0.56, 0);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), neonMat);
      bulb.position.set(0, 0.72, 0);
      this.headGroup.add(ant, bulb);

      // Dual Rounded Oxygen Capsules on Back
      [-0.18, 0.18].forEach((tx) => {
        const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.36, 12, 16), darkMat);
        tank.position.set(tx, 1.05, -0.44);
        this.bodyGroup.add(tank);
      });
    }
  }

  private createNameplate(name: string, team: TeamId, isLocal: boolean): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = team === "red" ? "rgba(185, 28, 28, 0.9)" : "rgba(29, 78, 216, 0.9)";
    ctx.beginPath();
    ctx.roundRect(12, 10, 232, 44, 16);
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
      this.tailMesh.rotation.y = Math.sin(this.animTime * 1.4) * 0.38;
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
      this.bodyGroup.rotation.x = 0.38 * pushProgress;
      this.leftArm.rotation.x = -1.65 * pushProgress;
      this.rightArm.rotation.x = -1.65 * pushProgress;
      return;
    }

    this.bodyGroup.rotation.x = THREE.MathUtils.lerp(this.bodyGroup.rotation.x, 0, dt * 10);

    if (state === "run") {
      const swing = Math.sin(this.animTime * 1.35) * 0.8;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.85;
      this.rightArm.rotation.x = swing * 0.85;
      const bounce = Math.abs(Math.sin(this.animTime * 1.35));
      this.bodyGroup.position.y = bounce * 0.14;
      // Subtle squash and stretch
      this.bodyGroup.scale.set(1 - bounce * 0.04, 1 + bounce * 0.05, 1 - bounce * 0.04);
      this.headGroup.rotation.z = Math.sin(this.animTime * 0.68) * 0.07;
    } else if (state === "carrying") {
      const swing = Math.sin(this.animTime * 1.1) * 0.58;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -1.4;
      this.rightArm.rotation.x = -1.4;
      this.bodyGroup.position.y = Math.abs(Math.sin(this.animTime * 1.1)) * 0.09;
      this.bodyGroup.scale.set(1, 1, 1);
    } else {
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, dt * 8);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, dt * 8);
      this.leftArm.rotation.x = Math.sin(this.animTime * 0.3) * 0.08;
      this.rightArm.rotation.x = -Math.sin(this.animTime * 0.3) * 0.08;
      const breath = Math.sin(this.animTime * 0.4);
      this.bodyGroup.position.y = breath * 0.04;
      this.bodyGroup.scale.set(1 + breath * 0.015, 1 - breath * 0.015, 1 + breath * 0.015);
      this.headGroup.rotation.z = 0;
    }
  }
}

export function createInteractiveObjectMesh(obj: InteractiveObject): THREE.Group {
  const group = new THREE.Group();

  if (obj.kind === "chicken" || obj.kind === "golden_chicken") {
    const isGold = obj.kind === "golden_chicken";
    const scale = isGold ? 1.38 : 1.0;

    // Sculpted Plump Organic Chicken (Spheres & Capsules instead of cubes!)
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: isGold ? 0xfbbf24 : 0xffffff,
      emissive: isGold ? 0xd97706 : 0x000000,
      emissiveIntensity: isGold ? 0.4 : 0,
      roughness: isGold ? 0.12 : 0.45,
      metalness: isGold ? 0.88 : 0.05,
      clearcoat: isGold ? 1.0 : 0.25,
    });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35 });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 18), bodyMat);
    body.scale.set(0.95, 0.9, 1.18);
    body.position.y = 0.32;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), bodyMat);
    head.position.set(0, 0.56, 0.22);
    head.castShadow = true;
    group.add(head);

    // Rounded Comb
    const comb = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.14, 8, 10), redMat);
    comb.rotation.x = Math.PI / 2;
    comb.position.set(0, 0.78, 0.22);
    group.add(comb);

    // Cone Beak
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 12), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.54, 0.46);
    group.add(beak);

    // Eyes
    [-0.12, 0.12].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), eyeMat);
      eye.position.set(ex, 0.6, 0.38);
      group.add(eye);
    });

    // Plump Rounded Wings
    const wingGeo = new THREE.SphereGeometry(0.18, 12, 12);
    [-0.32, 0.32].forEach((wx) => {
      const wing = new THREE.Mesh(wingGeo, bodyMat);
      wing.scale.set(0.4, 0.75, 1.2);
      wing.position.set(wx, 0.34, 0);
      group.add(wing);
    });

    group.scale.setScalar(scale);
  } else if (obj.kind === "relic_heavy") {
    const goldMat = new THREE.MeshPhysicalMaterial({
      color: 0xfacc15,
      emissive: 0xb45309,
      emissiveIntensity: 0.38,
      roughness: 0.1,
      metalness: 0.92,
      clearcoat: 1.0,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.72, 0.35, 24), goldMat);
    base.position.y = 0.18;
    base.castShadow = true;
    group.add(base);

    const totem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), goldMat);
    totem.position.y = 0.88;
    totem.castShadow = true;
    group.add(totem);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.06, 12, 32), goldMat);
    halo.position.y = 0.88;
    group.add(halo);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    [-0.2, 0.2].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), eyeMat);
      eye.position.set(ex, 0.95, 0.54);
      group.add(eye);
    });
  } else if (obj.kind === "gem") {
    const gemMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      roughness: 0.05,
      metalness: 0.2,
      clearcoat: 1.0,
    });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), gemMat);
    gem.position.y = 0.55;
    gem.castShadow = true;
    group.add(gem);
  } else if (obj.kind === "power_core" || obj.kind === "flag_red" || obj.kind === "flag_blue") {
    const color =
      obj.kind === "flag_red" ? 0xef4444 : obj.kind === "flag_blue" ? 0x3b82f6 : 0xa855f7;
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.85,
      roughness: 0.15,
    });
    const flagMat = new THREE.MeshPhysicalMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4,
      clearcoat: 0.8,
      side: THREE.DoubleSide,
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 12), poleMat);
    pole.position.y = 1.15;
    pole.castShadow = true;
    group.add(pole);

    const banner = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.65, 8, 12), flagMat);
    banner.rotation.z = Math.PI / 2;
    banner.position.set(0.48, 1.9, 0);
    banner.castShadow = true;
    group.add(banner);
  }

  return group;
}
