"""Bundle the project's trusted SmartBone solver with its original attribution."""
from pathlib import Path
import sys

APP=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(APP/'scripts'))
from smartbone_preview_sources import solver_source
from lua_delivery_source import strip_comments

adapter=(APP/'simulation/roblox_adapter.lua').read_text(encoding='utf-8')
api=(APP/'simulation/api.lua').read_text(encoding='utf-8')
output=APP/'src/generated/simulation.lua'
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(strip_comments(adapter)+'\nlocal function loadSolver()\n'+solver_source()+'\nend\n'+strip_comments(api),encoding='utf-8')
print('Bundled trusted SmartBone; asset scripts are not included.')
