# 🏆 CHAOS ARENA — Multiplayer Web 3D Party Game

Juego multijugador competitivo por equipos y rondas en navegador, inspirado en *Halo: Combat Evolved*, *Fall Guys* y *Party Animals*, construido con **Next.js (React)**, **Three.js**, **Rapier3D (WebAssembly)** y **FastAPI (WebSockets)**.

## ✨ Características Implementadas
- **Lobby sin fricción:** Salas por código de 4 letras, URL de invitación directa (`?room=CODE`), selector de equipos (Rojo vs Azul), configuración de Bots con IA y selector entre **Modo Campeonato (3 Rondas con Puntos Dobles en la final)** y **Partida Rápida**.
- **Núcleo Mecánico Único (4 Acciones Base):**
  1. `WASD` + `Espacio`: Movimiento físico con inercia, salto y rebote.
  2. `E` o `Clic Izquierdo`: Agarrar / Soltar pollos, reliquias, gemas, banderas o colaborar en objetos pesados.
  3. `Clic Derecho` o mantener `E`: Barra de fuerza progresiva para lanzamiento parabólico.
  4. `F` o `Shift`: Empujón / Culatazo cuerpo a cuerpo que aplica **Stun de 1.5s** con estrellas giratorias y hace soltar el objeto cargado.
- **Arquitectura Modular (`SceneManager` + `IWorldModule`):**
  1. **Mundo 1 — Granja Caótica (`WorldGranja.ts`):** 15 pollos normales (1 pt) + 1 Pollo Dorado (5 pts) con IA que huye de los jugadores, corrales por equipo y puertas interactivas (`[Q]`) para encerrar o robar pollos.
  2. **Mundo 2 — Atraco al Museo (`WorldMuseo.ts`):** Bóveda central con Reliquia Pesada (5 pts) y sistema de **Peso Compartido** (40% velocidad en solitario, 90% velocidad si 2 compañeros la llevan juntos con rayo de sinergia), gemas secundarias (2 pts) y rayos láser móviles que cierran las compuertas metálicas por 5 segundos.
  3. **Mundo 3 — Cañón Clásico (`WorldCanyon.ts`):** Mapa estilo *Blood Gulch* con bases enfrentadas, elevadores gravitatorios morados, banderas (5 pts) y núcleos de energía (3 pts).
- **Pulido Viral:**
  - Sintetizador de audio arcade procedural (`Web Audio API`) sin dependencias externas.
  - Sistema de partículas 3D al chocar, aturdir y anotar puntos.
  - Grabadora de clips (`ClipRecorder.ts`) que guarda en `.webm` los últimos 10 segundos del canvas 3D.
  - Podio final con confeti y **Medallas Cómicas** (*Terror del Escenario*, *Culatazo Espartano*, *Saco de Boxeo*, *Manos de Mantequilla*).

## 🚀 Cómo Ejecutar

### 1. Servidor Multijugador (FastAPI WebSockets - Puerto 8000)
```powershell
cd backend
python main.py
```

### 2. Cliente 3D (Next.js + Three.js + Rapier - Puerto 3000)
```powershell
cd frontend
npm run dev
```

Luego abre `http://localhost:3000` en una o varias pestañas del navegador.
