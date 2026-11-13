import asyncio
import json
import random
import string
import time
import os
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Chaos Arena Multiplayer Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateRoomRequest(BaseModel):
    host_name: str = "Spartan"
    mode: str = "championship"  # "quick" or "championship"
    world: str = "granja"       # "granja", "museo", "canyon"
    bots_Count: int = 3
    round_duration: int = 120   # seconds


class PlayerState:
    def __init__(self, player_id: str, name: str, team: str, character: str = "spartan", is_bot: bool = False):
        self.id = player_id
        self.name = name
        self.team = team  # "red" or "blue"
        self.character = character
        self.is_bot = is_bot
        self.pos = [0.0, 2.0, 0.0]
        self.vel = [0.0, 0.0, 0.0]
        self.rot_y = 0.0
        self.anim = "idle"  # idle, run, carrying, stunned
        self.carrying_id: Optional[str] = None
        self.stunned_until: float = 0.0
        # Match stats for comic medals
        self.stats = {
            "scores": 0,
            "pushes": 0,
            "times_stunned": 0,
            "grabs": 0,
            "carry_time": 0.0,
        }

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "team": self.team,
            "character": self.character,
            "isBot": self.is_bot,
            "pos": [round(c, 3) for c in self.pos],
            "vel": [round(c, 3) for c in self.vel],
            "rotY": round(self.rot_y, 3),
            "anim": self.anim,
            "carryingId": self.carrying_id,
            "stats": self.stats,
        }


class Room:
    def __init__(self, code: str, host_id: str, mode: str, world: str, bots_count: int, round_duration: int):
        self.code = code
        self.host_id = host_id
        self.mode = mode  # "quick" or "championship"
        self.selected_world = world
        self.bots_count = max(0, min(7, bots_count))
        self.round_duration = max(45, min(300, round_duration))

        self.status = "lobby"  # "lobby", "playing", "round_end", "match_over"
        self.players: Dict[str, PlayerState] = {}
        self.connections: Dict[str, WebSocket] = {}

        # Championship state
        self.championship_worlds = ["granja", "museo", "canyon"]
        self.current_round_index = 0
        self.current_world = world if mode == "quick" else self.championship_worlds[0]

        # Scores: round scores and cumulative championship scores
        self.round_scores = {"red": 0, "blue": 0}
        self.total_scores = {"red": 0, "blue": 0}
        self.round_history: List[Dict[str, Any]] = []

        self.round_start_time: float = 0.0
        self.time_remaining: float = float(self.round_duration)

        # Shared dynamic objects synced by host/authority
        self.world_objects: Dict[str, Any] = {}
        self.gates_state: Dict[str, bool] = {"red_gate": False, "blue_gate": False, "vault_locked": False}
        self.last_update = time.time()

    @property
    def is_double_points(self) -> bool:
        return self.mode == "championship" and self.current_round_index == len(self.championship_worlds) - 1

    @property
    def points_multiplier(self) -> int:
        return 2 if self.is_double_points else 1

    def assign_team(self) -> str:
        red_count = sum(1 for p in self.players.values() if p.team == "red" and not p.is_bot)
        blue_count = sum(1 for p in self.players.values() if p.team == "blue" and not p.is_bot)
        return "red" if red_count <= blue_count else "blue"

    def ensure_bots(self):
        # Remove existing bots first
        bot_ids = [pid for pid, p in self.players.items() if p.is_bot]
        for bid in bot_ids:
            del self.players[bid]

        bot_names = [
            "Caboose-Bot", "Chief-Bot", "PolloLoco", "TacoMaster",
            "SargentoRojo", "NinjaTorpe", "CortanaJr", "ArbiterXP"
        ]
        bot_chars = ["rooster", "spartan", "ninja", "viking", "dino", "astro"]
        for i in range(self.bots_count):
            red_total = sum(1 for p in self.players.values() if p.team == "red")
            blue_total = sum(1 for p in self.players.values() if p.team == "blue")
            team = "blue" if red_total > blue_total else "red"
            bid = f"bot_{i+1}"
            bname = f"🤖 {bot_names[i % len(bot_names)]}"
            bchar = bot_chars[i % len(bot_chars)]
            self.players[bid] = PlayerState(bid, bname, team, character=bchar, is_bot=True)

    def compute_medals(self) -> List[Dict[str, Any]]:
        medals = []
        plist = list(self.players.values())
        if not plist:
            return medals

        # 1. Most points scored
        top_scorer = max(plist, key=lambda p: p.stats["scores"])
        medals.append({
            "title": "Terror del Escenario",
            "icon": "crown",
            "winner": top_scorer.name,
            "team": top_scorer.team,
            "desc": f"Anotó o capturó {top_scorer.stats['scores']} pts para su equipo",
        })

        # 2. Most pushes / stuns dealt
        top_pusher = max(plist, key=lambda p: p.stats["pushes"])
        medals.append({
            "title": "Culatazo Espartano",
            "icon": "zap",
            "winner": top_pusher.name,
            "team": top_pusher.team,
            "desc": f"Propinó {top_pusher.stats['pushes']} empujones aturdidores",
        })

        # 3. Most times stunned
        top_stunned = max(plist, key=lambda p: p.stats["times_stunned"])
        medals.append({
            "title": "Saco de Boxeo",
            "icon": "skull",
            "winner": top_stunned.name,
            "team": top_stunned.team,
            "desc": f"Recibió {top_stunned.stats['times_stunned']} golpes y vio estrellitas",
        })

        # 4. Most grabs
        top_grabber = max(plist, key=lambda p: p.stats["grabs"])
        medals.append({
            "title": "Manos de Mantequilla",
            "icon": "hand",
            "winner": top_grabber.name,
            "team": top_grabber.team,
            "desc": f"Agarró objetos {top_grabber.stats['grabs']} veces en la partida",
        })

        return medals

    def to_snapshot(self) -> Dict[str, Any]:
        return {
            "type": "state_snapshot",
            "roomCode": self.code,
            "hostId": self.host_id,
            "status": self.status,
            "mode": self.mode,
            "currentWorld": self.current_world,
            "roundIndex": self.current_round_index,
            "totalRounds": len(self.championship_worlds) if self.mode == "championship" else 1,
            "doublePoints": self.is_double_points,
            "timeRemaining": round(max(0.0, self.time_remaining), 1),
            "roundScores": self.round_scores,
            "totalScores": self.total_scores,
            "roundHistory": self.round_history,
            "gates": self.gates_state,
            "players": [p.to_dict() for p in self.players.values()],
            "objects": self.world_objects,
            "botsCount": self.bots_count,
            "roundDuration": self.round_duration,
        }


rooms: Dict[str, Room] = {}


def generate_room_code() -> str:
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(random.choice(chars) for _ in range(4))
        if code not in rooms:
            return code


@app.get("/api/health")
async def health():
    return {"status": "ok", "active_rooms": len(rooms)}


@app.get("/api/rooms")
async def list_rooms():
    res = []
    for code, r in rooms.items():
        human_count = sum(1 for p in r.players.values() if not p.is_bot)
        res.append({
            "code": code,
            "mode": r.mode,
            "currentWorld": r.current_world,
            "status": r.status,
            "playersCount": human_count,
            "botsCount": r.bots_count,
        })
    return {"rooms": res}


@app.post("/api/rooms")
async def create_room(req: CreateRoomRequest):
    code = generate_room_code()
    host_id = f"p_{int(time.time()*1000)}_{random.randint(100,999)}"
    room = Room(
        code=code,
        host_id=host_id,
        mode=req.mode,
        world=req.world,
        bots_count=req.bots_Count,
        round_duration=req.round_duration,
    )
    room.ensure_bots()
    rooms[code] = room
    return {"code": code, "hostId": host_id, "room": room.to_snapshot()}


@app.get("/api/rooms/{code}")
async def get_room(code: str):
    code = code.upper()
    if code not in rooms:
        raise HTTPException(status_code=404, detail="Sala no encontrada")
    return rooms[code].to_snapshot()


async def broadcast(room: Room, message: Dict[str, Any], exclude_id: Optional[str] = None):
    payload = json.dumps(message)
    dead = []
    for pid, ws in list(room.connections.items()):
        if pid == exclude_id:
            continue
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(pid)
    for pid in dead:
        room.connections.pop(pid, None)


@app.websocket("/ws/{code}")
async def websocket_endpoint(
    websocket: WebSocket,
    code: str,
    player_id: str = "",
    name: str = "Spartan",
    team: str = "",
    character: str = "spartan",
):
    code = code.upper()
    await websocket.accept()

    if code not in rooms:
        # Auto-create room if joining directly by URL/4-letter code!
        host_id = player_id or f"p_{int(time.time()*1000)}"
        room = Room(
            code=code,
            host_id=host_id,
            mode="championship",
            world="granja",
            bots_count=3,
            round_duration=120,
        )
        room.ensure_bots()
        rooms[code] = room
    else:
        room = rooms[code]

    if not player_id:
        player_id = f"p_{int(time.time()*1000)}_{random.randint(100,999)}"

    if player_id not in room.players:
        assigned_team = team if team in ("red", "blue") else room.assign_team()
        room.players[player_id] = PlayerState(player_id, name[:18], assigned_team, character=character, is_bot=False)
    else:
        room.players[player_id].name = name[:18]
        room.players[player_id].character = character
        if team in ("red", "blue"):
            room.players[player_id].team = team

    room.connections[player_id] = websocket

    # Ensure there is a valid human host
    human_ids = [pid for pid, p in room.players.items() if not p.is_bot and pid in room.connections]
    if human_ids and room.host_id not in human_ids:
        room.host_id = human_ids[0]

    # Send initial welcome + snapshot
    await websocket.send_text(json.dumps({
        "type": "welcome",
        "playerId": player_id,
        "room": room.to_snapshot()
    }))

    await broadcast(room, {
        "type": "player_joined",
        "player": room.players[player_id].to_dict(),
        "hostId": room.host_id,
    }, exclude_id=player_id)

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "input_state":
                p = room.players.get(player_id)
                if p:
                    p.pos = data.get("pos", p.pos)
                    p.vel = data.get("vel", p.vel)
                    p.rot_y = data.get("rotY", p.rot_y)
                    p.anim = data.get("anim", p.anim)
                    p.carrying_id = data.get("carryingId", p.carrying_id)

                # If host also sends bot states & world objects snapshot, update them
                if player_id == room.host_id:
                    bot_states = data.get("bots", [])
                    for bdata in bot_states:
                        bid = bdata.get("id")
                        if bid and bid in room.players and room.players[bid].is_bot:
                            bp = room.players[bid]
                            bp.pos = bdata.get("pos", bp.pos)
                            bp.vel = bdata.get("vel", bp.vel)
                            bp.rot_y = bdata.get("rotY", bp.rot_y)
                            bp.anim = bdata.get("anim", bp.anim)
                            bp.carrying_id = bdata.get("carryingId", bp.carrying_id)

                    if "objects" in data:
                        room.world_objects = data["objects"]
                    if "roundScores" in data and room.status == "playing":
                        room.round_scores = data["roundScores"]

            elif msg_type == "configure_lobby":
                if player_id == room.host_id and room.status == "lobby":
                    room.mode = data.get("mode", room.mode)
                    room.selected_world = data.get("world", room.selected_world)
                    room.bots_count = max(0, min(7, int(data.get("botsCount", room.bots_count))))
                    room.round_duration = max(45, min(300, int(data.get("roundDuration", room.round_duration))))
                    room.current_world = room.selected_world if room.mode == "quick" else room.championship_worlds[0]
                    room.ensure_bots()
                    await broadcast(room, room.to_snapshot())

            elif msg_type == "switch_team":
                p = room.players.get(player_id)
                if p:
                    p.team = "blue" if p.team == "red" else "red"
                    await broadcast(room, room.to_snapshot())

            elif msg_type == "select_character":
                p = room.players.get(player_id)
                if p and data.get("character"):
                    p.character = data.get("character")
                    await broadcast(room, room.to_snapshot())

            elif msg_type == "start_match":
                if player_id == room.host_id:
                    room.status = "playing"
                    room.current_round_index = 0
                    room.total_scores = {"red": 0, "blue": 0}
                    room.round_scores = {"red": 0, "blue": 0}
                    room.round_history = []
                    room.gates_state = {"red_gate": False, "blue_gate": False, "vault_locked": False}
                    for p in room.players.values():
                        p.stats = {"scores": 0, "pushes": 0, "times_stunned": 0, "grabs": 0, "carry_time": 0.0}
                    if room.mode == "championship":
                        room.current_world = room.championship_worlds[0]
                    else:
                        room.current_world = room.selected_world
                    room.round_start_time = time.time()
                    room.time_remaining = float(room.round_duration)
                    await broadcast(room, {
                        "type": "round_start",
                        "room": room.to_snapshot()
                    })

            elif msg_type == "next_round":
                if player_id == room.host_id and room.status == "round_end":
                    if room.mode == "championship" and room.current_round_index + 1 < len(room.championship_worlds):
                        room.current_round_index += 1
                        room.current_world = room.championship_worlds[room.current_round_index]
                        room.round_scores = {"red": 0, "blue": 0}
                        room.gates_state = {"red_gate": False, "blue_gate": False, "vault_locked": False}
                        room.world_objects = {}
                        room.status = "playing"
                        room.round_start_time = time.time()
                        room.time_remaining = float(room.round_duration)
                        await broadcast(room, {
                            "type": "round_start",
                            "room": room.to_snapshot()
                        })
                    else:
                        room.status = "match_over"
                        await broadcast(room, {
                            "type": "match_over",
                            "room": room.to_snapshot(),
                            "medals": room.compute_medals()
                        })

            elif msg_type == "return_lobby":
                if player_id == room.host_id:
                    room.status = "lobby"
                    room.current_round_index = 0
                    room.round_scores = {"red": 0, "blue": 0}
                    room.total_scores = {"red": 0, "blue": 0}
                    await broadcast(room, room.to_snapshot())

            elif msg_type == "action_event":
                # Generic gameplay events: push_hit, grab, throw, toggle_gate, score_event, laser_trip
                ev_kind = data.get("kind")
                actor_id = data.get("actorId", player_id)
                actor = room.players.get(actor_id)

                if ev_kind == "push_hit":
                    target_id = data.get("targetId")
                    if actor:
                        actor.stats["pushes"] += 1
                    if target_id and target_id in room.players:
                        target = room.players[target_id]
                        target.stats["times_stunned"] += 1
                        target.carrying_id = None
                        target.anim = "stunned"

                elif ev_kind == "grab":
                    if actor:
                        actor.stats["grabs"] += 1

                elif ev_kind == "toggle_gate":
                    gate_key = data.get("gate")
                    if gate_key in room.gates_state:
                        room.gates_state[gate_key] = not room.gates_state[gate_key]

                elif ev_kind == "score_event":
                    team_scored = data.get("team")
                    pts = int(data.get("points", 1)) * room.points_multiplier
                    if team_scored in ("red", "blue"):
                        room.round_scores[team_scored] = max(0, room.round_scores[team_scored] + pts)
                    if actor and pts > 0:
                        actor.stats["scores"] += pts

                await broadcast(room, {
                    "type": "action_event",
                    "event": data,
                    "gates": room.gates_state,
                    "roundScores": room.round_scores,
                })

    except WebSocketDisconnect:
        room.connections.pop(player_id, None)
        room.players.pop(player_id, None)
        human_ids = [pid for pid, p in room.players.items() if not p.is_bot and pid in room.connections]
        if human_ids:
            if room.host_id not in human_ids:
                room.host_id = human_ids[0]
            await broadcast(room, {
                "type": "player_left",
                "playerId": player_id,
                "hostId": room.host_id
            })
        else:
            # Keep room alive briefly or clean up empty room
            rooms.pop(code, None)


async def server_tick_loop():
    """20 Hz state broadcast & authoritative round timer."""
    while True:
        now = time.time()
        for code, room in list(rooms.items()):
            if not room.connections:
                continue
            if room.status == "playing":
                elapsed = now - room.round_start_time
                room.time_remaining = max(0.0, float(room.round_duration) - elapsed)
                if room.time_remaining <= 0.0:
                    # End of round!
                    mult = room.points_multiplier
                    r_pts = room.round_scores["red"]
                    b_pts = room.round_scores["blue"]
                    room.total_scores["red"] += r_pts
                    room.total_scores["blue"] += b_pts
                    room.round_history.append({
                        "round": room.current_round_index + 1,
                        "world": room.current_world,
                        "red": r_pts,
                        "blue": b_pts,
                        "doublePoints": room.is_double_points,
                    })

                    is_last_round = (
                        room.mode == "quick"
                        or room.current_round_index + 1 >= len(room.championship_worlds)
                    )
                    if is_last_round:
                        room.status = "match_over"
                        await broadcast(room, {
                            "type": "match_over",
                            "room": room.to_snapshot(),
                            "medals": room.compute_medals(),
                        })
                    else:
                        room.status = "round_end"
                        await broadcast(room, {
                            "type": "round_end",
                            "room": room.to_snapshot(),
                        })
                else:
                    await broadcast(room, room.to_snapshot())
            else:
                # In lobby or between rounds, broadcast at lower rate
                if int(now * 20) % 10 == 0:
                    await broadcast(room, room.to_snapshot())

        await asyncio.sleep(0.05)  # 20 ticks/s


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(server_tick_loop())


STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
