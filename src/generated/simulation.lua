                                                                         
                                                                                 
local vectorMethods, vectorMeta = {}, {}
local function vec(x,y,z) return setmetatable({X=x or 0,Y=y or 0,Z=z or 0},vectorMeta) end
vectorMeta.__index=function(v,key)
    if key=='Magnitude' then return math.sqrt(v.X*v.X+v.Y*v.Y+v.Z*v.Z) end
    if key=='Unit' then local length=v.Magnitude;return length>1e-10 and v/length or vec() end
    return vectorMethods[key]
end
vectorMeta.__add=function(a,b) return vec(a.X+b.X,a.Y+b.Y,a.Z+b.Z) end
vectorMeta.__sub=function(a,b) return vec(a.X-b.X,a.Y-b.Y,a.Z-b.Z) end
vectorMeta.__unm=function(a) return vec(-a.X,-a.Y,-a.Z) end
vectorMeta.__mul=function(a,b) if type(a)=='number' then return b*a end;return vec(a.X*b,a.Y*b,a.Z*b) end
vectorMeta.__div=function(a,b) return vec(a.X/b,a.Y/b,a.Z/b) end
function vectorMethods:Dot(b) return self.X*b.X+self.Y*b.Y+self.Z*b.Z end
function vectorMethods:Cross(b) return vec(self.Y*b.Z-self.Z*b.Y,self.Z*b.X-self.X*b.Z,self.X*b.Y-self.Y*b.X) end
local Vector3={new=vec}
local identity={1,0,0,0,1,0,0,0,1}
local cfMethods,cfMeta={},{}
local function cf(position,matrix) return setmetatable({p=position or vec(),r=matrix or identity},cfMeta) end
                                                                          
                                                                            
cfMeta.__sub=function(c,v) return cf(c.p-v,c.r) end
local function rotate(r,v) return vec(r[1]*v.X+r[2]*v.Y+r[3]*v.Z,r[4]*v.X+r[5]*v.Y+r[6]*v.Z,r[7]*v.X+r[8]*v.Y+r[9]*v.Z) end
cfMeta.__index=function(c,key)
    if key=='Position' then return c.p elseif key=='Rotation' then return cf(vec(),c.r)
    elseif key=='UpVector' then return vec(c.r[2],c.r[5],c.r[8])
    elseif key=='RightVector' then return vec(c.r[1],c.r[4],c.r[7])
    elseif key=='LookVector' then return -vec(c.r[3],c.r[6],c.r[9]) end
    return cfMethods[key]
end
cfMeta.__add=function(c,v) return cf(c.p+v,c.r) end
cfMeta.__mul=function(a,b)
    if getmetatable(b)==vectorMeta then return a.p+rotate(a.r,b) end
    local r={}
    for row=0,2 do for col=0,2 do
        r[row*3+col+1]=a.r[row*3+1]*b.r[col+1]+a.r[row*3+2]*b.r[col+4]+a.r[row*3+3]*b.r[col+7]
    end end
    return cf(a*b.p,r)
end
function cfMethods:Inverse()
    local a=self.r;local r={a[1],a[4],a[7],a[2],a[5],a[8],a[3],a[6],a[9]}
    return cf(rotate(r,-self.p),r)
end
function cfMethods:ToObjectSpace(b) return self:Inverse()*b end
function cfMethods:PointToWorldSpace(v) return self*v end
function cfMethods:PointToObjectSpace(v) return self:Inverse()*v end
function cfMethods:VectorToObjectSpace(v) return rotate(self:Inverse().r,v) end
local function fromQuaternion(position,x,y,z,w)
    local n=math.sqrt(x*x+y*y+z*z+w*w)
    if n<1e-12 then return cf(position) end
    x,y,z,w=x/n,y/n,z/n,w/n
    return cf(position,{1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)})
end
local function quaternion(c)
    local m=c.r;local trace=m[1]+m[5]+m[9]
    if trace>0 then local s=math.sqrt(trace+1)*2;return {(m[8]-m[6])/s,(m[3]-m[7])/s,(m[4]-m[2])/s,s/4} end
    if m[1]>m[5] and m[1]>m[9] then local s=math.sqrt(1+m[1]-m[5]-m[9])*2;return {s/4,(m[2]+m[4])/s,(m[3]+m[7])/s,(m[8]-m[6])/s} end
    if m[5]>m[9] then local s=math.sqrt(1+m[5]-m[1]-m[9])*2;return {(m[2]+m[4])/s,s/4,(m[6]+m[8])/s,(m[3]-m[7])/s} end
    local s=math.sqrt(1+m[9]-m[1]-m[5])*2;return {(m[3]+m[7])/s,(m[6]+m[8])/s,s/4,(m[4]-m[2])/s}
end
function cfMethods:Lerp(b,alpha)
    local aQ,bQ=quaternion(self),quaternion(b);local dot=0
    for i=1,4 do dot+=aQ[i]*bQ[i] end
    if dot<0 then dot=-dot;for i=1,4 do bQ[i]=-bQ[i] end end
    local sA,sB=1-alpha,alpha
    if dot<0.9995 then local angle=math.acos(math.clamp(dot,-1,1));local sine=math.sin(angle);sA=math.sin((1-alpha)*angle)/sine;sB=math.sin(alpha*angle)/sine end
    return fromQuaternion(self.p+(b.p-self.p)*alpha,aQ[1]*sA+bQ[1]*sB,aQ[2]*sA+bQ[2]*sB,aQ[3]*sA+bQ[3]*sB,aQ[4]*sA+bQ[4]*sB)
end
local CFrame={}
function CFrame.new(x,y,z,qx,qy,qz,qw)
    if getmetatable(x)==vectorMeta then return cf(x) end
    local position=vec(x,y,z)
    return qx and fromQuaternion(position,qx,qy,qz,qw) or cf(position)
end
function CFrame.fromAxisAngle(axis,angle)
    axis=axis.Unit;local s=math.sin(angle/2)
    return fromQuaternion(vec(),axis.X*s,axis.Y*s,axis.Z*s,math.cos(angle/2))
end
function CFrame.Angles(x,y,z)
    return CFrame.fromAxisAngle(vec(1,0,0),x)*CFrame.fromAxisAngle(vec(0,1,0),y)*CFrame.fromAxisAngle(vec(0,0,1),z)
end
function CFrame.lookAt(position,target)
    local back=(position-target).Unit;local right=vec(0,1,0):Cross(back).Unit
    if right.Magnitude<1e-8 then right=vec(1,0,0) end
    local up=back:Cross(right)
    return cf(position,{right.X,up.X,back.X,right.Y,up.Y,back.Y,right.Z,up.Z,back.Z})
end
local function signal()
    return {Connect=function() return {Disconnect=function() end} end,Fire=function() end,Destroy=function() end}
end
local methods,instanceMeta={},{}
local function make(class)
    return setmetatable({ClassName=class,Name=class,_parent=nil,_cf=CFrame.new(),children={},attrs={},Transform=CFrame.new(),AttributeChanged=signal(),Size=vec(1,1,1)},instanceMeta)
end
instanceMeta.__index=function(o,key)
    if key=='Parent' then return o._parent elseif key=='CFrame' then return o._cf
    elseif key=='Position' then return o._cf.Position
    elseif key=='WorldCFrame' then return o.Parent and o.Parent.WorldCFrame*o._cf or o._cf
    elseif key=='WorldPosition' then return o.WorldCFrame.Position end
    return methods[key]
end
instanceMeta.__newindex=function(o,key,value)
    if key=='Parent' then
        if o._parent then for i,child in ipairs(o._parent.children) do if child==o then table.remove(o._parent.children,i);break end end end
        rawset(o,'_parent',value);if value then table.insert(value.children,o) end
    elseif key=='CFrame' then rawset(o,'_cf',value)
    elseif key=='WorldCFrame' then o.CFrame=o.Parent and o.Parent.WorldCFrame:Inverse()*value or value
    else rawset(o,key,value) end
end
function methods:IsA(class) return self.ClassName==class or class=='BasePart' and self.ClassName=='MeshPart' end
function methods:GetAttribute(name) return self.attrs[name] end
function methods:GetChildren() return table.clone(self.children) end
function methods:GetDescendants()
    local out={};for _,child in ipairs(self.children) do table.insert(out,child);for _,desc in ipairs(child:GetDescendants()) do table.insert(out,desc) end end;return out
end
function methods:Destroy() self.Parent=nil end
local Instance={new=function(class) if class=='BindableEvent' then return signal() end;return make(class) end}
local Random={new=function(seed)
    local n=seed%2147483647
    return {NextNumber=function(_,a,b) n=(n*48271)%2147483647;return a+(b-a)*n/2147483647 end,
            NextInteger=function(_,a,b) n=(n*48271)%2147483647;return math.floor(a+(b-a+1)*n/2147483647) end}
end}
local function typeof(value)
    if getmetatable(value)==vectorMeta then return 'Vector3' end
    if getmetatable(value)==cfMeta then return 'CFrame' end
    return type(value)
end
local services={Lighting={AttributeChanged=signal()},RunService={IsClient=function() return true end},CollectionService={GetTagged=function() return {} end}}
local game={GetService=function(_,name) return services[name] end}
local task={spawn=function(f,...) return f(...) end,wait=function() end}
local function wait() end
local function warn() end

local function loadSolver()
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
	local ForceDirection = Settings.Gravity.Unit

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

end
local solver=loadSolver()
local controller,part,bones,lastPosition
local function numbers(text)
    assert(type(text)=='string' and #text<10000)
    local out={};for token in string.gmatch(text,'[^,]+') do local n=tonumber(token);assert(n and n==n and math.abs(n)<10000);table.insert(out,n) end
    return out
end
local function initialize(positionsText,parentsText,rotationsText,stiffness,damping,sizeX,sizeY,sizeZ,x,y,z,yaw)
    if controller then controller:Destroy() end
    local positions,parents,rotations=numbers(positionsText),numbers(parentsText),numbers(rotationsText)
    assert(#parents>=3 and #parents<=26 and #positions==#parents*3 and #rotations==#parents*9)
    part=make('MeshPart');part.Size=vec(sizeX,sizeY,sizeZ)
                                                                                
                                                                                     
    part.CFrame=CFrame.new(x or 0,y or 0,z or 0)*CFrame.Angles(0,yaw or 0,0)
    part.attrs={Stiffness=math.clamp(stiffness,0,1),Damping=math.clamp(damping,0,1),WindInfluence=0,Inertia=0,UpdateRate=60}
    bones={}
    for i,parentIndex in ipairs(parents) do
        assert(parentIndex==-1 or parentIndex>=0 and parentIndex<i-1)
        local parent=parentIndex==-1 and part or bones[parentIndex+1]
        local bone=make('Bone');bone.Name=i==1 and 'RigidRoot' or i==2 and 'JiggleRoot' or 'Jiggle'..(i-2)
        bone.Parent=parent
        local world=vec(positions[(i-1)*3+1],positions[(i-1)*3+2],positions[(i-1)*3+3])
        local rotation={};for k=1,9 do rotation[k]=rotations[(i-1)*9+k] end
        bone.WorldCFrame=part.CFrame*cf(world,rotation)
        bones[i]=bone
    end
                                                                      
    local roots={}
    for i,parentIndex in ipairs(parents) do if parentIndex==0 then table.insert(roots,bones[i]) end end
    controller=solver.new(part,roots);controller.InRange=true
    for _,tree in ipairs(controller.ParticleTrees) do tree.ObjectPreviousPosition=part.Position end
    lastPosition=part.Position
    return #bones
end
local function step(dt,x,y,z,yaw)
    assert(controller and dt==dt and dt>0 and dt<=0.1)
    local position=vec(x,y,z)
    part.CFrame=CFrame.new(position)*CFrame.Angles(0,yaw,0)
    if (position-lastPosition).Magnitude>8 then
        for _,tree in ipairs(controller.ParticleTrees) do controller:PreUpdate(tree);controller:ResetParticles(tree) end
    end
    lastPosition=position
    controller:UpdateBones(dt,0)
    for _,tree in ipairs(controller.ParticleTrees) do controller:TransformBones(tree) end
    local result={}
    for _,bone in ipairs(bones) do
        local c=bone.CFrame
        table.insert(result,c.p.X);table.insert(result,c.p.Y);table.insert(result,c.p.Z)
        for _,n in ipairs(c.r) do table.insert(result,n) end
    end
    for i,n in ipairs(result) do assert(n==n and math.abs(n)<1e7,'Simulation became nonfinite');result[i]=string.format('%.9g',n) end
    return '['..table.concat(result,',')..']'
end
return {initialize=initialize,step=step}
