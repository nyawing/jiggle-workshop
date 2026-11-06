"""Bundle the existing SmartBone solver, not asset-supplied executable code.

Original/vendor sources and their comments remain untouched. Only our adapter
and generated compatibility glue are comment-stripped for client delivery.
"""
from pathlib import Path
from lua_delivery_source import strip_comments

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / 'vendor/smartbone'


def solver_source():
    modules = [
        ('Config', 'Dependencies/Config.lua'),
        ('UnitConversion', 'Dependencies/UnitConversion.lua'),
        ('DefaultSettings', 'Dependencies/DefaultSettings.lua'),
        ('ParticleTree', 'Components/ParticleTree.lua'),
        ('Particle', 'Components/Particle.lua'),
        ('SettingsMath', 'Dependencies/SettingsMath.lua'),
        ('Utilities', 'Dependencies/Utilities.lua'),
    ]
    blocks = []
    for name, path in modules:
        blocks.append('local function load_' + name + '()\n' + (VENDOR/path).read_text(encoding='utf-8') + '\nend')
    # Dependencies are bundled tables. No require of an accessory/game module at
    # CoreScript identity; no Actor or cloned LocalScripts in preview models.
    blocks.append('local dependencies, components = {}, {}')
    for name, path in modules:
        target = 'components' if path.startswith('Components/') else 'dependencies'
        blocks.append(target + '.' + name + ' = load_' + name + '()')
    blocks.append('local script = {WaitForChild = function(_, name)\n'
                  'if name == "Dependencies" then return dependencies end\n'
                  'if name == "Components" then return components end\nend}\n'
                  'local function require(module) return module end')
    original = (VENDOR/'SmartBone.lua').read_text(encoding='utf-8')
    # Start is gameplay discovery/Actor infrastructure, not the solver. Exclude
    # it from the preview bundle instead of ever launching a second game host.
    assert original.count('function module.Start()') == 1
    original = original.split('function module.Start()')[0]
    # CFrame.Rotation is missing in the 0.482 client; the bundled copy derives it.
    compat = [
        ('parentPoint.TransformOffset.Rotation', '__rotOnly(parentPoint.TransformOffset)'),
        ('Utilities.GetRotationBetween(referenceCFrame.UpVector, v1, v0).Rotation',
         '__rotOnly(Utilities.GetRotationBetween(referenceCFrame.UpVector, v1, v0))'),
        ('referenceCFrame.Rotation', '__rotOnly(referenceCFrame)'),
    ]
    for before, after in compat:
        assert original.count(before) == 1, before
        original = original.replace(before, after)
    assert '.Rotation' not in original
    original = 'local function __rotOnly(cf) return cf - cf.Position end\n' + original
    destroy = '''
function module:Destroy()
    if self.Removed then return end
    self.Removed = true
    for _, connection in pairs(self.Connections) do connection:Disconnect() end
    self.Connections = {}
    CurrentControllers[self.ID] = nil
    self.RemovedEvent:Destroy()
end
local originalInit = module.Init
function module:Init()
    local ok, message = pcall(originalInit, self)
    if not ok then self:Destroy(); error(message) end
end
local originalNew = module.new
function module.new(part, roots)
    for name, default in pairs(DefaultSettings) do
        local value = part:GetAttribute(name)
        if value ~= nil then
            assert(typeof(value) == typeof(default), "Invalid SmartBone setting: " .. name)
            if type(value) == "number" then
                assert(value == value and math.abs(value) < 10000, "Nonfinite SmartBone setting")
            elseif typeof(value) == "Vector3" then
                assert(value.Magnitude == value.Magnitude and value.Magnitude < 10000, "Invalid SmartBone vector")
                if name == "Gravity" then assert(value.Magnitude > 0, "Zero SmartBone gravity") end
            end
        end
    end
    return originalNew(part, roots)
end
return module
'''
    blocks.append(original + strip_comments(destroy))
    return '\n'.join(blocks)


def bootstrap_source():
    host = (ROOT/'games/accessory-effects/SmartBonePreviewHost.lua').read_text(encoding='utf-8')
    marker = '-- __SMARTBONE_SOLVER_FACTORY__'
    assert host.count(marker) == 1
    before, after = host.split(marker)
    host = (strip_comments(before) + '\nlocal function solverFactory()\n' + solver_source()
            + '\nend\n' + strip_comments(after))
    boot = (ROOT/'games/accessory-effects/SmartBonePreviewBootstrap.lua').read_text(encoding='utf-8')
    return 'local function __NYAWING_SMARTBONE_PREVIEW_FACTORY__()\n' + host + '\nend\n' + strip_comments(boot)
