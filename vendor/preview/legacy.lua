local function load_Config()
return {

	Debug = false,

}


end
local function load_UnitConversion()
local MetricUnit = 0.2800336040324839

local ImperialUnit = 0.9187454494539344



local Unit = {

	Conversions = {

		--Metric

		Kilometer = MetricUnit * 1000,

		Hektometer = MetricUnit * 100,

		Decameter = MetricUnit * 10,

		Meter = MetricUnit,

		Decimeter = MetricUnit / 10,

		Centimeter = MetricUnit / 100,

		Millimeter = MetricUnit / 1000,

		--Imperial

		Miles = ImperialUnit * 5280,

		Yards = ImperialUnit * 3,

		Feet = ImperialUnit,

		Inches = ImperialUnit / 12,

	},

}



function Unit.Convert(Value: number, Method: string)

	return Unit.Conversions[Method] ~= nil and Value * Unit.Conversions[Method]

end



function Unit.ConvertInverse(Value: number, Method: string)

	return Unit.Conversions[Method] ~= nil and Unit.Conversions[Method] / Value

end



function Unit.ConvertRounded(Value: number, Method: string)

	return Unit.Conversions[Method] ~= nil and math.floor(Value * Unit.Conversions[Method])

end



return Unit


end
local function load_DefaultSettings()
local FORCE_MULTIPLIER = 0.2



return {

	Damping = 0.1,

	Stiffness = 0.2,

	Inertia = 0,

	Elasticity = 0.5,

	BlendWeight = 1,

	Radius = 0.2,

	AnchorDepth = 0,

	-- The axis constants arrived after this engine. They read as nil rather than

	-- erroring, so the original line failed as arithmetic on a nil value.

	Force = Vector3.new(0, 1, 0) * FORCE_MULTIPLIER,

	Gravity = Vector3.new(0, -1, 0),

	WindDirection = Vector3.new(-1, 0, 0),

	WindSpeed = 8,

	WindStrength = 1,

	WindInfluence = 1,

	AnchorsRotate = false,

	UpdateRate = 60,

	ActivationDistance = 45,

	ThrottleDistance = 15,

}


end
local function load_ParticleTree()
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


end
local function load_Particle()
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


end
local function load_SettingsMath()
local function Clamp(min, max)

	return function(value)

		return math.clamp(value, min, max)

	end

end



local function Floor(value)

	return math.floor(value)

end



local function Offset(offset)

	return function(value)

		return value + offset

	end

end



return {

	Damping = Clamp(0, 1),

	AnchorDepth = Floor,

	Stiffness = Clamp(0, 1),

	Inertia = Clamp(0, 1),

	Elasticity = Clamp(0, 1),

	BlendWeight = Clamp(0, 1),

	UpdateRate = Clamp(0, 165),

	WindStrength = Clamp(0, 10),



	Gravity = Offset(Vector3.new(0, -0.01, 0)),

}


end
local function load_Utilities()
local module = {}



function module.ShallowCopy(original)

	local copy = {}

	for key, value in pairs(original) do

		copy[key] = value

	end

	return copy

end



function module.Lerp(A: any, B: any, C: any)

	return A + (B - A) * C

end



function module.GetRotationBetween(U: Vector3, V: Vector3, Axis: Vector3)

	local Dot, UXV = U:Dot(V), U:Cross(V)

	if Dot < -0.99999 then

		return CFrame.fromAxisAngle(Axis, math.pi)

	end

	return CFrame.new(0, 0, 0, UXV.X, UXV.Y, UXV.Z, 1 + Dot)

end



function module.GetHierarchyLength(Child: Instance, Root: Instance)

	if Child == Root then

		warn("Child and Root are the same Instance!")

		return

	elseif Child == nil then

		warn("Child is nil!")

		return

	end

	local Up = Child

	local Count = 0

	repeat

		Count += 1

		Up = Up.Parent

	until Up == Root

	return Count

end



function module.WaitForChildOfClass(parent: Instance, className: string, timeOut: number)

	local start = os.clock()

	timeOut = timeOut or 10

	repeat

		-- No task library on this engine; wait() is the equivalent here.

		wait()

	until parent:FindFirstChildOfClass(className) or os.clock() - start > timeOut

	return parent:FindFirstChildOfClass(className)

end



return module


end
local dependencies, components = {}, {}
dependencies.Config = load_Config()
dependencies.UnitConversion = load_UnitConversion()
dependencies.DefaultSettings = load_DefaultSettings()
components.ParticleTree = load_ParticleTree()
components.Particle = load_Particle()
dependencies.SettingsMath = load_SettingsMath()
dependencies.Utilities = load_Utilities()
local script = {WaitForChild = function(_, name)
if name == "Dependencies" then return dependencies end
if name == "Components" then return components end
end}
local function require(module) return module end
local function __rotOnly(cf) return cf - cf.Position end
local transportCapeReference=(function()
                                                                            
                                                                              
                                                                             
                                                                                   
return function(tree,point,parent,restPosition)
    if tree.RootPart:GetAttribute('SmartBoneMotionMode')~='cape'then return restPosition end
    local previous=tree.Particles[parent.ParentIndex]
    if not previous or parent.Anchored then return restPosition end
    local authored=parent.TransformOffset.Position-previous.TransformOffset.Position
    local solved=parent.Position-previous.Position
    if authored.Magnitude<1e-7 or solved.Magnitude<1e-7 then return restPosition end
    local a,b=authored.Unit,solved.Unit
    local axis=a:Cross(b)
    if axis.Magnitude<1e-7 then return restPosition end
    local angle=math.min(math.acos(math.clamp(a:Dot(b),-1,1)),math.rad(35))*.75
    local rotation=CFrame.fromAxisAngle(axis.Unit,angle)
    return parent.Position+rotation:VectorToWorldSpace(restPosition-parent.Position)
end

end)()
--[[ SmartBone Version 0.1.2 by Celnak ]] --

-- // Types \\ --

type func = () -> ()
type dictionary = { [string]: any }
type array = { [number]: any }

type rootList = {
	[number]: Bone
}
type particle = {
	Bone: Bone,
	RestLength: number,
	Weight: number,
	ParentIndex: number,
	Transform: CFrame,
	LocalTransform: CFrame,
	RootTransform: CFrame,
	Radius: number,
	IsColliding: boolean,
	BoneLength: number,
	HeirarchyLength: number,
	DebugPart: BasePart,

	TransformOffset: CFrame,
	LastTransformOffset: CFrame,
	LocalTransformOffset: CFrame,
	RestPosition: Vector3,
	BoneTransform: CFrame,
	CalculatedWorldCFrame: CFrame,
	CalculatedWorldPosition: Vector3,

	Position: Vector3,
	LastPosition: Vector3,
	Anchored: boolean,
	RecyclingBin: any,
}
type particleArray = {
	[number]: particle
}
type particleTree = {
	WindOffset: number,
	Root: Bone,
	RootPart: BasePart,
	RootWorldToLocal: Vector3,
	BoneTotalLength: number,
	Particles: particleArray,
	LocalCFrame: CFrame,
	LocalGravity: Vector3,
	Force: Vector3,
	RestGravity: Vector3,
	ObjectMove: Vector3,
	ObjectPreviousPosition: Vector3,
}

-- // Services \\ --

local Lighting = game:GetService("Lighting")
local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")

-- // 2021 compatibility \\ --
-- The task library does not exist on this engine. SmartBone uses only spawn and wait,
-- and both have faithful stand-ins: coroutine.wrap resumes immediately the way
-- task.spawn does, where the old global spawn() would defer to the next scheduler step
-- and change the ordering the module relies on.
local task = task
if not task then
	task = {
		wait = wait,
		delay = delay,
		spawn = function(callback, ...)
			local arguments = { ... }
			local count = select("#", ...)
			coroutine.wrap(function()
				callback(unpack(arguments, 1, count))
			end)()
		end,
	}
end

if not RunService:IsClient() then 
	warn("Attempted to initialize SmartBone on Server.") 
	return nil
end

-- // Constructors \\ --

-- Vector3.zero / one / xAxis / yAxis / zAxis are all newer than this engine, and a
-- missing static reads as nil rather than throwing -- so they arrive as "attempt to
-- perform arithmetic on nil" somewhere far from the line that is actually wrong.
local ZERO = Vector3.new(0, 0, 0)

-- // Dependencies \\ --

local Dependencies = script:WaitForChild("Dependencies")
local Components = script:WaitForChild("Components")

local Config = require(Dependencies.Config)

local UnitConversion = require(Dependencies.UnitConversion)
local DefaultSettings = require(Dependencies.DefaultSettings)

local ParticleTree = require(Components.ParticleTree)
local Particle = require(Components.Particle)

local SettingsMath = require(Dependencies.SettingsMath)
local Utilities = require(Dependencies.Utilities)

local ID_SEED = 12098135901304
local ID_RANDOM = Random.new(ID_SEED)

local SmartBoneTags = CollectionService:GetTagged("SmartBone")

-- // Debug \\ --

local DEBUG = Config.Debug
local DEBUG_FOLDER, DEBUG_HIGHLIGHT

if DEBUG then
	DEBUG_FOLDER = Instance.new("Model")
	DEBUG_FOLDER.Name = "SMARTBONE_DEBUGFOLDER"
	DEBUG_FOLDER.Parent = workspace

	-- Highlight is a 2022 class and Enum.HighlightDepthMode does not exist either, so
	-- creating it would throw and take the whole module down before it ever runs. The
	-- debug parts below are the part of the visualisation that still works.
	local ok = pcall(function()
		DEBUG_HIGHLIGHT = Instance.new("Highlight")
		DEBUG_HIGHLIGHT.FillColor = Color3.fromRGB(255, 0, 0)
		DEBUG_HIGHLIGHT.OutlineTransparency = 1
		DEBUG_HIGHLIGHT.FillTransparency = 0
		DEBUG_HIGHLIGHT.Parent = DEBUG_FOLDER
		DEBUG_HIGHLIGHT.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
		DEBUG_HIGHLIGHT.Enabled = true
	end)
	if not ok then
		DEBUG_HIGHLIGHT = nil
		warn("SmartBone: Highlight is unavailable on this engine, debug parts only.")
	end
end

-- // Module \\ --

local CurrentControllers = {}
local module = {}
module.__index = module

function module.new(rootPart: BasePart, rootList: array)
	local self = setmetatable({
		ID = ID_RANDOM:NextInteger(1, 10000000),
		RootPart = rootPart,
		Time = 0,
		ParticleTrees = {},
		Connections = {},
		RootList = rootList,
		ObjectScale = UnitConversion.Convert(math.abs(rootPart.Size.X), "Millimeter"),
		WindPreviousPosition = Vector3.new(0, 0, 0),
		Removed = false,
		RemovedEvent = Instance.new("BindableEvent"),
		InRange = false,

		Settings = {},
	}, module)

	for name, value in pairs(DefaultSettings) do
		self.Settings[name] = rootPart:GetAttribute(name) or value
	end

	self.Settings.BlendWeight = 1
	self.Settings.UpdateRate = math.floor(self.Settings.UpdateRate + 0.1)

	self:Init()

	self:UpdateParameters(self.Settings)

	return self
end

function module:Init()
	local RootPart = self.RootPart

	local tailBone, start

	CurrentControllers[self.ID] = self

	-- ConnectParallel does not exist here. These handlers only copy an attribute into a
	-- settings table, so running them serially costs nothing.
	self.Connections["AttributeChanged"] = RootPart.AttributeChanged:Connect(function(Attribute: string)
		if not self.Settings[Attribute] then return end
		self:UpdateParameters(Attribute, RootPart:GetAttribute(Attribute))
	end)

	self.Connections["LightingAttributeChanged"] = Lighting.AttributeChanged:Connect(function(Attribute: string)
		if not self.Settings[Attribute] then return end
		self:UpdateParameters(Attribute, Lighting:GetAttribute(Attribute))
	end)

	for _, Bone in ipairs(RootPart:GetDescendants()) do
		if Bone:IsA("Bone") and Bone.Parent:IsA("Bone") and #Bone:GetChildren() == 0 then
			start = Bone.WorldCFrame
				+ (Bone.WorldCFrame.UpVector.Unit * (Bone.WorldPosition - Bone.Parent.WorldPosition).Magnitude)
			tailBone = Instance.new("Bone")
			tailBone.Parent = Bone
			tailBone.Name = Bone.Name .. "_Tail"
			tailBone.WorldCFrame = start
		end
	end

	for _, Root in ipairs(self.RootList) do
		self:AppendParticleTree(Root)
	end

	for _, particleTree in ipairs(self.ParticleTrees) do
		self:AppendParticles(particleTree, particleTree.Root, 0, 0)
	end
end

function module:AppendParticleTree(Root: Bone)
	table.insert(self.ParticleTrees, ParticleTree.new(Root, self.RootPart, self.Settings.Gravity))
end

function module:AppendParticles(particleTree: dictionary, Bone: Bone, ParentIndex: number, BoneLength: number)
	local Settings = self.Settings

	local particle: particle = Particle.new(Bone, particleTree.Root, self.RootPart, Settings)
	particle.Position, particle.LastPosition = Bone.WorldPosition, Bone.WorldPosition
	particle.ParentIndex = ParentIndex
	particle.BoneLength = BoneLength
	particle.HeirarchyLength = 0
	if DEBUG == true then
		particle.DebugPart = Instance.new("Part")
		particle.DebugPart.Size = Vector3.new(.1,.1,.1)
		particle.DebugPart.Anchored = true
		particle.DebugPart.CanCollide = false
		particle.DebugPart.Color = Color3.fromRGB(255,0,0)
		-- CastShadow, CanTouch and CanQuery are all newer than this engine; they are
		-- tidiness on a debug marker, so a failure to set them must not stop the sim.
		pcall(function() particle.DebugPart.CastShadow = false end)
		pcall(function() particle.DebugPart.CanTouch = false end)
		pcall(function() particle.DebugPart.CanQuery = false end)
		particle.DebugPart.Parent = DEBUG_FOLDER
	end
	if ParentIndex >= 1 then
		BoneLength = (particleTree.Particles[ParentIndex].Bone.WorldPosition - particle.Position).Magnitude
		particle.BoneLength = BoneLength
		particle.Weight = (BoneLength * 0.7)
		particle.HeirarchyLength = Utilities.GetHierarchyLength(Bone, particleTree.Root)
	end

	if particle.HeirarchyLength <= Settings.AnchorDepth then
		particle.Anchored = true
	end

	table.insert(particleTree.Particles, particle)

	local index = #particleTree.Particles
	local boneChildren = Bone:GetChildren()

	local child

	for i = 1, #boneChildren do
		child = boneChildren[i]
		if child:IsA("Bone") then
			self:AppendParticles(particleTree, child, index, BoneLength)
		end
	end
end

function module:UpdateParameters(setting, value)
	if not self.Settings[setting] then return end
	-- if-expressions do not parse on this engine, so the same choice as a statement.
	if SettingsMath[setting] then
		self.Settings[setting] = SettingsMath[setting](value)
	else
		self.Settings[setting] = value
	end
end

function module:PreUpdate(particleTree: particleTree)

	local rootPart = particleTree.RootPart
	local root = particleTree.Root

	particleTree.ObjectMove = (rootPart.Position - particleTree.ObjectPreviousPosition)
	particleTree.ObjectPreviousPosition = rootPart.Position

	particleTree.RestGravity = root.CFrame:PointToWorldSpace(particleTree.LocalGravity)

	for _, particle in ipairs(particleTree.Particles) do
		particle.LastTransformOffset = particle.TransformOffset
		if particle.Bone == particle.Root then
			particle.TransformOffset = rootPart.CFrame * particle.RootTransform
		else
			particle.TransformOffset = root.WorldCFrame * particle.Transform
		end
		particle.LocalTransformOffset = root.CFrame * particle.LocalTransform
	end
end

function module:UpdateParticles(particleTree: particleTree, Delta: number, LoopIndex: number)
	local Settings = self.Settings

	local Damping = Settings.Damping
	local Force = Settings.Gravity
    if particleTree.RootPart:GetAttribute("SmartBoneUseGravity")==false then Force=ZERO end
    local ForceDirection = Force.Magnitude>1e-7 and Force.Unit or ZERO

	local ProjectedForce = ForceDirection * math.max(particleTree.RestGravity:Dot(ForceDirection), 0)

	Force -= ProjectedForce
	Force = (Force + Settings.Force) * (self.ObjectScale * Delta)

	local ObjectMove = LoopIndex == 0 and particleTree.ObjectMove or ZERO

	local windMove, velocity, move
	local timeModifier

	for _, particle in ipairs(particleTree.Particles) do
		if particle.ParentIndex >= 1 and particle.Anchored == false then
			windMove = ZERO

			if Settings.WindInfluence > 0 then
				timeModifier = particleTree.WindOffset
					+ (os.clock() - (particle.HeirarchyLength / 5))
					+ (
						((particle.TransformOffset.Position - particleTree.Root.WorldPosition).Magnitude / 5)
						* Settings.WindInfluence
					)
				windMove = Vector3.new(
					Settings.WindDirection.X
						+ (Settings.WindDirection.X * (math.sin(timeModifier * Settings.WindSpeed))),
					Settings.WindDirection.Y + (0.05 * (math.sin(timeModifier * Settings.WindSpeed))),
					Settings.WindDirection.Z
						+ (Settings.WindDirection.X * (math.sin(timeModifier * Settings.WindSpeed)))
				)

				windMove /= particle.BoneLength
				windMove *= Settings.WindInfluence
				windMove *= (Settings.WindStrength / 100) * (math.clamp(particle.HeirarchyLength, 1, 10) / 10)
				windMove *= particle.Weight
				self.WindPreviousPosition = windMove
			end

			velocity = (particle.Position - particle.LastPosition)
			move = (ObjectMove * Settings.Inertia)

			particle.LastPosition = particle.Position + move
			particle.Position += velocity * (1 - Damping) + Force + move + windMove
		else
			particle.LastPosition = particle.TransformOffset.Position--particle.Bone.WorldPosition
			particle.Position = particle.TransformOffset.Position
		end
	end
end

function module:CorrectParticles(particleTree: particleTree, Delta: number)
	local Settings = self.Settings
	local stiffness = Settings.Stiffness

	local parentPoint
	local restLength, difference, length
	local mat, restPosition, maxLength

	for _, point in ipairs(particleTree.Particles) do
		parentPoint = particleTree.Particles[point.ParentIndex]

		if parentPoint and point.ParentIndex >= 1 and point.Anchored == false then
			restLength = (parentPoint.TransformOffset.Position - point.TransformOffset.Position).Magnitude

			if stiffness > 0 or Settings.Elasticity > 0 then
				mat = CFrame.new(parentPoint.Position) * __rotOnly(parentPoint.TransformOffset)
				restPosition = (mat * CFrame.new(point.LocalTransformOffset.Position)).Position
                restPosition=transportCapeReference(particleTree,point,parentPoint,restPosition)

				difference = restPosition - point.Position
				point.Position += difference * (Settings.Elasticity * Delta)

				if stiffness > 0 then
					difference = restPosition - point.Position
					length = difference.Magnitude
					maxLength = restLength * (1 - stiffness) * 2
					if length > maxLength then
						point.Position += difference * ((length - maxLength) / length)
					end
				end
			end

			difference = parentPoint.Position - point.Position
			length = difference.Magnitude
			if length > 0 then
				point.Position += difference * ((length - restLength) / length)
			end
		end
	end
end

function module:SkipUpdateParticles(particleTree: particleTree)
	local parentPoint, restLength, stiffness
	local restPosition, difference, length, maxLength

	for _, point in ipairs(particleTree.Particles) do
		if point.ParentIndex >= 1 and not point.Anchored then
			point.LastPosition += particleTree.ObjectMove
			point.Position += particleTree.ObjectMove

			parentPoint = particleTree.Particles[point.ParentIndex]
			restLength = (parentPoint.TransformOffset.Position - point.TransformOffset.Position).Magnitude
			stiffness = self.Settings.Stiffness

			if stiffness > 0 then
				restPosition = parentPoint.Position
					+ CFrame.lookAt(parentPoint.Position, point.Position).LookVector.Unit
					* (parentPoint.Position - point.Position).Magnitude

				difference = restPosition - point.Position
				length = difference.Magnitude
				maxLength = restLength * (1 - stiffness) * 2
				if length > maxLength then
					point.Position += difference * ((length - maxLength) / length)
				end
			end

			difference = parentPoint.Position - point.Position
			length = difference.Magnitude
			if length > restLength then
				point.Position += difference * ((length - restLength) / length)
			end
		else
			point.LastPosition = point.TransformOffset.Position--point.Bone.WorldPosition
			point.Position = point.TransformOffset.Position
		end
	end
end

function module:CalculateTransforms(particleTree: particleTree, Delta: number)
	if self.InRange then
		local parentPoint, boneParent
		local localPosition, referenceCFrame, v0, v1, rotation, factor, alpha

		for _, point in ipairs(particleTree.Particles) do
			if point.ParentIndex >= 1 and point.Anchored == false then
				parentPoint = particleTree.Particles[point.ParentIndex]
				boneParent = parentPoint.Bone

				if parentPoint and boneParent and boneParent:IsA("Bone") and boneParent ~= particleTree.Root then
					localPosition = parentPoint.LocalTransformOffset.Position
					referenceCFrame = parentPoint.TransformOffset
					v0 = referenceCFrame:PointToObjectSpace(localPosition)
					v1 = point.Position - parentPoint.Position
					rotation = __rotOnly(Utilities.GetRotationBetween(referenceCFrame.UpVector, v1, v0))
						* __rotOnly(referenceCFrame)

					factor = 0.00001
					alpha = (1 - factor ^ Delta)

					parentPoint.CalculatedWorldCFrame = boneParent.WorldCFrame:Lerp(CFrame.new(parentPoint.Position) * rotation, alpha)
				end
			end
		end
	end
end

function module:TransformBones(particleTree: particleTree)
	local parentPoint, boneParent

	if self.InRange then
		for _, point in ipairs(particleTree.Particles) do
			if point.ParentIndex >= 1 and point.Anchored == false then
				parentPoint = particleTree.Particles[point.ParentIndex]
				boneParent = parentPoint.Bone

				if parentPoint and boneParent and boneParent:IsA("Bone") and boneParent ~= particleTree.Root then
					if parentPoint.Anchored and self.Settings.AnchorsRotate == false then
						boneParent.WorldCFrame = parentPoint.TransformOffset
					else
						boneParent.WorldCFrame = parentPoint.CalculatedWorldCFrame
					end
				end
			end
		end
	end
end

function module:DEBUG(particleTree: particleTree)
	for _, point in ipairs(particleTree.Particles) do
		if point then
			point.DebugPart.CFrame = CFrame.new(point.Position)
		end
	end
end

function module:RunLoop(particleTree: particleTree, Delta: number, UpdateRate: number)
	local ready = true
	local timeVar = Delta * 10

	if UpdateRate > 0 then
		local frameTime = 1 / UpdateRate
		self.Time += Delta
		ready = false

		if self.Time >= frameTime then
			ready = true
			self.Time = 0
		end
	end

	if ready then
		self:UpdateParticles(particleTree, timeVar, 0)
		self:CorrectParticles(particleTree, timeVar)
	else
		self:SkipUpdateParticles(particleTree)
	end
end

function module:ResetParticles(particleTree: particleTree)
	for _, point in ipairs(particleTree.Particles) do
		point.LastPosition = point.TransformOffset.Position
		point.Position = point.TransformOffset.Position
	end
end

function module:ResetTransforms(particleTree: particleTree)
	local transformOffset

	for _, point in ipairs(particleTree.Particles) do
		if point.Bone == point.Root then
			transformOffset = particleTree.RootPart.CFrame * point.RootTransform
		else
			transformOffset = particleTree.Root.WorldCFrame * point.Transform
		end

		point.Bone.WorldCFrame = transformOffset
	end
end

function module:UpdateBones(Delta: number, UpdateRate: number)
	for _, particleTree: particleTree in ipairs(self.ParticleTrees) do
		self:PreUpdate(particleTree, Delta)
		self:RunLoop(particleTree, Delta, UpdateRate)
		self:CalculateTransforms(particleTree, Delta)
	end
end

local applyMotionProfile=(function()
                                                                          
                                                                           
                                                                     
return function(controller, part)
    local source=part:IsA("MeshPart") and part.MeshId or part:GetAttribute("SmartBoneSourceMeshId")
    local id = type(source)=="string" and (source:match("[?&]id=(%d+)") or source:match("(%d+)$"))
    if id == "992000000000041" then
        controller.Settings.Inertia = 0.35
        controller.Settings.Damping = 0.36
    end
    return controller
end

end)()

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
    local controller = originalNew(part, roots)
    return applyMotionProfile(controller, part)
end
local constraints = (function()
                                                                            
                                                                         
                                                                                  
local Constraints = {}
local zero = Vector3.new(0, 0, 0)
function Constraints.limitAngle(position, origin, reference, degrees)
    assert(type(degrees) == "number" and degrees == degrees and degrees >= 0 and degrees <= 180, "Invalid angle limit")
    local delta = position - origin
    local length = delta.Magnitude
    if length < 1e-8 or reference.Magnitude < 1e-8 or degrees >= 180 then return position end
    local forward = reference.Unit
    local direction = delta / length
    local dot = math.clamp(forward:Dot(direction), -1, 1)
    local angle = math.rad(degrees)
    if dot >= math.cos(angle) then return position end
    local tangent = direction - forward * dot
    if tangent.Magnitude < 1e-8 then
        local axis = math.abs(forward.X) < 0.8 and Vector3.new(1,0,0) or Vector3.new(0,1,0)
        tangent = axis - forward * forward:Dot(axis)
    end
    return origin + (forward * math.cos(angle) + tangent.Unit * math.sin(angle)) * length
end
function Constraints.limitAxes(position, frame, minimum, maximum)
    assert(minimum.X <= maximum.X and minimum.Y <= maximum.Y and minimum.Z <= maximum.Z, "Invalid axis limits")
    local localPosition = frame:Inverse() * position
    return frame * Vector3.new(math.clamp(localPosition.X, minimum.X, maximum.X), math.clamp(localPosition.Y, minimum.Y, maximum.Y), math.clamp(localPosition.Z, minimum.Z, maximum.Z))
end
function Constraints.outsideSphere(position, center, radius, fallback)
    assert(type(radius) == "number" and radius == radius and radius >= 0 and radius < math.huge, "Invalid sphere radius")
    local delta = position - center
    if delta.Magnitude >= radius then return position end
    local direction = delta.Magnitude > 1e-8 and delta.Unit or (fallback or Vector3.new(0,1,0))
    if direction.Magnitude < 1e-8 then direction = Vector3.new(0,1,0) end
    return center + direction.Unit * radius
end
return Constraints

end)()
local installConstraints = (function()
                                                                                
                                                                              
return function(module, constraints)
    local correct = module.CorrectParticles
    function module:CorrectParticles(tree, dt)
        correct(self, tree, dt)
        for _, point in ipairs(tree.Particles) do
            local parent = tree.Particles[point.ParentIndex]
            if parent and not point.Anchored and point.Bone then
                local bone = point.Bone
                local angle = bone:GetAttribute("RotationLimit")
                if angle == nil then angle = tree.RootPart:GetAttribute("RotationLimit") end
                local minimum = bone:GetAttribute("AxisMinimum")
                local maximum = bone:GetAttribute("AxisMaximum")
                local position = point.Position
                if angle ~= nil then
                    local reference = point.TransformOffset.Position - parent.TransformOffset.Position
                    position = constraints.limitAngle(position, parent.Position, reference, angle)
                end
                if minimum ~= nil and maximum ~= nil then
                    position = constraints.limitAxes(position, tree.RootPart.CFrame, minimum, maximum)
                end
                                                                                    
                local center = tree.RootPart:GetAttribute("CollisionSphereCenter")
                local radius = tree.RootPart:GetAttribute("CollisionSphereRadius")
                if center ~= nil and radius ~= nil then
                    position = constraints.outsideSphere(position, tree.RootPart.CFrame * center, radius + (point.Radius or 0), point.TransformOffset.Position - tree.RootPart.CFrame * center)
                end
                if (position - point.Position).Magnitude > 1e-8 then
                                                                                        
                    point.LastPosition = position
                    point.Position = position
                end
            end
        end
    end
    return module
end

end)()
module = installConstraints(module, constraints)
return module
