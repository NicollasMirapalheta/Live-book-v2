"""npm run blender:check — prints the Blender version and the render device, exits 0."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import Paths, load_room, log, log_environment, script_args  # noqa: E402

args = script_args()
paths = Paths(args.root)
room = load_room(paths)
log_environment()
log(f"room.json ok: {len(room['nodes'])} nodes, bookcase {room['bookcase']['width']} m")
