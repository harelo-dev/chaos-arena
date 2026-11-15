import * as THREE from "three";

export class TextureGenerator {
  private static cache: Map<string, THREE.CanvasTexture> = new Map();

  public static createGrassTexture(): THREE.CanvasTexture {
    if (this.cache.has("grass")) return this.cache.get("grass")!;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;

    // Rich meadow base gradient
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, "#38a169");
    grad.addColorStop(0.5, "#48bb78");
    grad.addColorStop(1, "#2f855a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Organic grass blades & clover patches
    for (let i = 0; i < 4500; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const h = 4 + Math.random() * 8;
      ctx.strokeStyle =
        i % 3 === 0 ? "rgba(104, 211, 145, 0.45)" : "rgba(34, 84, 61, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 4, y - h);
      ctx.stroke();
    }

    // Subtle wildflowers
    const flowerColors = ["#fef08a", "#ffffff", "#fbcfe8"];
    for (let i = 0; i < 75; i++) {
      ctx.fillStyle = flowerColors[i % flowerColors.length];
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 10);
    this.cache.set("grass", tex);
    return tex;
  }

  public static createMarbleTexture(): THREE.CanvasTexture {
    if (this.cache.has("marble")) return this.cache.get("marble")!;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, 512, 512);

    // Luxury tile grid with gold/slate inlay
    const tileSize = 128;
    for (let gx = 0; gx < 4; gx++) {
      for (let gy = 0; gy < 4; gy++) {
        const isAlt = (gx + gy) % 2 === 0;
        ctx.fillStyle = isAlt ? "#1e293b" : "#0f172a";
        ctx.fillRect(gx * tileSize, gy * tileSize, tileSize, tileSize);

        ctx.strokeStyle = "rgba(250, 204, 21, 0.18)";
        ctx.lineWidth = 2;
        ctx.strokeRect(gx * tileSize + 2, gy * tileSize + 2, tileSize - 4, tileSize - 4);
      }
    }

    // Subtle marble veins
    ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 35; i++) {
      ctx.beginPath();
      let x = Math.random() * 512;
      let y = Math.random() * 512;
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (Math.random() - 0.3) * 45;
        y += (Math.random() - 0.3) * 45;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 8);
    this.cache.set("marble", tex);
    return tex;
  }

  public static createCanyonTexture(): THREE.CanvasTexture {
    if (this.cache.has("canyon")) return this.cache.get("canyon")!;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;

    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, "#b45309");
    grad.addColorStop(0.5, "#c2410c");
    grad.addColorStop(1, "#9a3412");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Desert pebbles & strata lines
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle =
        i % 2 === 0 ? "rgba(251, 146, 60, 0.22)" : "rgba(67, 20, 7, 0.22)";
      ctx.beginPath();
      ctx.arc(
        Math.random() * 512,
        Math.random() * 512,
        1 + Math.random() * 3.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 10);
    this.cache.set("canyon", tex);
    return tex;
  }

  public static createWoodTexture(): THREE.CanvasTexture {
    if (this.cache.has("wood")) return this.cache.get("wood")!;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#92400e";
    ctx.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 32) {
      ctx.strokeStyle = "rgba(69, 26, 3, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    this.cache.set("wood", tex);
    return tex;
  }
}

/**
 * Helper to create organic, non-boxy 3D props (fluffy clouds, sculpted boulders, organic trees)
 */
export class OrganicPropBuilder {
  public static createCloudCluster(scale: number = 1.0): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.0,
    });
    const puffs: [number, number, number, number][] = [
      [0, 0, 0, 2.2],
      [-1.8, -0.2, 0.4, 1.6],
      [1.8, -0.1, -0.3, 1.7],
      [0.6, 0.8, 0.5, 1.5],
      [-0.8, 0.6, -0.4, 1.4],
    ];
    const sphereGeo = new THREE.IcosahedronGeometry(1, 2);
    for (const [x, y, z, r] of puffs) {
      const m = new THREE.Mesh(sphereGeo, mat);
      m.position.set(x, y, z);
      m.scale.set(r, r * 0.72, r);
      group.add(m);
    }
    group.scale.setScalar(scale);
    return group;
  }

  public static createSculptedBoulder(
    radius: number,
    colorHex: number,
    heightScale: number = 0.75
  ): THREE.Mesh {
    const geo = new THREE.DodecahedronGeometry(radius, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const noise = 0.88 + 0.24 * Math.sin(vx * 2.1 + vz * 1.7) * Math.cos(vy * 1.9);
      pos.setXYZ(i, vx * noise, vy * noise * heightScale, vz * noise);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.78,
      metalness: 0.08,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  public static createOrganicTree(scale: number = 1.0, leafColor: number = 0x16a34a): THREE.Group {
    const group = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: leafColor,
      roughness: 0.55,
      flatShading: true,
    });

    // Curved tapered trunk
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.52, 2.6, 10), trunkMat);
    trunk.position.y = 1.3;
    trunk.castShadow = true;
    group.add(trunk);

    // Multi-sphere organic canopy
    const canopyGeo = new THREE.IcosahedronGeometry(1.5, 1);
    const crownPositions: [number, number, number, number][] = [
      [0, 3.3, 0, 1.25],
      [-0.95, 2.7, 0.5, 0.9],
      [0.95, 2.8, -0.4, 0.95],
      [0.2, 2.6, 0.95, 0.85],
      [-0.3, 3.9, -0.3, 0.9],
    ];
    for (const [cx, cy, cz, s] of crownPositions) {
      const c = new THREE.Mesh(canopyGeo, leafMat);
      c.position.set(cx, cy, cz);
      c.scale.setScalar(s);
      c.castShadow = true;
      c.receiveShadow = true;
      group.add(c);
    }

    group.scale.setScalar(scale);
    return group;
  }
}
