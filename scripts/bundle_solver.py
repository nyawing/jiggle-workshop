"""Bundle the project's trusted SmartBone solver with its original attribution."""
from pathlib import Path
import sys

APP=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(APP/'scripts'))
from lua_delivery_source import strip_comments
VENDOR=APP/'vendor/preview'
def solver_source():return (VENDOR/'legacy.lua').read_text(encoding='utf-8')
def v1_sync_bundle():return (VENDOR/'synchronized-v1.lua').read_text(encoding='utf-8')
def bundle(preview=False):return (VENDOR/'archived-v2.lua').read_text(encoding='utf-8')

adapter=(APP/'simulation/roblox_adapter.lua').read_text(encoding='utf-8')
api=(APP/'simulation/api.lua').read_text(encoding='utf-8')
output=APP/'src/generated/simulation.lua'
output.parent.mkdir(parents=True,exist_ok=True)
v1=v1_sync_bundle()
sampled=(VENDOR/'sampled-root.lua').read_text(encoding='utf-8')
output.write_text(strip_comments(adapter)+'\nlocal function loadLegacySolver()\n'+solver_source()+'\nend\nlocal function loadSynchronizedV1()\n'+v1+'\nend\nlocal function loadNativeSolver()\n'+bundle(preview=True)+'\nend\nlocal function loadSolver(mode)\nif mode=="v1-sync"then return loadSynchronizedV1()end\nif mode=="v2-sync"then return(function()\n'+strip_comments(sampled)+'\nend)()(loadNativeSolver)end\nreturn loadLegacySolver()\nend\n'+strip_comments(api),encoding='utf-8')
print('Bundled trusted SmartBone; asset scripts are not included.')

