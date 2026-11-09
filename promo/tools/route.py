"""Compute smooth walking routes on the app's walkability grid (data/walk.json).

Writes promo/assets/routes.json with polylines in plan pixels (2000x1500).
"""
import heapq
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
walk = json.loads((ROOT / "data" / "walk.json").read_text())
rooms = {r["id"]: r for r in json.loads((ROOT / "data" / "rooms.json").read_text())}
CELL, W, H = walk["cell"], walk["w"], walk["h"]

grid = []
for v, n in zip(walk["rle"][0::2], walk["rle"][1::2]):
    grid.extend([v] * n)
assert len(grid) == W * H, (len(grid), W * H)


def passable(c):
    return grid[c] != 0


def nearest_passable(x, y):
    cx, cy = int(x // CELL), int(y // CELL)
    best = None
    for r in range(0, 40):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r:
                    continue
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < W and 0 <= ny < H and passable(ny * W + nx):
                    d = dx * dx + dy * dy
                    if best is None or d < best[0]:
                        best = (d, nx, ny)
        if best:
            return best[1], best[2]
    raise ValueError("no passable cell near", x, y)


def clearance():
    # Distance (in cells, capped) to nearest wall: keeps routes in the middle of corridors.
    INF = 99
    dist = [0 if not passable(i) else INF for i in range(W * H)]
    for _ in range(2):
        for y in range(H):
            for x in range(W):
                i = y * W + x
                if dist[i]:
                    if x: dist[i] = min(dist[i], dist[i - 1] + 1)
                    if y: dist[i] = min(dist[i], dist[i - W] + 1)
        for y in range(H - 1, -1, -1):
            for x in range(W - 1, -1, -1):
                i = y * W + x
                if dist[i]:
                    if x < W - 1: dist[i] = min(dist[i], dist[i + 1] + 1)
                    if y < H - 1: dist[i] = min(dist[i], dist[i + W] + 1)
    return dist


CLR = clearance()


def astar(a, b):
    sx, sy = a
    gx, gy = b
    start, goal = sy * W + sx, gy * W + gx
    g = {start: 0.0}
    prev = {}
    pq = [(0.0, start)]
    nbrs = [(1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, 1.414), (1, -1, 1.414), (-1, 1, 1.414), (-1, -1, 1.414)]
    while pq:
        f, cur = heapq.heappop(pq)
        if cur == goal:
            break
        cx, cy = cur % W, cur // W
        for dx, dy, cost in nbrs:
            nx, ny = cx + dx, cy + dy
            if not (0 <= nx < W and 0 <= ny < H):
                continue
            ni = ny * W + nx
            if not passable(ni):
                continue
            pen = 1.0 + 2.5 / (1 + CLR[ni])  # prefer corridor centres
            ng = g[cur] + cost * pen
            if ng < g.get(ni, 1e18):
                g[ni] = ng
                prev[ni] = cur
                heapq.heappush(pq, (ng + math.hypot(gx - nx, gy - ny), ni))
    if goal not in prev and goal != start:
        raise ValueError("unreachable")
    path = [goal]
    while path[-1] != start:
        path.append(prev[path[-1]])
    path.reverse()
    return [((i % W + 0.5) * CELL, (i // W + 0.5) * CELL) for i in path]


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    L = math.hypot(x2 - x1, y2 - y1) or 1e-9
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i]
        d = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1) / L
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[: idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]


def chaikin(pts, n=3):
    for _ in range(n):
        out = [pts[0]]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            out.append((0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1))
            out.append((0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1))
        out.append(pts[-1])
        pts = out
    return pts


def route(a_xy, b_xy):
    raw = astar(nearest_passable(*a_xy), nearest_passable(*b_xy))
    simple = rdp(raw, 6)
    smooth = chaikin(simple, 3)
    length_m = sum(math.hypot(x1 - x0, y1 - y0) for (x0, y0), (x1, y1) in zip(raw, raw[1:])) * 0.108
    return {"pts": [[round(x, 1), round(y, 1)] for x, y in smooth], "corners": [[round(x, 1), round(y, 1)] for x, y in simple], "meters": round(length_m)}


def room_xy(rid):
    r = rooms[rid]
    return (r.get("ax", r["x"]), r.get("ay", r["y"]))


ent = (walk["entrance"]["x"], walk["entrance"]["y"])
out = {
    "entrance": list(ent),
    "dolphin": {"room": rooms["dolphin"]["x"], "xy": room_xy("dolphin"), **route(ent, room_xy("dolphin"))},
    # "start where you are": a spot in the inner courtyard near the east side
    "fromCourt": {"start": [1010, 1150], **route((1010, 1150), room_xy("dolphin"))},
    "toilet": {"to": "wc_hta2", **route(ent, room_xy("wc_hta2"))},
    "office": {"to": "htb_secretary", **route(ent, room_xy("htb_secretary"))},
    "shelter": {"to": "shelter_hta1", **route(ent, room_xy("shelter_hta1"))},
}
# nearest toilet from the "you are here" spot (by walking length)
court = (1010, 1150)
best = None
for rid, r in rooms.items():
    if r["category"] == "toilets":
        try:
            rt = route(court, room_xy(rid))
        except ValueError:
            continue
        if best is None or rt["meters"] < best[1]["meters"]:
            best = (rid, rt)
out["courtToilet"] = {"to": best[0], **best[1]}

# "lost" wandering paths for the maze scene: random corridor-to-corridor walks
import random
random.seed(4)
cands = [(x, y) for (x, y) in [(r["x"], r["y"]) for r in rooms.values() if r["category"] in ("classroom", "computers")]]
maze = []
for i in range(16):
    a, b = random.sample(cands, 2)
    try:
        rt = route(a, b)
    except Exception:
        continue
    if 25 < rt["meters"] < 160:
        maze.append({"pts": rt["pts"], "meters": rt["meters"], "cut": round(random.uniform(0.45, 0.8), 2)})
out["maze"] = maze

dst = ROOT / "promo" / "assets" / "routes.json"
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text(json.dumps(out))
for k, v in out.items():
    if isinstance(v, dict) and "meters" in v:
        print(k, v["meters"], "m", len(v["pts"]), "pts")
