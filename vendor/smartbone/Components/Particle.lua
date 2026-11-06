local module = {}
module.__index = module

function module.new(Bone: Bone, RootBone: Bone, RootPart: BasePart, Settings: any)
	return setmetatable({
		Bone = Bone,
		RestLength = 0,
		Weight = 1 * 0.7,
		ParentIndex = 0,
		Transform = Bone.WorldCFrame:ToObjectSpace(RootBone.WorldCFrame):Inverse(),
		LocalTransform = Bone.CFrame:ToObjectSpace(RootBone.CFrame):Inverse(),
		RootTransform = RootBone.WorldCFrame:ToObjectSpace(RootPart.CFrame):Inverse(),
		Radius = Settings.Radius,
		IsColliding = false,

		-- CFrame.identity and Vector3.zero do not exist on this engine, and a missing
		-- static is a silent nil, so these would surface as arithmetic errors deep in
		-- the solver rather than here.
		TransformOffset = CFrame.new(),
		LastTransformOffset = CFrame.new(),
		LocalTransformOffset = CFrame.new(),
		RestPosition = Vector3.new(0, 0, 0),
		BoneTransform = CFrame.new(),
		CalculatedWorldCFrame = Bone.WorldCFrame,
		CalculatedWorldPosition = Bone.WorldPosition,

		Position = Bone.WorldPosition,
		LastPosition = Bone.WorldPosition,
		Anchored = false,
		RecyclingBin = {},
	}, module)
end

return module
