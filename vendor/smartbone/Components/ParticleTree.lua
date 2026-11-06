local WIND_SEED = 1029410295159813
local WIND_RNG = Random.new(WIND_SEED)

local module = {}
module.__index = module

function module.new(Root: Bone, RootPart: Instance, Gravity: Vector3)
	return setmetatable({
		WindOffset = WIND_RNG:NextNumber(0, 1000000),
		Root = Root:IsA("Bone") and Root or nil,
		RootPart = RootPart,
		RootWorldToLocal = Root.WorldCFrame:ToObjectSpace(Root.CFrame),
		BoneTotalLength = 0,
		DistanceFromCamera = 100,
		Particles = {},

		LocalCFrame = Root.WorldCFrame,
		LocalGravity = Root.CFrame:PointToWorldSpace(Gravity).Unit * Gravity.Magnitude,
		Force = Vector3.new(0, 0, 0),
		RestGravity = Vector3.new(0, 0, 0),
		ObjectMove = Vector3.new(0, 0, 0),
		ObjectPreviousPosition = Vector3.new(0, 0, 0),
	}, module)
end

return module
