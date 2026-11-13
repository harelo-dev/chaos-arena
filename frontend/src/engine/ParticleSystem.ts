import * as THREE from "three";

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
  maxLife: number;
  initialScale: number;
  gravity: number;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private particles: Particle[] = [];
  private boxGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  private octaGeo = new THREE.OctahedronGeometry(0.22, 0);
  private ringGeo = new THREE.RingGeometry(0.3, 0.65, 16);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawnImpactBurst(pos: THREE.Vector3, colorHex: number = 0xffdd33, count: number = 14) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? colorHex : 0xffffff });
      const mesh = new THREE.Mesh(i % 2 === 0 ? this.octaGeo : this.boxGeo, mat);
      mesh.position.copy(pos);
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 3.5 + Math.random() * 5.5;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        2.5 + Math.random() * 4.5,
        Math.sin(angle) * speed
      );
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel,
        rotVel: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        life: 0.55 + Math.random() * 0.25,
        maxLife: 0.7,
        initialScale: 0.9 + Math.random() * 0.7,
        gravity: -14,
      });
    }

    // Add a shockwave ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.particles.push({
      mesh: ring,
      vel: new THREE.Vector3(0, 0.4, 0),
      rotVel: new THREE.Vector3(0, 0, 4),
      life: 0.35,
      maxLife: 0.35,
      initialScale: 3.5,
      gravity: 0,
    });
  }

  public spawnDustPuff(pos: THREE.Vector3) {
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe2d8c5,
        transparent: true,
        opacity: 0.7,
      });
      const mesh = new THREE.Mesh(this.boxGeo, mat);
      mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.1, (Math.random() - 0.5) * 0.5));
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6),
        rotVel: new THREE.Vector3(3, 3, 3),
        life: 0.35,
        maxLife: 0.35,
        initialScale: 0.8,
        gravity: -1.5,
      });
    }
  }

  public spawnScoreFountain(pos: THREE.Vector3, team: "red" | "blue", isBig: boolean = false) {
    const mainColor = team === "red" ? 0xff4444 : 0x3b82f6;
    const count = isBig ? 28 : 16;
    for (let i = 0; i < count; i++) {
      const c = i % 3 === 0 ? 0xffd700 : i % 3 === 1 ? mainColor : 0xffffff;
      const mat = new THREE.MeshBasicMaterial({ color: c });
      const mesh = new THREE.Mesh(this.octaGeo, mat);
      mesh.position.copy(pos);
      const angle = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 6;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(angle) * spd, 5 + Math.random() * 7, Math.sin(angle) * spd),
        rotVel: new THREE.Vector3(6, 8, 5),
        life: 0.9 + Math.random() * 0.4,
        maxLife: 1.2,
        initialScale: isBig ? 1.4 : 1.0,
        gravity: -12,
      });
    }
  }

  public update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.rotVel.x * dt;
      p.mesh.rotation.y += p.rotVel.y * dt;
      p.mesh.rotation.z += p.rotVel.z * dt;

      const ratio = Math.max(0.01, p.life / p.maxLife);
      if (p.mesh.geometry === this.ringGeo) {
        const s = 1 + (1 - ratio) * p.initialScale;
        p.mesh.scale.set(s, s, 1);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = ratio * 0.85;
      } else {
        const s = ratio * p.initialScale;
        p.mesh.scale.setScalar(s);
      }
    }
  }

  public clear() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
  }
}
