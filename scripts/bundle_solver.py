"""Соединить адаптер редактора с проверенными солверами SmartBone и сохранить их авторские уведомления."""

from pathlib import Path
import sys

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP / "scripts"))
from lua_delivery_source import strip_comments

VENDOR = APP / "vendor/preview"


def solver_source():
    return (VENDOR / "legacy.lua").read_text(encoding="utf-8")


def v1_sync_bundle():
    return (VENDOR / "synchronized-v1.lua").read_text(encoding="utf-8")


def bundle(preview=False):
    return (VENDOR / "archived-v2.lua").read_text(encoding="utf-8")


adapter = (APP / "simulation/roblox_adapter.lua").read_text(encoding="utf-8")
api = (APP / "simulation/api.lua").read_text(encoding="utf-8")
output = APP / "src/generated/simulation.lua"
output.parent.mkdir(parents=True, exist_ok=True)
v1 = v1_sync_bundle()
start = v1.index("local installConstraints =")
end = v1.index("module = installConstraints", start)
hook = "                    point.Position = position\n                end"
assert v1[start:end].count(hook) == 1, "Missing Workshop V1 constraint hook"
v1 = (
    v1[:start]
    + v1[start:end].replace(
        hook, hook + "\n                constrainHairBend(point,parent)"
    )
    + v1[end:]
)
force_hook = "Force = (Force + Settings.Force) * (self.ObjectScale * Delta)"
shape_hook = "local stiffness = Settings.Stiffness"
elastic_hook = "difference * (Settings.Elasticity * Delta)"
assert all(v1.count(key) == 1 for key in (force_hook, shape_hook, elastic_hook))
for old, new in (
    (
        force_hook,
        """Force = (Force + Settings.Force) * (self.ObjectScale * Delta)
local frames=hairContactFrames
    updateHairPose(particleTree,frames and frames[1],frames and frames[2],frames and frames[2].neckY)
    local seconds = Delta / 10
local gravityStep = vec(0,-36,0) * (seconds * seconds)""",
    ),
    (
        "+ Force + move + windMove",
        "+ Force:Lerp(gravityStep,workshopRelease(particleTree,particle)) + move + windMove",
    ),
    ("local stiffness = Settings.Stiffness", ""),
    (
        "local contactHit=false",
        """local contactHit=false
        local release=workshopRelease(particleTree,point)
        local stiffness=Settings.Stiffness*(1-release)""",
    ),
    (
        "restPosition=transportCapeReference(particleTree,point,parentPoint,restPosition)",
        """restPosition=transportCapeReference(particleTree,point,parentPoint,restPosition)
            restPosition=workshopHangingTarget(particleTree,point,parentPoint,restPosition)""",
    ),
    (
        "difference * (Settings.Elasticity * Delta)",
        "difference * (Settings.Elasticity * (1-release) * Delta)",
    ),
):
    if v1.count(old) != 1:
        raise ValueError(f"Unexpected synchronized solver hook: {old}")
    v1 = v1.replace(old, new, 1)
hair_bend = (APP / "simulation/hair-bend.lua").read_text(encoding="utf-8")
sampled = (VENDOR / "sampled-root.lua").read_text(encoding="utf-8")
output.write_text(
    strip_comments(adapter)
    + "\n"
    + strip_comments(hair_bend)
    + "\nlocal function loadLegacySolver()\n"
    + solver_source()
    + "\nend\nlocal function loadSynchronizedV1()\n"
    + v1
    + "\nend\nlocal function loadNativeSolver()\n"
    + bundle(preview=True)
    + '\nend\nlocal function loadSolver(mode)\nif mode=="v1-sync"then return loadSynchronizedV1()end\nif mode=="v2-sync"then return(function()\n'
    + strip_comments(sampled)
    + "\nend)()(loadNativeSolver)end\nreturn loadLegacySolver()\nend\n"
    + strip_comments(api),
    encoding="utf-8",
)
print("Проверенный модуль SmartBone собран; скрипты ассетов не включены.")
