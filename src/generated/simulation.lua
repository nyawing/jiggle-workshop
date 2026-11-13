                                                                         
                                                                                 
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
vectorMeta.__mul=function(a,b) if type(a)=='number' then return b*a end;if getmetatable(b)==vectorMeta then return vec(a.X*b.X,a.Y*b.Y,a.Z*b.Z)end;return vec(a.X*b,a.Y*b,a.Z*b) end
vectorMeta.__div=function(a,b) if getmetatable(b)==vectorMeta then return vec(a.X/b.X,a.Y/b.Y,a.Z/b.Z)end;return vec(a.X/b,a.Y/b,a.Z/b) end
function vectorMethods:Dot(b) return self.X*b.X+self.Y*b.Y+self.Z*b.Z end
function vectorMethods:Cross(b) return vec(self.Y*b.Z-self.Z*b.Y,self.Z*b.X-self.X*b.Z,self.X*b.Y-self.Y*b.X) end
function vectorMethods:Lerp(b,t)return self+(b-self)*t end
function vectorMethods:Min(b)return vec(math.min(self.X,b.X),math.min(self.Y,b.Y),math.min(self.Z,b.Z))end
function vectorMethods:Max(b)return vec(math.max(self.X,b.X),math.max(self.Y,b.Y),math.max(self.Z,b.Z))end
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
function cfMethods:VectorToWorldSpace(v)return rotate(self.r,v)end
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
    local handlers={};local out={}
    function out:Connect(fn)local entry={fn=fn};handlers[entry]=true;return{Disconnect=function()handlers[entry]=nil end}end
    function out:Fire(...)for entry in pairs(handlers)do entry.fn(...)end end
    function out:Destroy()table.clear(handlers)end
    return out
end
local methods,instanceMeta={},{}
local function make(class)
    return setmetatable({ClassName=class,Name=class,MeshId='',_parent=nil,_cf=CFrame.new(),children={},attrs={},Transform=CFrame.new(),AttributeChanged=signal(),AncestryChanged=signal(),Size=vec(1,1,1)},instanceMeta)
end
instanceMeta.__index=function(o,key)
    if key=='Parent' then return o._parent elseif key=='CFrame' then return o._cf
    elseif key=='Position' then return o._cf.Position
    elseif key=='WorldCFrame' then return o.ClassName=='Bone' and o.Parent and o.Parent.WorldCFrame*o._cf or o._cf
    elseif key=='TransformedCFrame'then return o._cf*o.Transform
    elseif key=='TransformedWorldCFrame'then return o.ClassName=='Bone'and o.Parent and (o.Parent.ClassName=='Bone'and o.Parent.TransformedWorldCFrame or o.Parent.CFrame)*o.TransformedCFrame or o._cf
    elseif key=='WorldPosition' then return o.WorldCFrame.Position end
    return methods[key]
end
instanceMeta.__newindex=function(o,key,value)
    if key=='Parent' then
        if o._parent then for i,child in ipairs(o._parent.children) do if child==o then table.remove(o._parent.children,i);break end end end
        rawset(o,'_parent',value);if value then table.insert(value.children,o) end
        o.AncestryChanged:Fire(o,value)
    elseif key=='CFrame' then rawset(o,'_cf',value)
    elseif key=='WorldCFrame' then o.CFrame=o.Parent and o.Parent.WorldCFrame:Inverse()*value or value
    else rawset(o,key,value) end
end
function methods:IsA(class) return self.ClassName==class or class=='BasePart' and (self.ClassName=='MeshPart'or self.ClassName=='Part')or class=='Attachment'and self.ClassName=='Bone'end
function methods:GetAttribute(name) return self.attrs[name] end
function methods:SetAttribute(name,value)if self.attrs[name]~=value then self.attrs[name]=value;self.AttributeChanged:Fire(name)end end
function methods:GetAttributes()return table.clone(self.attrs)end
function methods:FindFirstChild(name,recursive)
    for _,child in ipairs(self.children)do if child.Name==name then return child end end
    if recursive then for _,child in ipairs(self.children)do local found=child:FindFirstChild(name,true);if found then return found end end end
end
function methods:FindFirstChildWhichIsA(class,recursive)
    for _,child in ipairs(self.children)do if child:IsA(class)then return child end end
    if recursive then for _,child in ipairs(self.children)do local found=child:FindFirstChildWhichIsA(class,true);if found then return found end end end
end
function methods:GetFullName()return self.Parent and self.Parent:GetFullName()..'.'..self.Name or self.Name end
function methods:IsDescendantOf(ancestor)local p=self.Parent;while p do if p==ancestor then return true end;p=p.Parent end;return false end
function methods:Clone()
    local copy=make(self.ClassName)
    for key,value in pairs(self)do if key~='children'and key~='_parent'and key~='attrs'and key~='AttributeChanged'and key~='AncestryChanged'then copy[key]=value end end
    copy.attrs=table.clone(self.attrs)
    for _,child in ipairs(self.children)do child:Clone().Parent=copy end
    return copy
end
function methods:GetChildren() return table.clone(self.children) end
function methods:GetDescendants()
    local out={};for _,child in ipairs(self.children) do table.insert(out,child);for _,desc in ipairs(child:GetDescendants()) do table.insert(out,desc) end end;return out
end
function methods:Destroy()for _,child in ipairs(self:GetChildren())do child:Destroy()end;self.Parent=nil;self.AttributeChanged:Destroy();self.AncestryChanged:Destroy()end
local Instance={new=function(class) if class=='BindableEvent' then return signal() end;return make(class) end}
local Random={new=function(seed)
    local n=seed%2147483647
    return {NextNumber=function(_,a,b) n=(n*48271)%2147483647;return a+(b-a)*n/2147483647 end,
            NextInteger=function(_,a,b) n=(n*48271)%2147483647;return math.floor(a+(b-a+1)*n/2147483647) end}
end}
local function typeof(value)
    if getmetatable(value)==vectorMeta then return 'Vector3' end
    if getmetatable(value)==cfMeta then return 'CFrame' end
    if type(value)=='table'and value.__type then return value.__type end
    return type(value)
end
local NumberRange={new=function(a,b)return{Min=a,Max=b or a,__type='NumberRange'}end}
local services={Lighting=make('Lighting'),RunService={IsClient=function() return true end},CollectionService={GetTagged=function() return {} end,GetInstanceRemovedSignal=function()return signal()end,RemoveTag=function()end}}
local game=make('DataModel')
function game:GetService(name)return services[name]end
local guid=0;services.HttpService={GenerateGUID=function()guid=guid+1;return 'workshop-'..guid end}
local workspace=make('Workspace');workspace.Parent=game;workspace.CurrentCamera={CFrame=CFrame.new(),ViewportSize={X=0,Y=0}}
local task={spawn=function(f,...) return f(...) end,wait=function() end}
local function wait() end
local function warn() end

local function loadLegacySolver()
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

end
local function loadSynchronizedV1()
local function loadLegacyV1()
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
local applyContactVelocity=(function()
                                                                         
                                                                            
                                                                  
return function(point, parent, restPosition)
    local normal=point.Position-restPosition
    if normal.Magnitude<=1e-8 then return end
    normal=normal.Unit
    local relative=(point.Position-point.LastPosition)-(parent.Position-parent.LastPosition)
    point.LastPosition=point.LastPosition+normal*relative:Dot(normal)
end

end)()
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
            local contactHit=false

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
                        contactHit=true
						point.Position += difference * ((length - maxLength) / length)
					end
				end
			end

			difference = parentPoint.Position - point.Position
			length = difference.Magnitude
			if length > 0 then
				point.Position += difference * ((length - restLength) / length)
			end
            if contactHit then applyContactVelocity(point,parentPoint,restPosition) end
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

end
local sampled=(function()
                                                                             
                                                                            
                                                                                  
return function(loadNative)
    local module={}
    function module.new(part,roots)
                                                                             
                                                                           
                                                                          
        local copied=part:Clone()
        assert(copied,"SmartBone source is not cloneable")
        local proxy=Instance.new("Part")
        proxy.Size=part.Size;proxy.CFrame=part.CFrame
        proxy.Material=part.Material;proxy.CustomPhysicalProperties=part.CustomPhysicalProperties
        for name,value in pairs(part:GetAttributes())do proxy:SetAttribute(name,value)end
        if part:IsA("MeshPart")then proxy:SetAttribute("SmartBoneSourceMeshId",part.MeshId)end
        for _,child in ipairs(copied:GetChildren())do child.Parent=proxy end
        copied:Destroy()
        proxy.Name="SampledRootProxy";proxy.Archivable=false;proxy.Anchored=true
        proxy:SetAttribute("SmartBoneInternalProxy",true)
        proxy.Transparency=1;proxy.CanCollide=false;proxy.CastShadow=false
        pcall(function()proxy.CanTouch=false end)
        pcall(function()proxy.CanQuery=false end)
        local pairsByBone,mapping={},{}
        local function match(a,b)
            if a:IsA("Bone")then mapping[a]=b;pairsByBone[#pairsByBone+1]={real=a,proxy=b}end
                                                                               
                                                                       
            local children,used=b:GetChildren(),{}
            for _,child in ipairs(a:GetChildren())do
                local copy
                for _,candidate in ipairs(children)do
                    if not used[candidate]and candidate.ClassName==child.ClassName and candidate.Name==child.Name then copy=candidate;used[candidate]=true;break end
                end
                                                                              
                                                                              
                if child:IsA("Bone")or child:FindFirstChildWhichIsA("Bone",true)then
                    assert(copy,"Proxy bone hierarchy mismatch: "..child:GetFullName())
                end
                if copy then match(child,copy)end
            end
        end
        match(part,proxy)
        for _,pair in ipairs(pairsByBone)do
            pair.owned=false
            for _,root in ipairs(roots)do
                if pair.real==root or pair.real:IsDescendantOf(root)then pair.owned=true;break end
            end
        end
        for _,object in ipairs(proxy:GetDescendants())do
            if object:IsA("LuaSourceContainer")or object:IsA("JointInstance")or object:IsA("WeldConstraint")or object:IsA("Constraint")then object:Destroy()
            elseif object:IsA("ParticleEmitter")or object:IsA("Trail")or object:IsA("Beam")then object.Enabled=false end
        end
        local collection=game:GetService("CollectionService")
        for _,object in ipairs(proxy:GetDescendants())do collection:RemoveTag(object,"SmartBone");collection:RemoveTag(object,"SmartCollider")end
        collection:RemoveTag(proxy,"SmartBone");collection:RemoveTag(proxy,"SmartCollider")
        proxy.CFrame=part.CFrame;proxy.Parent=part.Parent
        local nativeRoots={};for _,bone in ipairs(roots)do nativeRoots[#nativeRoots+1]=assert(mapping[bone],"Missing proxy root")end
        local ok,native=pcall(function()return loadNative().new(proxy,nativeRoots)end)
        if not ok then proxy:Destroy();error(native)end
        local step,accumulated,previousInput=1/60,0,part.CFrame
        local previousAnimation,previousOutput,currentOutput,restFrames={},{},{},{}
        for _,pair in ipairs(pairsByBone)do
            previousAnimation[pair.real]=pair.real.Transform
            restFrames[pair.real]=pair.proxy.CFrame
            previousOutput[pair.real]=pair.proxy.CFrame;currentOutput[pair.real]=pair.proxy.CFrame
        end
        local controller={Settings=native.Settings,ParticleTrees=native.ParticleTrees,SupportsAnimatedBones=true,StepOnHeartbeat=true,OwnsInputReset=true}
                                                                              
                                                                           
        function controller:UpdateParameters(...)
            return native:UpdateParameters(...)
        end
        local changed=part.AttributeChanged:Connect(function(name)proxy:SetAttribute(name,part:GetAttribute(name))end)
        local removed=false
        local function reset(input)
            accumulated=0;proxy.CFrame=input;previousInput=input
                                                                              
                                                                        
            for _,pair in ipairs(pairsByBone)do
                pair.proxy.CFrame=restFrames[pair.real]
                pair.proxy.Transform=pair.real.Transform
            end
            for _,tree in ipairs(native.ParticleTrees)do
                native:PreUpdate(tree)
                for _,point in ipairs(tree.Bones)do
                    point.CalculatedWorldCFrame=point.AnimatedWorldCFrame
                    point.IsSkippingUpdates=false
                end
                native:ResetParticles(tree)
                for _,point in ipairs(tree.Bones)do point.LastPosition=point.Position end
                tree.ObjectPreviousPosition=input.Position
                tree.ObjectVelocity=Vector3.new();tree.ObjectAcceleration=Vector3.new();tree.AccumulatedDelta=0
            end
            for _,pair in ipairs(pairsByBone)do
                previousAnimation[pair.real]=pair.real.Transform
                previousOutput[pair.real]=pair.proxy.CFrame;currentOutput[pair.real]=pair.proxy.CFrame
            end
        end
        function controller:Present()
            if removed then return end
            local alpha=math.clamp(accumulated/step,0,1)
            for _,pair in ipairs(pairsByBone)do
                if pair.owned and pair.real.Parent then pair.real.CFrame=previousOutput[pair.real]:Lerp(currentOutput[pair.real],alpha)end
            end
        end
        function controller:UpdateBones(dt)
            if removed or not part.Parent then return end
            if type(dt)~="number"or dt~=dt or dt<=0 then return end
            local input=part.CFrame
            if dt>.1 or(input.Position-previousInput.Position).Magnitude>8 then reset(input);self:Present();return end
            local animation={};for _,pair in ipairs(pairsByBone)do animation[pair.real]=pair.real.Transform end
            local untilTick=step-accumulated
            accumulated=accumulated+dt
            while accumulated>=step-1e-10 do
                local t=math.clamp(untilTick/dt,0,1)
                proxy.CFrame=previousInput:Lerp(input,t)
                for _,pair in ipairs(pairsByBone)do pair.proxy.Transform=previousAnimation[pair.real]:Lerp(animation[pair.real],t)end
                native:UpdateBones(step)
                for _,pair in ipairs(pairsByBone)do
                    previousOutput[pair.real]=currentOutput[pair.real];currentOutput[pair.real]=pair.proxy.CFrame
                end
                accumulated=accumulated-step;untilTick=untilTick+step
            end
            previousInput=input;previousAnimation=animation
            self:Present()
        end
        function controller:TransformBones()end
        function controller:PreUpdate()reset(part.CFrame)end
        function controller:ResetParticles()end
        function controller:Destroy()
            if removed then return end;removed=true;changed:Disconnect();native:Destroy();proxy:Destroy()
        end
        return controller
    end
    return module
end

end)()
local adaptV1=(function()
                                                                               
                                                                            
return function(loadLegacy, sampled)
    local adapter={}
    function adapter.new(part, roots)
        local legacy=loadLegacy().new(part,roots)
        legacy.InRange=true
        for _,tree in ipairs(legacy.ParticleTrees)do tree.Bones=tree.Particles end
        local controller={Settings=legacy.Settings,ParticleTrees=legacy.ParticleTrees}
        function controller:UpdateParameters(...)return legacy:UpdateParameters(...)end
        function controller:UpdateBones(dt)
            legacy:UpdateBones(dt,0)
            for _,tree in ipairs(legacy.ParticleTrees)do legacy:TransformBones(tree)end
        end
        function controller:PreUpdate(tree)
            legacy:PreUpdate(tree)
            for _,point in ipairs(tree.Particles)do point.AnimatedWorldCFrame=point.TransformOffset end
        end
        function controller:ResetParticles(tree)
            tree.RibbonTime=0
            legacy:ResetParticles(tree)
            for _,point in ipairs(tree.Particles)do
                point.CalculatedWorldCFrame=point.TransformOffset
                point.CalculatedWorldPosition=point.TransformOffset.Position
            end
            legacy:TransformBones(tree)
        end
        function controller:Destroy()legacy:Destroy()end
        return controller
    end
    return sampled(function()return adapter end)
end

end)()
local installWind=(function()
                                                                          
                                                                               
return function(solver)
    local new,update=solver.new,solver.UpdateParticles
    function solver.new(part,roots)
        local controller=new(part,roots)
        controller.RibbonSource=part
        return controller
    end
    function solver:UpdateParticles(tree,delta,index)
        local selection=self.RibbonSource:GetAttribute('SmartBoneWindBones')
        local selected=type(selection)=='string'
        local enabled=selected or self.RibbonSource:GetAttribute('SmartBoneWindAnimation')==true
        local influence=self.Settings.WindInfluence
        if enabled and not selected then self.Settings.WindInfluence=0 end
        update(self,tree,delta,index)
        self.Settings.WindInfluence=influence
        if not enabled then tree.RibbonTime=0;return end
                                                                            
                                                                              
        tree.RibbonTime=(tree.RibbonTime or 0)+delta/10
        local t=tree.RibbonTime
        local frame=self.RibbonSource.CFrame
        local direction=self.RibbonSource:GetAttribute('SmartBoneWindDirection')or 'mixed'
        local directions={}
        if selected then
            for name,mode in selection:gmatch('([%w_]+):([%a]+)')do directions[name]=mode end
        end
        local gust=.75+.25*math.sin(t*.73)
        for _,point in ipairs(tree.Particles)do
            local localDirection=selected and point.Bone and directions[point.Bone.Name] or nil
            if point.ParentIndex>=1 and not point.Anchored and (not selected or localDirection) then
                local direction=localDirection or direction
                local depth=math.max(point.HeirarchyLength,1)
                local phase=t*2.1-depth*.65
                local envelope=math.min(depth/6,1)
                local length=math.min(math.max(point.BoneLength,.01),1)
                local wave=frame.RightVector*math.sin(phase)
                    +frame.LookVector*(.32*math.sin(phase*.83+.8))
                if direction=='horizontal'then wave=frame.RightVector*math.sin(phase)
                elseif direction=='vertical'then wave=frame.UpVector*math.sin(phase)
                elseif direction=='depth'then wave=frame.LookVector*math.sin(phase)end
                point.Position+=wave*(length*.018*envelope*gust)
            end
        end
    end
    return solver
end



end)()
return adaptV1(function() return installWind(loadLegacyV1()) end,sampled)

end
local function loadNativeSolver()
--[[
MIT License

Copyright (c) 2024 SmartBone

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

]]
local shared = {FrameCounter = 0}
local debug = {profilebegin = debug and debug.profilebegin or function() end, profileend = debug and debug.profileend or function() end}
local function __sb2Freeze(v) return v end
local __sb2HasGlobalWind
local function __sb2WorkspaceWind()
 if __sb2HasGlobalWind == nil then
  __sb2HasGlobalWind = pcall(function() return workspace.GlobalWind end)
 end
 if __sb2HasGlobalWind then return workspace.GlobalWind end
                                                                            
                                                                
 local lighting=game:GetService("Lighting")
 local direction,speed=lighting:GetAttribute("WindDirection"),lighting:GetAttribute("WindSpeed")
 if typeof(direction)=="Vector3" and type(speed)=="number" and speed==speed then
  return direction*speed
 end
 return Vector3.new(0,0,0)
end
local function __sb2Min(a,b) return Vector3.new(math.min(a.X,b.X),math.min(a.Y,b.Y),math.min(a.Z,b.Z)) end
local function __sb2Max(a,b) return Vector3.new(math.max(a.X,b.X),math.max(a.Y,b.Y),math.max(a.Z,b.Z)) end
local __sb2HasCurrentProperties
local function __sb2PhysicalProperties(object)
 if __sb2HasCurrentProperties == nil then
  __sb2HasCurrentProperties = pcall(function() return object.CurrentPhysicalProperties end)
 end
 if __sb2HasCurrentProperties then return object.CurrentPhysicalProperties end
 return object.CustomPhysicalProperties or PhysicalProperties.new(object.Material)
end
local nodes, loaders, cache = {}, {}, {}
local function node(path)
 if nodes[path] then return nodes[path] end
 local p = {Name = path:match("([^/]+)$") or "SmartBone2"}
 nodes[path] = p
 function p:WaitForChild(name) assert(self[name], "Missing bundled module: "..name); return self[name] end
 if path ~= "" then
  local parent = path:match("^(.*)/[^/]+$") or ""
  p.Parent = node(parent); p.Parent[p.Name] = p
 end
 return p
end
local root=node("")
local function require(module)
 if cache[module] then return cache[module] end
 assert(loaders[module], "Cannot require asset code in SmartBone2")
 local result=loaders[module](module,require);cache[module]=result;return result
end
local empty=setmetatable({}, {__index=function()return function()end end})

node("")
node("Components/Bone")
node("Components/BoneTree")
node("Dependencies/Config")
node("Dependencies/DefaultObjectSettings")
node("Dependencies/Frustum")
node("Dependencies/Utilities")
node("Components/Collision/Collider")
node("Components/Collision/ColliderObject")
node("Components/Constraints/AxisConstraint")
node("Components/Constraints/CollisionConstraint")
node("Components/Constraints/DistanceConstraint")
node("Components/Constraints/FrictionConstraint")
node("Components/Constraints/RopeConstraint")
node("Components/Constraints/RotationConstraint")
node("Components/Constraints/SpringConstraint")
node("Components/Collision/Colliders/Box")
node("Components/Collision/Colliders/Capsule")
node("Components/Collision/Colliders/Cylinder")
node("Components/Collision/Colliders/Sphere")
node("Components/Collision/Colliders/Triangle")
loaders[node("Dependencies/Debug/Gizmo")] = function() return empty end
loaders[node("Dependencies/Debug/ImOverlay")] = function() return empty end
loaders[node("Dependencies/Runtime")] = function() return empty end
loaders[node("")] = function(script, require)
--!nocheck

local CollectionService = game:GetService("CollectionService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Components = script:WaitForChild("Components")
local Dependencies = script:WaitForChild("Dependencies")

local CeiveImOverlay = require(Dependencies:WaitForChild("Debug"):WaitForChild("ImOverlay"))
local Config = require(Dependencies:WaitForChild("Config"))
local Frustum = require(Dependencies:WaitForChild("Frustum"))
local Utilities = require(Dependencies:WaitForChild("Utilities"))
local ImOverlay

local BoneClass = require(Components:WaitForChild("Bone"))
local BoneTreeClass = require(Components:WaitForChild("BoneTree"))
local ColliderObjectClass = require(Components:WaitForChild("Collision"):WaitForChild("ColliderObject"))

local ActorRuntime = Dependencies:WaitForChild("Runtime")

local function CopyPasteAttributes(Object1: BasePart, Object2: BasePart)
	for k, v in pairs(Object1:GetAttributes()) do
		Object2:SetAttribute(k, v)
	end
end














local SB_INDENT_LOG = Utilities.SB_INDENT_LOG
local SB_UNINDENT_LOG = Utilities.SB_UNINDENT_LOG
-- local SB_ASSERT_CB = Utilities.SB_ASSERT_CB
local SB_VERBOSE_LOG = Utilities.SB_VERBOSE_LOG
local SB_VERBOSE_WARN = Utilities.SB_VERBOSE_WARN
-- local SB_VERBOSE_ERROR = Utilities.SB_VERBOSE_ERROR

--- @class SmartBone
--- Root for all SmartBone objects.

--- @within SmartBone
--- @readonly
--- @prop ID string
--- Unique ID of the root object

--- @within SmartBone
--- @prop BoneTrees table
--- Table of all bone trees under this root

--- @within SmartBone
--- @prop ColliderObjects table
--- Table of all colliders assigned to this root

--- @within SmartBone
--- @prop ShouldDestroy boolean
--- True if the root has no bonetrees, this is already handled by the runtime

local Class = {}
Class.__index = Class

--- @within SmartBone
--- @return SmartBone
function Class.new()
	local self = setmetatable({
		ID = HttpService:GenerateGUID(false),
		BoneTrees = {},
		ColliderObjects = {},
		ShouldDestroy = false,
	}, Class)

	return self
end

-- Private Functions

--- @private
--- @within SmartBone
--- @param BoneTree table
--- @param BoneObject Bone
--- @param ParentIndex number
--- @param HeirarchyLength number
--- : Caution:
--- Private Functions can change syntax at any time without warning. Only use these if you're prepared to fix any issues that arise.
--- :::
--- Used to add a bone to the provided bone tree
function Class:m_AppendBone(BoneTree: IBoneTree, BoneObject: Bone, ParentIndex: number, HeirarchyLength: number)
	local Settings = Utilities.GatherBoneSettings(BoneObject)
	local Bone: IBone = BoneClass.new(BoneObject, BoneTree.Root, BoneTree.RootPart)

	for k, v in pairs(Settings) do
		-- "В¬" represents a nil value, this is done so we can delete attributes at runtime.
		Bone[k] = (v ~= "В¬") and v or nil
	end

	local ParentBone = BoneTree.Bones[ParentIndex]

	if ParentIndex > 0 then
		local BoneLength = (ParentBone.Position - Bone.Position).Magnitude
		Bone.FreeLength = BoneLength
		Bone.Weight = BoneLength * 0.7 -- Why 0.7?
		Bone.HeirarchyLength = HeirarchyLength

		ParentBone.HasChild = true
		--ParentBone.NumberOfChildren += 1
	end

	if HeirarchyLength <= BoneTree.Settings.AnchorDepth then
		SB_VERBOSE_LOG("Anchoring bone")
		Bone.Anchored = true
	end

	Bone.ParentIndex = ParentIndex

	table.insert(BoneTree.Bones, Bone)
end

--- @private
--- @within SmartBone
--- @param RootPart BasePart
--- @param RootBone Bone
--- : Caution:
--- Private Functions can change syntax at any time without warning. Only use these if you're prepared to fix any issues that arise.
--- :::
--- Creates a bone tree from the RootPart and RootBone and then adds all child bones via m_AppendBone
function Class:m_CreateBoneTree(RootPart: BasePart, RootBone: Bone)
	local BoneTree = BoneTreeClass.new(RootBone, RootPart, Utilities.GatherObjectSettings(RootPart))

	SB_VERBOSE_LOG("Creating bone tree " .. tostring(RootPart.Name) .. "; " .. tostring(RootBone.Name))
	SB_INDENT_LOG()

	local function AddChildren(Bone, ParentIndex, HeirarchyLength)
		SB_VERBOSE_LOG("Adding bone: " .. tostring(Bone.Name) .. "; " .. tostring(ParentIndex) .. "; " .. tostring(HeirarchyLength))
		SB_INDENT_LOG()
		local Children = Bone:GetChildren()
		local HasBoneChild = false

		for _, Child in pairs(Children) do
			if Child:IsA("Bone") then
				self:m_AppendBone(BoneTree, Child, ParentIndex, HeirarchyLength)

				AddChildren(Child, #BoneTree.Bones, HeirarchyLength + 1)
				HasBoneChild = true
			end
		end

		if string.sub(Bone.Name, #Bone.Name - 3, #Bone.Name) == "_end" or string.sub(Bone.Name, #Bone.Name - 4, #Bone.Name) == "_Tail" then
			HasBoneChild = true
		end

		if not HasBoneChild then -- Add tail bone for transform calculations
			SB_VERBOSE_LOG("Adding tail bone")
			local Parent = Bone.Parent
			local ParentWorldPosition = Parent:IsA("Bone") and Parent.WorldPosition or Parent.Position

			local Start = Bone.WorldCFrame + (Bone.WorldCFrame.UpVector.Unit * (Bone.WorldPosition - ParentWorldPosition).Magnitude)
			local tailBone = Instance.new("Bone")
			tailBone.Parent = Bone
			tailBone.Name = Bone.Name .. "_Tail"
			tailBone.WorldCFrame = Start

			CopyPasteAttributes(Bone, tailBone)

			self:m_AppendBone(BoneTree, tailBone, #BoneTree.Bones, HeirarchyLength)
		end

		SB_UNINDENT_LOG()
	end

	self:m_AppendBone(BoneTree, RootBone, 0, 0)

	AddChildren(RootBone, 1, 1)

	table.insert(self.BoneTrees, BoneTree)

	SB_UNINDENT_LOG()
end

--- @private
--- @within SmartBone
--- : Caution:
--- Private Functions can change syntax at any time without warning. Only use these if you're prepared to fix any issues that arise.
--- :::
--- Updates the view frustum used for optimization
function Class:m_UpdateViewFrustum()
	-- Should we do frustum checks this frame, depends on config setting
	if shared.FrameCounter % Config.FRUSTUM_FREQ ~= 0 then
		return
	end

	debug.profilebegin("SmartBone2")
	local a, b, c, d, e, f, g, h, i = Frustum.GetCFrames(workspace.CurrentCamera, Config.FAR_PLANE) -- Hard coded stud limit on any object

	for _, BoneTree in pairs(self.BoneTrees) do
		debug.profilebegin("BoneTree")
		local FakeObject = {
			CFrame = BoneTree.BoundingBoxCFrame,
			Size = BoneTree.BoundingBoxSize,
		}
		BoneTree.InView = Frustum.ObjectInFrustum(FakeObject, a, b, c, d, e, f, g, h, i)
		debug.profileend()
	end
	debug.profileend()
end

function Class:m_CleanColliders()
	debug.profilebegin("Clean Colliders")
	local DidDestroy = false

	if #self.ColliderObjects ~= 0 then -- Micro optimizations
		for i, ColliderObject in pairs(self.ColliderObjects) do
			if #ColliderObject.Colliders == 0 or ColliderObject.Destroyed == true then
				SB_VERBOSE_WARN("Deleting Collider Object")
				SB_INDENT_LOG()
				ColliderObject:Destroy()
				SB_UNINDENT_LOG()
				table.remove(self.ColliderObjects, i)

				DidDestroy = true
			end
		end
	end

	if not DidDestroy then -- Prevent warning because we left parallel
		debug.profileend()
	end
end

--- @private
--- @within SmartBone
--- @param BoneTree table
--- @param Index number
--- @param Delta number
--- : Caution:
--- Private Functions can change syntax at any time without warning. Only use these if you're prepared to fix any issues that arise.
--- :::
--- Updates the provided bone tree with all optimizations
function Class:m_UpdateBoneTree(BoneTree: IBoneTree, Index: number, Delta: number)
	debug.profilebegin("SmartBone2")

	if BoneTree.Destroyed then
		BoneTree:Destroy()
		table.remove(self.BoneTrees, Index)

		return
	end

	BoneTree:PreUpdate(Delta) -- Pre update MUST be called before we call SkipUpdate!

	if not BoneTree.InView or math.floor(BoneTree.UpdateRate) == 0 or not BoneTree.InWorkspace then
		local AlreadySkipped = BoneTree.IsSkippingUpdates

		BoneTree:SkipUpdate()

		if not AlreadySkipped then
			debug.profileend()

			
			BoneTree:ApplyTransform()

			SB_VERBOSE_LOG(
				"Skipping BoneTree, InView: " .. tostring(BoneTree.InView) .. ", Update Rate == 0: " .. tostring(math.floor(BoneTree.UpdateRate) == 0) .. ", InWorkspace: " .. tostring(BoneTree.InWorkspace)
			)
		end

		return
	end

	debug.profilebegin("Step Colliders")
	for _, ColliderObject in pairs(self.ColliderObjects) do
		ColliderObject:Step()
	end
	debug.profileend()

	local UpdateHz = 1 / BoneTree.UpdateRate
	local DidUpdate = false

	BoneTree.AccumulatedDelta += Delta
	while BoneTree.AccumulatedDelta > UpdateHz do
		BoneTree.AccumulatedDelta -= UpdateHz

		DidUpdate = true

		BoneTree:StepPhysics(UpdateHz)
		BoneTree:Constrain(self.ColliderObjects, UpdateHz)
		BoneTree:SolveTransform(UpdateHz)
	end
	debug.profileend()

	if DidUpdate then
		
		BoneTree:ApplyTransform()
	end
end

--- @private
--- @within SmartBone
--- @return boolean
--- : Caution:
--- Private Functions can change syntax at any time without warning. Only use these if you're prepared to fix any issues that arise.
--- :::
--- Returns true if the root should be destroyed
function Class:m_CheckDestroy()
	self.ShouldDestroy = false

	if #self.BoneTrees == 0 then
		self.ShouldDestroy = true
		return true
	end

	return false
end

-- Public Functions

--- @within SmartBone
--- @param Object BasePart
--- Loads the provided object
function Class:LoadObject(Object: BasePart)
	local RootAttribute = Object:GetAttribute("Roots")

	if not RootAttribute then
		warn("[SmartBone2] Cannot load an object with no roots defined " .. tostring(Object.Name))
		return
	end

	local RootNames = RootAttribute:split(",")
	local Bones = {}

	-- Gather bones into table indexed with name
	for _, Descendant in pairs(Object:QueryDescendants("Bone")) do
		if Bones[Descendant.Name] then
			warn("[SmartBone2] Duplicate bones of name: " .. tostring(Descendant.Name) .. " in RootPart: " .. tostring(Object.Name))
			continue
		end

		Bones[Descendant.Name] = Descendant
	end

	-- Create bone trees
	for _, Name in pairs(RootNames) do
		local RootBone = Bones[Name]
		if not RootBone then
			warn("[SmartBone2] Couldn't find Root Bone of name: " .. tostring(Name) .. " in RootPart: " .. tostring(Object.Name))
			continue
		end

		self:m_CreateBoneTree(Object, RootBone)
	end
end

--- @within SmartBone
--- @param ColliderModule ModuleScript
--- @param Object BasePart
--- Loads the provided collider module onto the provided object
function Class:LoadColliderModule(ColliderModule: ModuleScript, Object: BasePart)
	assert(ColliderModule, "[SmartBone2] No collider module passed in")

	local RawColliderData = require(ColliderModule)
	local ColliderData = HttpService:JSONDecode(RawColliderData)

	local ColliderObject = ColliderObjectClass.new(ColliderData, Object)

	table.insert(self.ColliderObjects, ColliderObject)
end

--- @within SmartBone
--- @param ColliderData table
--- @param Object BasePart
--- Loads the raw collider data onto the provided object
function Class:LoadRawCollider(ColliderData: IColliderTable, Object: BasePart)
	local ColliderObject = ColliderObjectClass.new(ColliderData, Object)

	table.insert(self.ColliderObjects, ColliderObject)
end

--- @within SmartBone
--- Resets all bone trees to their rest position
function Class:SkipUpdate()
	debug.profilebegin("SmartBone2")
	for _, BoneTree in pairs(self.BoneTrees) do
		BoneTree:SkipUpdate()
	end
	debug.profileend()
end

--- @within SmartBone
--- @param Delta number
--- Updates all bone trees
function Class:StepBoneTrees(Delta: number)
	if self:m_CheckDestroy() then
		return
	end

	if Delta <= 0 then
		SB_VERBOSE_WARN("DeltaTime is zero or sub zero, not updating.")
		return
	end

	self:m_CleanColliders()
	self:m_UpdateViewFrustum()
	for i, BoneTree in pairs(self.BoneTrees) do
		self:m_UpdateBoneTree(BoneTree, i, Delta)
	end
end

--- @client
--- @within SmartBone
--- @param DRAW_COLLIDERS boolean
--- @param DRAW_CONTACTS boolean
--- @param DRAW_PHYSICAL_BONE boolean
--- @param DRAW_BONE boolean
--- @param DRAW_AXIS_LIMITS boolean
--- @param DRAW_ROOT_PART boolean
--- @param DRAW_FILL_COLLIDERS boolean
--- @param DRAW_COLLIDER_INFLUENCE boolean
--- @param DRAW_COLLIDER_AWAKE boolean
--- @param DRAW_COLLIDER_BROADPHASE boolean
--- @param DRAW_BOUNDING_BOX boolean
--- @param DRAW_ROTATION_LIMITS boolean
--- @param DRAW_ACCELERATION_INFO boolean
--- Draws the debug gizmos
function Class:DrawDebug(
	DRAW_COLLIDERS: bool,
	DRAW_CONTACTS: bool,
	DRAW_PHYSICAL_BONE: bool,
	DRAW_BONE: bool,
	DRAW_AXIS_LIMITS: bool,
	DRAW_ROOT_PART: bool,
	DRAW_FILL_COLLIDERS: bool,
	DRAW_COLLIDER_INFLUENCE: bool,
	DRAW_COLLIDER_AWAKE: bool,
	DRAW_COLLIDER_BROADPHASE: bool,
	DRAW_BOUNDING_BOX: bool,
	DRAW_ROTATION_LIMITS: bool,
	DRAW_ACCELERATION_INFO: bool
)
	for _, BoneTree in pairs(self.BoneTrees) do
		BoneTree:DrawDebug(
			DRAW_CONTACTS,
			DRAW_PHYSICAL_BONE,
			DRAW_BONE,
			DRAW_AXIS_LIMITS,
			DRAW_ROOT_PART,
			DRAW_BOUNDING_BOX,
			DRAW_ROTATION_LIMITS,
			DRAW_ACCELERATION_INFO
		)
	end

	if DRAW_COLLIDERS then
		for _, ColliderObject in pairs(self.ColliderObjects) do
			ColliderObject:DrawDebug(DRAW_FILL_COLLIDERS, DRAW_COLLIDER_INFLUENCE, DRAW_COLLIDER_AWAKE, DRAW_COLLIDER_BROADPHASE)
		end
	end
end

--- @client
--- @within SmartBone
--- @param Overlay ImOverlay
--- Draws the debug overlay
function Class:DrawOverlay(Overlay: ImOverlay)
	if not Config.DEBUG_OVERLAY_ENABLED then
		return
	end

	local INSTANCE_BACKGROUND_COLOR = Color3.new(1.000000, 0.431373, 0.713725)
	local INSTANCE_TEXT_COLOR = Color3.new(1, 1, 1)
	local ROOT_BACKGROUND_COLOR = Color3.new(0.486275, 0.431373, 1.000000)
	local ROOT_TEXT_COLOR = Color3.new(1, 1, 1)

	Overlay.Begin("SmartBone Instance ID: " .. tostring(self.ID), INSTANCE_BACKGROUND_COLOR, INSTANCE_TEXT_COLOR)
	Overlay.Text("Frame Counter: " .. tostring(shared.FrameCounter))

	if Config.DEBUG_OVERLAY_TREE then
		for i, BoneTree in pairs(self.BoneTrees) do
			if Config.DEBUG_OVERLAY_MAX_TREES > 0 then
				if Config.DEBUG_OVERLAY_TREE_OFFSET + Config.DEBUG_OVERLAY_MAX_TREES <= i then
					break
				end
			end

			if Config.DEBUG_OVERLAY_TREE_OFFSET > i then
				continue
			end

			Overlay.Begin("Bone Tree " .. tostring(i), ROOT_BACKGROUND_COLOR, ROOT_TEXT_COLOR)
			BoneTree:DrawOverlay(Overlay)
			Overlay.End()
		end
	end

	Overlay.End()
end

--- @within SmartBone
--- Destroys the root and all its children
function Class:Destroy()
	SB_VERBOSE_LOG("Deleting SmartBone Object")

	for _, BoneTree in pairs(self.BoneTrees) do
		BoneTree:Destroy()
	end

	for _, ColliderObject in pairs(self.ColliderObjects) do
		ColliderObject:Destroy()
	end

	setmetatable(self, nil)
end

--- @client
--- @within SmartBone
--- @return {Stop: () -> ()}
--- Collects all SmartBone objects and SmartBone colliders and starts running physics + collision on them

return Class

end
loaders[node("Components/Bone")] = function(script, require)
local function __sb2Rotation(cf) return cf - cf.Position end
--!nocheck
--!native
local Dependencies = script.Parent.Parent:WaitForChild("Dependencies")
local Config = require(Dependencies:WaitForChild("Config"))
local Gizmo = require(Dependencies:WaitForChild("Debug"):WaitForChild("Gizmo"))
local Utilities = require(Dependencies:WaitForChild("Utilities"))

local Constraints = script.Parent:WaitForChild("Constraints")
local AxisConstraint = require(Constraints:WaitForChild("AxisConstraint"))
local CollisionConstraint = require(Constraints:WaitForChild("CollisionConstraint"))
local DistanceConstraint = require(Constraints:WaitForChild("DistanceConstraint"))
local FrictionConstraint = require(Constraints:WaitForChild("FrictionConstraint"))
local RopeConstraint = require(Constraints:WaitForChild("RopeConstraint"))
local RotationConstraint = require(Constraints:WaitForChild("RotationConstraint"))
local SpringConstraint = require(Constraints:WaitForChild("SpringConstraint"))

local SB_ASSERT_CB = Utilities.SB_ASSERT_CB
--local SB_VERBOSE_LOG = Utilities.SB_VERBOSE_LOG

-- HACK
local MAX_SPEED = 50

local function SafeUnit(Vector: Vector3): Vector3
	if Vector.Magnitude == 0 then
		return Vector3.new(0, 0, 0)
	else
		return Vector.Unit
	end
end






















































local function IsNaN(Value: any): bool
	if Value ~= Value then
		return true
	end

	return false
end

local SolvedTransformedCFrames = {}

-- I beg roblox to make TransformedWorldCFrame parallel safe
local function QueryTransformedWorldCFrameNonSmartbone(OriginBone: Bone): CFrame
	debug.profilebegin("QueryTransformedWorldCFrameNonSmartbone")
	local Solved = SolvedTransformedCFrames[OriginBone]
	if Solved then
		if Solved.Frame == shared.FrameCounter then
			return Solved.CFrame
		end
	end

	local Parent = OriginBone.Parent
	local ParentCFrame

	if Parent:IsA("Bone") then
		ParentCFrame = QueryTransformedWorldCFrameNonSmartbone(Parent)
	else -- This should always be a basepart unless someone has the weirdest model setup ever. If that person is you, why?
		ParentCFrame = Parent.CFrame
	end

	local Result = ParentCFrame * OriginBone.TransformedCFrame

	SolvedTransformedCFrames[OriginBone] = { Frame = shared.FrameCounter, CFrame = Result }

	debug.profileend()
	return Result
end

-- Gets transformedworldcframe using the parents animatedcframe instead of traversing the tree of bones for each bone, increases performance a ton
local function QueryTransformedWorldCFrame(BoneTree, Bone: IBone): CFrame
	debug.profilebegin("QueryTransformedWorldCFrame")
	Bone.SolvedAnimatedCFrame = true

	local ParentIndex = Bone.ParentIndex
	local BoneObject = Bone.Bone

	if ParentIndex < 1 then -- We are no longer in the smartbone tree
		debug.profileend()
		return QueryTransformedWorldCFrameNonSmartbone(BoneObject)
	end

	local ParentBone: IBone = BoneTree.Bones[ParentIndex]

	if not ParentBone.SolvedAnimatedCFrame then
		ParentBone.AnimatedWorldCFrame = QueryTransformedWorldCFrame(BoneTree, ParentBone)
	end

	debug.profileend()
	return ParentBone.AnimatedWorldCFrame * BoneObject.TransformedCFrame
end

local function ClipVector(LastPosition: Vector3, Position: Vector3, Vector: Vector3): Vector3
	LastPosition *= (Vector3.new(1, 1, 1) - Vector)
	LastPosition += (Position * Vector)
	return LastPosition
end

local function GetFriction(Object0: BasePart, Object1: BasePart): number
	local Prop0 = __sb2PhysicalProperties(Object0)
	local Prop1 = __sb2PhysicalProperties(Object1)

	local f0 = Prop0.Friction
	local w0 = Prop0.FrictionWeight

	local f1 = Prop1.Friction
	local w1 = Prop1.FrictionWeight

	return (w0 + w1 > 0 and (f0 * w0 + f1 * w1) / (w0 + w1) or 0)
end

local function SolveWind(self: IBone, BoneTree: any, Velocity: Vector3): Vector3
	debug.profilebegin("SolveWind")
	local Settings = BoneTree.Settings
	local WindType = Settings.WindType

	if WindType ~= "Sine" and WindType ~= "Noise" and WindType ~= "Hybrid" then
		debug.profileend()
		return Vector3.new(0, 0, 0) -- If the wind type the user inputted doesn't exist, I would throw an error / warn but that would crash studio :(
	end

	local TimeModifier = BoneTree.WindOffset
		+ (
			((os.clock() - (self.HeirarchyLength * 0.2)) + (self.TransformOffset.Position - BoneTree.Root.WorldPosition).Magnitude * 0.2) -- * 0.2 is / 5
			* Settings.WindInfluence
		)

	local WindSpeed = Settings.WindSpeed
	local WindStrength = Settings.WindStrength

	if WindSpeed <= 1e-6 or WindStrength <= 1e-6 then
		debug.profileend()
		return Vector3.new(0, 0, 0)
	end

	-- Velocity multiplier
	local WindDirection = Settings.WindDirection
	local VelocityDirection = SafeUnit(Velocity)

	-- If we are going the same direction as the wind
	debug.profilebegin("Solve WindDamper")
	local WindDamper = 1 - math.abs(VelocityDirection:Dot(WindDirection))

	-- This section of code manages the following:
	-- If we are going into the wind then if our bone speed is the same as the wind speed then we should apply double the wind speed, contrary
	-- If we are going with the wind if our bone speed is the same as the wind speed then we wind speed should be zero for this bone.
	if WindSpeed > 0 then
		if VelocityDirection:Dot(WindDirection) > 0 then -- Going with the wind
			local SpeedMatch = 1 - Velocity.Magnitude / WindSpeed
			WindDamper *= math.abs(SpeedMatch)
		else -- Going against the wind
			local SpeedMatch = 1 + Velocity.Magnitude / WindSpeed
			WindDamper *= SpeedMatch
		end
	end
	debug.profileend()

	WindSpeed *= WindDamper

	local function EaseInExpo(x: number): number
		return x == 0 and 0 or 2 ^ (10 * x - 10)
	end

	local SpeedAlpha = Velocity.Magnitude < 100 and Velocity.Magnitude or 100
	local SpeedMultiplier = math.min(EaseInExpo(SpeedAlpha), 100)
	TimeModifier *= math.max(SpeedMultiplier, 1)

	if WindSpeed < 1 then
		WindSpeed *= SpeedMultiplier
	else
		local Mult = SpeedMultiplier / 2
		WindSpeed *= (Mult > 1 and Mult or 1)
	end

	local WindMove

	local function GetNoise(X, Y, Z, Map) -- Returns noise between 0, 1
		debug.profilebegin("GetNoise")
		local Value = math.noise(X, Y, Z)
		Value = math.clamp(Value, -1, 1)

		if Map then
			Value ^= 2
		end
		debug.profileend()
		return Value
	end

	local function SampleGust()
		local Length = 0.3
		local Freq = 1
		return math.sin(TimeModifier * Freq) * Length + (1 - Length)
	end

	local function SampleSin()
		debug.profilebegin("SampleSin")
		local Freq = WindStrength ^ 0.8
		local Power = WindSpeed * 2

		-- Multiple octaves of sin waves
		local Sin0 = math.sin(TimeModifier * Freq)
		local Sin1 = math.cos(TimeModifier / 10 * Freq)
		local Sin2 = math.sin(TimeModifier * 2 * Freq)
		local Sin3 = math.cos(TimeModifier * 3 * Freq)
		local Wave = (Sin0 + Sin1 + Sin2 + Sin3) / 4
		local ScaledWave = Wave * 0.5 + 0.5
		Wave *= Power
		ScaledWave *= Power
		debug.profileend()
		return WindDirection * (ScaledWave > Wave and ScaledWave or Wave)
	end

	local function SampleNoise(CustomAmp, Map)
		debug.profilebegin("SampleNoise")
		CustomAmp = CustomAmp or 0

		local Freq = WindStrength ^ 0.8
		local Power = WindSpeed * 2
		local Seed = BoneTree.WindOffset

		local X = GetNoise(Freq, 0, Seed, Map) * (Power + CustomAmp)
		local Y = GetNoise(0, Freq, Seed, Map) * (Power + CustomAmp)
		local Z = GetNoise(Seed, 0, Freq, Map) * (Power + CustomAmp)
		debug.profileend()
		return WindDirection * Vector3.new(X, Y, Z)
	end

	debug.profilebegin("Solve Wind from type")
	if Settings.WindType == "Sine" then
		debug.profilebegin("Sine")
		WindMove = SampleSin() * SampleGust()
		debug.profileend()
	elseif Settings.WindType == "Noise" then
		debug.profilebegin("Noise")
		WindMove = SampleNoise(0, true) * SampleGust()
		debug.profileend()
	elseif Settings.WindType == "Hybrid" then
		debug.profilebegin("Hybrid")
		WindMove = SampleSin() * SampleGust()
		WindMove += SampleNoise(0.5, true) * SampleGust()
		WindMove *= 0.5
		debug.profileend()
	end
	debug.profileend()

	WindMove /= self.FreeLength < 0.01 and 0.01 or self.FreeLength
	WindMove *= (Settings.WindInfluence * (WindStrength * 0.01)) * (math.clamp(self.HeirarchyLength, 1, 10) * 0.1)
	WindMove *= self.Weight

	debug.profileend()
	return WindMove
end

--- @class Bone
--- Internal class for all bones
--- : Caution:
--- Changes to the syntax in this class will not count to the major version in semver.
--- :::

--- @within Bone
--- @readonly
--- @prop Bone Bone

--- @within Bone
--- @prop FreeLength number

--- @within Bone
--- @prop Weight number

--- @within Bone
--- @readonly
--- @prop ParentIndex number

--- @within Bone
--- @readonly
--- @prop HeirarchyLength number

--- @within Bone
--- @prop Transform CFrame

--- @within Bone
--- @prop LocalTransform CFrame

--- @within Bone
--- @readonly
--- @prop RootPart BasePart

--- @within Bone
--- @readonly
--- @prop RootBone Bone

--- @within Bone
--- @prop Radius number

--- @within Bone
--- @prop Friction number

--- @within Bone
--- @prop RotationLimit number

--- @within Bone
--- @prop Force Vector3?

--- @within Bone
--- @prop Gravity Vector3?

--- @within Bone
--- @prop SolvedAnimatedCFrame boolean
--- Describes if this bone has already solved its animated world cframe, this is used for optimization.

--- @within Bone
--- @prop HasChild boolean

--- @within Bone
--- @readonly
--- @prop AnimatedWorldCFrame CFrame
--- Bone.TransformedWorldCFrame

--- @within Bone
--- @prop StartingCFrame CFrame

--- @within Bone
--- @readonly
--- @prop TransformOffset CFrame

--- @within Bone
--- @readonly
--- @prop LocalTransformOffset CFrame

--- @within Bone
--- @readonly
--- @prop RestPosition Vector3

--- @within Bone
--- @readonly
--- @prop CalculatedWorldCFrame CFrame

--- @within Bone
--- @prop Position Vector3
--- Internal representation of the bone

--- @within Bone
--- @prop LastPosition Vector3
--- Internal representation of the bone's position last frame

--- @within Bone
--- @prop WeldPosition Vector3

--- @within Bone
--- @prop WeldCFrame CFrame

--- @within Bone
--- @prop ActiveWeld boolean
--- Describes if this bone has a weld

--- @within Bone
--- @prop RigidWeld boolean
--- If the bone has a weld, is it rigid

--- @within Bone
--- @prop Anchored boolean

--- @within Bone
--- @prop AxisLocked { boolean, boolean, boolean }
--- XYZ order

--- @within Bone
--- @prop XAxisLimits NumberRange

--- @within Bone
--- @prop YAxisLimits NumberRange

--- @within Bone
--- @prop ZAxisLimits NumberRange

--- @within Bone
--- @prop IsSkippingUpdates boolean

--- @within Bone
--- @prop CollisionHits {}

--- @within Bone
--- @prop CollisionData {}
--- Debug property, holds information about the collisions that the bone had this frame

local Class = {}
Class.__index = Class

function Class.new(Bone: Bone, RootBone: Bone, RootPart: BasePart): IBone
	local ParentCFrame = Bone.Parent:IsA("Bone") and Bone.Parent.TransformedWorldCFrame or RootPart.CFrame

	local self = setmetatable({
		Bone = Bone,
		FreeLength = -1,
		Weight = 1 * 0.7,
		ParentIndex = -1,
		HeirarchyLength = 0,
		Transform = Bone.TransformedWorldCFrame:ToObjectSpace(ParentCFrame):Inverse(),
		LocalTransform = Bone.TransformedCFrame:ToObjectSpace(RootBone.TransformedCFrame):Inverse(),
		RootPart = RootPart,
		RootBone = RootBone,
		Radius = 0,
		Friction = 0,
		RotationLimit = 0,
		Force = nil,
		Gravity = nil,

		SolvedAnimatedCFrame = false,
		HasChild = false,
		--NumberOfChildren = 0,
		--RotationSum = Vector3.new(0, 0, 0),

		AnimatedWorldCFrame = Bone.TransformedWorldCFrame,
		StartingCFrame = Bone.TransformedCFrame,
		TransformOffset = CFrame.new(),
		LocalTransformOffset = CFrame.new(),
		RestPosition = Vector3.new(0, 0, 0),
		CalculatedWorldCFrame = Bone.TransformedWorldCFrame,

		Position = Bone.TransformedWorldCFrame.Position,
		LastPosition = Bone.TransformedWorldCFrame.Position,

		WeldPosition = Vector3.new(0, 0, 0),
		WeldCFrame = CFrame.new(),
		ActiveWeld = false,
		RigidWeld = false,

		Anchored = false,
		AxisLocked = { false, false, false },
		XAxisLimits = NumberRange.new(-math.huge, math.huge),
		YAxisLimits = NumberRange.new(-math.huge, math.huge),
		ZAxisLimits = NumberRange.new(-math.huge, math.huge),

		IsSkippingUpdates = false,

		CollisionHits = {},

		-- Debug
		CollisionsData = {},
	}, Class)

	self.AttributeConnection = Bone.AttributeChanged:Connect(function(Attribute)
		-- Do this cause of axis lock
		local Settings = Utilities.GatherBoneSettings(Bone)

		for k, v in pairs(Settings) do
			-- В¬ represents a nil value, this is done so we can delete attributes at runtime.
			self[k] = (v ~= "В¬") and v or nil
		end
	end)

	return self
end

--- @within Bone
--- @param Position Vector3
--- @param Vector Vector3
--- Clips velocity on specified vector, Position is where we are at our current physics step (Before we set self.Position)
function Class:ClipVelocity(Position: Vector3, Vector: Vector3)
	self.LastPosition = ClipVector(self.LastPosition, Position, Vector)
end

--- @within Bone
--- @param BoneTree BoneTree
function Class:PreUpdate(BoneTree) -- Parallel safe
	debug.profilebegin("Bone")
	local Root = BoneTree.Bones[1]
	local Parent = BoneTree.Bones[self.ParentIndex]

	self.AnimatedWorldCFrame = QueryTransformedWorldCFrame(BoneTree, self)

	local SmartWeld = self.Bone:FindFirstChild("SmartWeld")

	-- Pyramid of weld
	self.ActiveWeld = false
	if SmartWeld then
		if SmartWeld:IsA("ObjectValue") then
			local WeldTo = SmartWeld.Value

			self.RigidWeld = (SmartWeld:GetAttribute("Rigid") == true) or false

			if WeldTo then
				if WeldTo:IsA("Attachment") then -- Attachment also covers bones
					self.WeldPosition = WeldTo.WorldPosition
					self.WeldCFrame = WeldTo.WorldCFrame
					self.ActiveWeld = true
				elseif WeldTo:IsA("BasePart") then
					self.WeldPosition = WeldTo.Position
					self.WeldCFrame = WeldTo.CFrame
					self.ActiveWeld = true
				end
			end
		end
	end

	if self.ParentIndex < 1 then -- Force anchor the root bone
		self.Anchored = true
	end

	if self.Bone == self.RootBone then
		-- Curse Non-SmartBone Objects!
		local ParentCFrame

		if self.Bone.Parent:IsA("Bone") then
			ParentCFrame = QueryTransformedWorldCFrameNonSmartbone(self.Bone.Parent)
		else
			ParentCFrame = self.RootPart.CFrame
		end

		self.TransformOffset = ParentCFrame * self.Transform
	else
		self.TransformOffset = Parent.AnimatedWorldCFrame * self.Transform
	end

	self.LocalTransformOffset = Root.Bone.CFrame * self.LocalTransform
	debug.profileend()
end

--- @within Bone
--- @param BoneTree BoneTree
--- @param Force Vector3
--- @param Delta number -- О”t
--- Force passed in via BoneTree:StepPhysics()
function Class:StepPhysics(BoneTree, Force: Vector3, Delta: number) -- Parallel safe
	debug.profilebegin("Bone")
	if self.Anchored then
		self.LastPosition = self.AnimatedWorldCFrame.Position
		self.Position = self.AnimatedWorldCFrame.Position

		debug.profileend()
		return
	end

	-- Custom forces per bone
	if self.Force or self.Gravity then
		debug.profilebegin("Solve Force")
		Force = (self.Gravity or BoneTree.Settings.Gravity)

		Force = (Force + (self.Force or BoneTree.Settings.Force))
		debug.profileend()
	end

	debug.profilebegin("Update")
	local Settings = BoneTree.Settings

	local Velocity = (self.Position - self.LastPosition) / Delta
	Velocity = (Velocity.Magnitude > MAX_SPEED and Velocity.Unit * MAX_SPEED or Velocity)

	local Move = BoneTree.ObjectAcceleration * Settings.Inertia
	local WindMove = SolveWind(self, BoneTree, Velocity)
	local Acceleration = Force + Move

	self.LastPosition = self.Position
	--self.Position += (Velocity * (1 - Settings.Damping) + Force + Move) * Delta + WindMove
	self.Position += Velocity * (1 - Settings.Damping) * Delta + Acceleration * Delta * Delta + WindMove
	debug.profileend()
	debug.profileend()
end

--- @within Bone
--- @param BoneTree BoneTree
--- @param ColliderObjects { ColliderObject }
--- @param Delta number -- О”t
function Class:Constrain(BoneTree, ColliderObjects, Delta: number) -- Parallel safe
	debug.profilebegin("Bone")
	if self.Anchored then
		debug.profileend()
		return
	end

	local Position = self.Position
	local RootPart = self.RootPart
	local RootCFrame: CFrame = RootPart.CFrame

	-- Friction must be first
	Position = FrictionConstraint(self, Position, self.LastPosition)

	if #ColliderObjects ~= 0 then
		Position = CollisionConstraint(self, Position, ColliderObjects)
	end

	if BoneTree.Settings.Constraint == "Spring" then
		Position = SpringConstraint(self, Position, nil, BoneTree, Delta)
	elseif BoneTree.Settings.Constraint == "Distance" then
		Position = DistanceConstraint(self, Position, BoneTree)
	elseif BoneTree.Settings.Constraint == "Rope" then
		Position = RopeConstraint(self, Position, BoneTree)
	else
		-- Go to anchored position if our constraint type is incorrect
		Position = self.AnimatedWorldCFrame.Position
	end

	Position = AxisConstraint(self, Position, self.LastPosition, RootCFrame)

	Position = RotationConstraint(self, Position, BoneTree)

	if self.ActiveWeld then
		if self.RigidWeld then
			-- Solve Transform has the rest of this implementation.
			Position = self.WeldPosition
		else
			Position = SpringConstraint(self, Position, self.WeldPosition, BoneTree, Delta)
		end
	end

	self.Friction = 0

	for _, HitPart in pairs(self.CollisionHits) do
		-- Use whatever object has the higher friction
		local Friction = GetFriction(self.RootPart, HitPart)
		self.Friction = Friction < self.Friction and self.Friction or Friction
	end

	self.Position = Position
	debug.profileend()
end

--- @within Bone
--- Returns bone to rest position
function Class:SkipUpdate()
	if self.IsSkippingUpdates == false and Config.RESET_TRANSFORM_ON_SKIP then
		--SB_VERBOSE_LOG("Skipping bone, resetting transform.")
		self.CalculatedWorldCFrame = self.AnimatedWorldCFrame
		self.IsSkippingUpdates = true
	end

	self.LastPosition = self.AnimatedWorldCFrame.Position + (self.LastPosition - self.Position)
	self.Position = self.AnimatedWorldCFrame.Position
end

--- @within Bone
--- @param BoneTree BoneTree
--- @param Delta number -- О”t
--- Solves the cframe of the bones
function Class:SolveTransform(BoneTree, Delta: number) -- Parallel safe
	debug.profilebegin("Bone")
	if self.ParentIndex < 1 then
		debug.profileend()
		return
	end

	self.IsSkippingUpdates = false

	local ParentBone: IBone = BoneTree.Bones[self.ParentIndex]
	local BoneParent = ParentBone.Bone

	if ParentBone and BoneParent then
		local ReferenceCFrame = ParentBone.TransformOffset
		local v1 = self.Position - ParentBone.Position
		local Rotation = __sb2Rotation(Utilities.GetRotationBetween(ReferenceCFrame.UpVector, v1)) * __sb2Rotation(ReferenceCFrame)

		local factor = 0.00001
		local alpha = math.min(1 - factor ^ Delta, 1)

		--local ShouldAverage = ParentBone.NumberOfChildren > 1

		if ParentBone.ActiveWeld and ParentBone.RigidWeld then
			ParentBone.CalculatedWorldCFrame = ParentBone.WeldCFrame
		--elseif ShouldAverage then
		--	ParentBone.RotationSum += Vector3.new(Rotation:ToEulerAnglesXYZ())
		else
			ParentBone.CalculatedWorldCFrame = BoneParent.WorldCFrame:Lerp(CFrame.new(ParentBone.Position) * Rotation, alpha)
			--ParentBone.CalculatedWorldCFrame = CFrame.new(ParentBone.Position) * Rotation
		end

		SB_ASSERT_CB(not IsNaN(ParentBone.CalculatedWorldCFrame.Position), warn, "If you see this report this as a bug, (NaN Calc world cframe)")
	end
	debug.profileend()
end

--- @within Bone
--- @param BoneTree BoneTree
--- Sets the world cframes of the bones to the calculated world cframe (solved in Bone:SolveTransform())
function Class:ApplyTransform(BoneTree)
	debug.profilebegin("Bone")

	self.SolvedAnimatedCFrame = false

	if self.ParentIndex < 1 then
		debug.profileend()
		return
	end

	local ParentBone: IBone = BoneTree.Bones[self.ParentIndex]
	local BoneParent = ParentBone.Bone

	-- We check if the magnitude of rotation sum is zero because that tells us if it has already been averaged by another bone.
	-- if ParentBone.NumberOfChildren > 1 and ParentBone.RotationSum.Magnitude ~= 0 then
	-- 	local AverageRotation = ParentBone.RotationSum / ParentBone.NumberOfChildren
	-- 	ParentBone.CalculatedWorldCFrame = CFrame.new(ParentBone.Position)
	-- 		* CFrame.fromEulerAnglesXYZ(AverageRotation.X, AverageRotation.Y, AverageRotation.Z)
	-- 	ParentBone.RotationSum = Vector3.new(0, 0, 0)
	-- end

	if ParentBone and BoneParent then
		if ParentBone.Anchored and not BoneTree.Settings.AnchorsRotate then -- Anchored and anchors do not rotate
			BoneParent.WorldCFrame = ParentBone.TransformOffset
		elseif ParentBone.Anchored then -- Anchored and anchors rotate
			BoneParent.WorldCFrame = CFrame.new(ParentBone.Position) * __sb2Rotation(ParentBone.CalculatedWorldCFrame)
		else -- Not anchored
			BoneParent.WorldCFrame = ParentBone.CalculatedWorldCFrame
		end
	end
	debug.profileend()
end

--- @client
--- @within Bone
--- @param BoneTree any
--- @param DRAW_CONTACTS boolean
--- @param DRAW_PHYSICAL_BONE boolean
--- @param DRAW_BONE boolean
--- @param DRAW_AXIS_LIMITS boolean
--- @param DRAW_ROTATION_LIMIT boolean
function Class:DrawDebug(BoneTree, DRAW_CONTACTS: bool, DRAW_PHYSICAL_BONE: bool, DRAW_BONE: bool, DRAW_AXIS_LIMITS: bool, DRAW_ROTATION_LIMIT: bool)
	debug.profilebegin("Bone")
	local BONE_POSITION_COLOR = Color3.fromRGB(255, 0, 0)
	local BONE_LAST_POSITION_COLOR = Color3.fromRGB(255, 94, 0)
	local BONE_POSITION_RAY_COLOR = Color3.fromRGB(234, 1, 255)
	local BONE_SPHERE_COLOR = Color3.fromRGB(0, 255, 255)
	local BONE_FRONT_ARROW_COLOR = Color3.fromRGB(255, 0, 0)
	local BONE_UP_ARROW_COLOR = Color3.fromRGB(0, 255, 0)
	local BONE_RIGHT_ARROW_COLOR = Color3.fromRGB(0, 0, 255)
	local ROTATION_CONE_COLOR = Color3.fromRGB(0, 183, 255)
	local AXIS_X_COLOR = Color3.fromRGB(255, 0, 0)
	local AXIS_Y_COLOR = Color3.fromRGB(0, 255, 0)
	local AXIS_Z_COLOR = Color3.fromRGB(0, 0, 255)
	local AXIS_ARROW_RADIUS = 0.05
	local AXIS_ARROW_LENGTH = 0.15

	local COLLISION_CONTACT_SPHERE_COLOR = Color3.fromRGB(28, 41, 224)
	local COLLISION_CONTACT_NORMAL_COLOR = Color3.fromRGB(255, 27, 27)
	local COLLISION_CONTACT_SPHERE_RADIUS = 0.08
	local COLLISION_CONTACT_ARROW_LENGTH = 0.15
	local COLLISION_CONTACT_ARROW_RADIUS = 0.05
	local COLLISION_CONTACT_ARROW_EXPANSION = 0.5

	local BONE_ARROW_LENGTH = 0.05
	local BONE_ARROW_RADIUS = 0.015
	local BONE_CYLINDER_RADIUS = 0.005
	local BONE_ARROW_EXPANSION = 0.25
	local BONE_RADIUS = 0.08

	local ROTATION_CONE_LENGTH = 1

	local BoneCFrame = self.AnimatedWorldCFrame
	local BonePosition = BoneCFrame.Position
	local BonePositionCFrame = CFrame.new(self.Position)
	local BoneLastPositionCFrame = CFrame.new(self.LastPosition)

	-- Draw our internal bone

	if DRAW_BONE then
		Gizmo.PushProperty("AlwaysOnTop", false)

		Gizmo.PushProperty("Color3", BONE_POSITION_COLOR)
		Gizmo.Sphere:Draw(BonePositionCFrame, self.Radius, 10, 360)

		Gizmo.PushProperty("Color3", BONE_LAST_POSITION_COLOR)
		Gizmo.Sphere:Draw(BoneLastPositionCFrame, self.Radius, 10, 360)

		Gizmo.PushProperty("Color3", BONE_POSITION_RAY_COLOR)
		Gizmo.Ray:Draw(self.Position, self.LastPosition)
	end

	-- Draw our axis Limits

	if DRAW_AXIS_LIMITS and not self.Anchored then
		local XLock = self.AxisLocked[1]
		local YLock = self.AxisLocked[2]
		local ZLock = self.AxisLocked[3]

		local RootPart = self.RootPart
		local Offset = RootPart.CFrame:PointToObjectSpace(BonePosition)

		local XVector = RootPart.CFrame.RightVector
		local YVector = RootPart.CFrame.UpVector
		local ZVector = RootPart.CFrame.LookVector

		local Size = Vector3.new(5, 5, 0)

		if not XLock then
			Gizmo.PushProperty("Color3", AXIS_X_COLOR)
			Gizmo.Arrow:Draw(BonePosition - XVector * 2, BonePosition + XVector * 2, AXIS_ARROW_RADIUS, AXIS_ARROW_LENGTH, 9)

			local MinXLimit = self.XAxisLimits.Min - Offset.X
			local MaxXLimit = self.XAxisLimits.Max - Offset.X

			Gizmo.Plane:Draw(BonePosition + XVector * MinXLimit, XVector, Size)
			Gizmo.Plane:Draw(BonePosition + XVector * MaxXLimit, XVector, Size)
		end

		if not YLock then
			Gizmo.PushProperty("Color3", AXIS_Y_COLOR)
			Gizmo.Arrow:Draw(BonePosition - YVector * 2, BonePosition + YVector * 2, AXIS_ARROW_RADIUS, AXIS_ARROW_LENGTH, 9)

			local MinYLimit = self.YAxisLimits.Min - Offset.Y
			local MaxYLimit = self.YAxisLimits.Max - Offset.Y

			Gizmo.Plane:Draw(BonePosition + YVector * MinYLimit, YVector, Size)
			Gizmo.Plane:Draw(BonePosition + YVector * MaxYLimit, YVector, Size)
		end

		if not ZLock then
			Gizmo.PushProperty("Color3", AXIS_Z_COLOR)
			Gizmo.Arrow:Draw(BonePosition - ZVector * 2, BonePosition + ZVector * 2, AXIS_ARROW_RADIUS, AXIS_ARROW_LENGTH, 9)

			local MinZLimit = self.ZAxisLimits.Min - Offset.Z
			local MaxZLimit = self.ZAxisLimits.Max - Offset.Z

			Gizmo.Plane:Draw(BonePosition - ZVector * MinZLimit, ZVector, Size)
			Gizmo.Plane:Draw(BonePosition - ZVector * MaxZLimit, ZVector, Size)
		end
	end

	-- Draw the physical bone object

	if DRAW_PHYSICAL_BONE then
		Gizmo.PushProperty("Color3", BONE_SPHERE_COLOR)
		Gizmo.Sphere:Draw(BoneCFrame, BONE_RADIUS, 5, 360)

		Gizmo.PushProperty("Color3", BONE_FRONT_ARROW_COLOR)
		Gizmo.VolumeArrow:Draw(
			BonePosition,
			BonePosition + BoneCFrame.LookVector * BONE_ARROW_EXPANSION,
			BONE_CYLINDER_RADIUS,
			BONE_ARROW_RADIUS,
			BONE_ARROW_LENGTH,
			true
		)

		Gizmo.PushProperty("Color3", BONE_UP_ARROW_COLOR)
		Gizmo.VolumeArrow:Draw(
			BonePosition,
			BonePosition + BoneCFrame.UpVector * BONE_ARROW_EXPANSION,
			BONE_CYLINDER_RADIUS,
			BONE_ARROW_RADIUS,
			BONE_ARROW_LENGTH,
			true
		)

		Gizmo.PushProperty("Color3", BONE_RIGHT_ARROW_COLOR)
		Gizmo.VolumeArrow:Draw(
			BonePosition,
			BonePosition + BoneCFrame.RightVector * BONE_ARROW_EXPANSION,
			BONE_CYLINDER_RADIUS,
			BONE_ARROW_RADIUS,
			BONE_ARROW_LENGTH,
			true
		)
	end

	-- Draw our collision contacts

	if DRAW_CONTACTS and not self.Anchored then
		for _, Collision in pairs(self.CollisionsData) do
			Gizmo.PushProperty("Color3", COLLISION_CONTACT_SPHERE_COLOR)
			Gizmo.Sphere:Draw(CFrame.new(Collision.ClosestPoint), COLLISION_CONTACT_SPHERE_RADIUS, 5, 360)

			Gizmo.PushProperty("Color3", COLLISION_CONTACT_NORMAL_COLOR)
			Gizmo.Arrow:Draw(
				Collision.ClosestPoint,
				Collision.ClosestPoint + Collision.Normal * COLLISION_CONTACT_ARROW_EXPANSION,
				COLLISION_CONTACT_ARROW_RADIUS,
				COLLISION_CONTACT_ARROW_LENGTH,
				9
			)
		end
	end

	-- Draw rotation limit

	if DRAW_ROTATION_LIMIT and self.RotationLimit < 180 and self.RotationLimit > 0 and self.ParentIndex > 0 and self.HasChild then
		local ConeRadius
		local InverseDirection = 1
		if self.RotationLimit < 89.5 then
			ConeRadius = ROTATION_CONE_LENGTH * math.tan(math.rad(self.RotationLimit))
		elseif self.RotationLimit > 90 then
			InverseDirection = -1
			ConeRadius = ROTATION_CONE_LENGTH * math.tan(math.rad(180 - self.RotationLimit))
		else
			ROTATION_CONE_LENGTH = 0
			ConeRadius = 5
		end

		ConeRadius = math.min(ConeRadius, 5)

		if ConeRadius == 5 then
			ROTATION_CONE_LENGTH = 0
		end

		local ConeDirection = (self.Position - BoneTree.Bones[self.ParentIndex].Position).Unit * InverseDirection

		local NewBoneCFrame =
			CFrame.lookAt(BonePosition + ConeDirection * (ROTATION_CONE_LENGTH * 0.5), BonePosition + -ConeDirection * 500, BoneCFrame.LookVector)

		Gizmo.PushProperty("Color3", ROTATION_CONE_COLOR)
		Gizmo.Cone:Draw(NewBoneCFrame, ConeRadius, ROTATION_CONE_LENGTH, 8 + ConeRadius * 2)
	end

	debug.profileend()
end

--- @client
--- @within Bone
function Class:DrawOverlay(Overlay: ImOverlay)
	Overlay.Text("Bone: " .. tostring(self.Bone.Name))

	if Config.DEBUG_OVERLAY_BONE_INFO or Config.DEBUG_OVERLAY_BONE_NUMERICS then
		Overlay.Text("Free Length: " .. tostring(self.FreeLength))
		Overlay.Text("Weight: " .. tostring(self.Weight))
		Overlay.Text("Parent Index: " .. tostring(self.ParentIndex))
		Overlay.Text("Heirarchy Length: " .. tostring(self.HeirarchyLength))
		Overlay.Text("Radius: " .. tostring(self.Radius))
		Overlay.Text("Friction: " .. tostring(self.Friction))
		Overlay.Text("Rotation Limit: " .. tostring(self.RotationLimit))
	end

	if Config.DEBUG_OVERLAY_BONE_INFO or Config.DEBUG_OVERLAY_BONE_CONSTRAIN then
		Overlay.Text("Anchored: " .. tostring(self.Anchored))
		Overlay.Text("Axis Locked: " .. tostring(self.AxisLocked[1]) .. ", " .. tostring(self.AxisLocked[2]) .. ", " .. tostring(self.AxisLocked[3]))
		Overlay.Text("X Axis Limit: " .. tostring(self.XAxisLimits))
		Overlay.Text("Y Axis Limit: " .. tostring(self.YAxisLimits))
		Overlay.Text("Z Axis Limit: " .. tostring(self.ZAxisLimits))
	end

	if Config.DEBUG_OVERLAY_BONE_INFO or Config.DEBUG_OVERLAY_BONE_WELD then
		Overlay.Text("Active Weld: " .. tostring(self.ActiveWeld))
		Overlay.Text("Rigid Weld: " .. tostring(self.RigidWeld))
		Overlay.Text("Weld Position: " .. tostring(string.format("%.3f, %.3f, %.3f", self.WeldPosition.X, self.WeldPosition.Y, self.WeldPosition.Z)))
	end

	if Config.DEBUG_OVERLAY_BONE_INFO or Config.DEBUG_OVERLAY_BONE_FORCES then
		local Force = self.Force and string.format("%.3f, %.3f, %.3f", self.Force.X, self.Force.Y, self.Force.Z) or "-, -, -"
		local Gravity = self.Gravity and string.format("%.3f, %.3f, %.3f", self.Gravity.X, self.Gravity.Y, self.Gravity.Z) or "-, -, -"

		Overlay.Text("Force: " .. tostring(Force))
		Overlay.Text("Gravity: " .. tostring(Gravity))
	end
end

function Class:Destroy()
	if Config.RESET_BONE_ON_DESTROY then
		
		self.Bone.CFrame = self.StartingCFrame
	end

	self.AttributeConnection:Disconnect()

	setmetatable(self, nil)
end

return Class

end
loaders[node("Components/BoneTree")] = function(script, require)
--!nocheck
--!native

local Lighting = game:GetService("Lighting")
local Dependencies = script.Parent.Parent:WaitForChild("Dependencies")
local BoneClass = require(script.Parent:WaitForChild("Bone"))
local Config = require(Dependencies:WaitForChild("Config"))
local DefaultObjectSettings = require(Dependencies:WaitForChild("DefaultObjectSettings"))
local Gizmo = require(Dependencies:WaitForChild("Debug"):WaitForChild("Gizmo"))
local Utilities = require(Dependencies:WaitForChild("Utilities"))
local MaxVector = Vector3.new(math.huge, math.huge, math.huge)

local WIND_SEED = 1029410295159813
local WIND_RNG = Random.new(WIND_SEED)
local SB_VERBOSE_LOG = Utilities.SB_VERBOSE_LOG

local CollectionService = game:GetService("CollectionService")

































local function SafeUnit(v3: Vector3): Vector3
	if v3.Magnitude == 0 then
		--warn("Vector was saved")
		return Vector3.new(0, 0, 0)
	end

	return v3.Unit
end

local function map(n: number, start: number, stop: number, newStart: number, newStop: number, withinBounds: bool): number
	local value = ((n - start) / (stop - start)) * (newStop - newStart) + newStart

	--// Returns basic value
	if not withinBounds then
		return value
	end

	--// Returns values constrained to exact range
	if newStart < newStop then
		return (value < newStop and value or newStop) > newStart and (value < newStop and value or newStop) or newStart
	else
		return (value < newStart and value or newStart) > newStop and (value < newStart and value or newStart) or newStop
	end
end

--- @class BoneTree
--- Internal class for all bone trees
--- : Caution:
--- Changes to the syntax in this class will not count to the major version in semver.
--- :::

--- @within BoneTree
--- @readonly
--- @prop WindOffset number
--- Used in wind calculations so each bone tree has a different solution.

--- @within BoneTree
--- @readonly
--- @prop Root Bone
--- Root bone of the bone tree

--- @within BoneTree
--- @readonly
--- @prop RootPart BasePart

--- @within BoneTree
--- @readonly
--- @prop RootPartSize Vector3
--- Constant value of the root parts size at the start of the simulation

--- @within BoneTree
--- @prop Bones table

--- @within BoneTree
--- @prop Settings {}

--- @within BoneTree
--- @readonly
--- @prop UpdateRate number
--- Throttled update rate

--- @within BoneTree
--- @readonly
--- @prop InView boolean

--- @within BoneTree
--- @readonly
--- @prop BoundingBoxCFrame CFrame

--- @within BoneTree
--- @readonly
--- @prop BoundingBoxSize Size

--- @within BoneTree
--- @readonly
--- @prop AccumulatedDelta number
--- Used in the runtime

--- @within BoneTree
--- @readonly
--- @prop Destroyed boolean
--- True if the root part has been destroyed

--- @within BoneTree
--- @readonly
--- @prop IsSkippingUpdates boolean
--- True if the bone tree is currently skipping updates

--- @within BoneTree
--- @readonly
--- @prop InWorkspace boolean
--- Boolean describing if the rootpart is a descendant of workspace

--- @within BoneTree
--- @readonly
--- @prop Force Vector3

--- @within BoneTree
--- @prop ObjectMove Vector3
--- Difference between root parts last position and current position

--- @within BoneTree
--- @prop ObjectVelocity Vector3
--- Velocity at which the root part is traveling at, calculated via object move.

--- @within BoneTree
--- @prop ObjectPreviousPosition Vector3
--- Root parts previous position

local Class = {}
Class.__index = Class

--- @within BoneTree
--- @param RootBone Bone
--- @param RootPart BasePart
--- @param Settings {any}
--- @return BoneTree
function Class.new(RootBone: Bone, RootPart: BasePart, Settings: { any }): IBoneTree
	local self = setmetatable({
		WindOffset = WIND_RNG:NextNumber(0, 1e6),
		Root = RootBone:IsA("Bone") and RootBone or nil,
		RootPart = RootPart,
		RootPartSize = RootPart.Size,
		Bones = {},
		Settings = Settings,
		UpdateRate = 0,
		InView = true,
		AccumulatedDelta = 0,
		BoundingBoxCFrame = RootPart.CFrame,
		BoundingBoxSize = RootPart.Size,

		Destroyed = false,
		IsSkippingUpdates = false,
		InWorkspace = false,

		Force = Vector3.new(0, 0, 0),
		ObjectMove = Vector3.new(0, 0, 0),
		ObjectVelocity = Vector3.new(0, 0, 0),
		ObjectAcceleration = Vector3.new(0, 0, 0),
		ObjectPreviousPosition = RootPart.Position,
	}, Class)

	self.InWorkspace = RootPart:IsDescendantOf(workspace)

	-- TODO: Revisit optimising :IsDescendantOf calls
	self.DestroyConnection = RootPart.AncestryChanged:Connect(function()
		if not RootPart:IsDescendantOf(game) then
			self.Destroyed = true
		end

		self.InWorkspace = RootPart:IsDescendantOf(workspace)
	end)

	self.AttributeConnection = RootPart.AttributeChanged:Connect(function(Attribute)
		-- No need validating
		Settings[Attribute] = RootPart:GetAttribute(Attribute) or DefaultObjectSettings[Attribute]
	end)

	self.TagConnection = CollectionService:GetInstanceRemovedSignal("SmartBone"):Connect(function(Object)
		if Object ~= RootPart then
			return
		end

		self.Destroyed = true
	end)

	-- FIXME:
	-- if Settings.MatchWorkspaceWind then
	-- 	self.GlobalWindConnection = workspace:GetPropertyChangedSignal("GlobalWind"):Connect(function()
	-- 		local GlobalWind = __sb2WorkspaceWind()
	-- 		Settings.WindDirection = SafeUnit(GlobalWind)
	-- 		Settings.WindSpeed = GlobalWind.Magnitude
	-- 	end)
	-- else
	-- 	self.WindDirectionConnection = Lighting:GetAttributeChangedSignal("WindDirection"):Connect(function()
	-- 		Settings.WindDirection = Lighting:GetAttribute("WindDirection")
	-- 	end)

	-- 	self.WindSpeedConnection = Lighting:GetAttributeChangedSignal("WindSpeed"):Connect(function()
	-- 		Settings.WindSpeed = Lighting:GetAttribute("WindSpeed")
	-- 	end)

	-- 	self.WindStrengthConnection = Lighting:GetAttributeChangedSignal("WindStrength"):Connect(function()
	-- 		Settings.WindStrength = Lighting:GetAttribute("WindStrength")
	-- 	end)
	-- end

	return self
end

--- @within BoneTree
--- Called in BoneTree:PreUpdate(),
--- Computes the bounding box of all the bones
function Class:UpdateBoundingBox()
	debug.profilebegin("BoneTree")

	if not self.InView then
		self.BoundingBoxCFrame = self.RootPart.CFrame
		self.BoundingBoxSize = self.RootPart.Size

		debug.profileend()
		return
	end

	local BottomCorner = MaxVector
	local TopCorner = -MaxVector

	debug.profilebegin("Max Min Bones")
	for _, Bone in pairs(self.Bones) do
		debug.profilebegin("Max Min Bone")
		local Velocity = (Bone.Position - Bone.LastPosition)
		local Position = Bone.Position + Velocity

		BottomCorner = __sb2Min(BottomCorner, Position)
		TopCorner = __sb2Max(TopCorner, Position)
		debug.profileend()
	end
	debug.profileend()

	local CenterOfMass = (BottomCorner + TopCorner) * 0.5

	self.BoundingBoxCFrame = CFrame.new(CenterOfMass)
	self.BoundingBoxSize = __sb2Max(self.RootPartSize, TopCorner - BottomCorner)

	debug.profileend()
end

--- @within BoneTree
--- @param RootPosition Vector3 -- Position of the root part (Micro Optimization)
--- Called in BoneTree:PreUpdate()
function Class:UpdateThrottling(RootPosition: Vector3)
	debug.profilebegin("BoneTree")
	local Settings = self.Settings

	local Camera = workspace.CurrentCamera
	local Distance = (RootPosition - Camera.CFrame.Position).Magnitude

	if Distance > Settings.ActivationDistance then
		self.UpdateRate = 0
		debug.profileend()
		return
	end

	local UpdateRate = 1 - map(Distance, Settings.ThrottleDistance, Settings.ActivationDistance, 0, 1, true)
	self.UpdateRate = Settings.UpdateRate * UpdateRate
	debug.profileend()
end

--- @within BoneTree
--- @param Delta number -- О”t
--- Calculates object move, gravity and throttled update rate. Also calls Bone:PreUpdate()
function Class:PreUpdate(Delta: number)
	debug.profilebegin("BoneTree")
	local RootPartCFrame = self.RootPart.CFrame
	local RootPartPosition = RootPartCFrame.Position

	local PreviousVelocity = self.ObjectVelocity

	self.ObjectMove = (RootPartPosition - self.ObjectPreviousPosition)
	self.ObjectVelocity = self.ObjectMove
	self.ObjectAcceleration = (PreviousVelocity - self.ObjectVelocity)
	self.ObjectPreviousPosition = RootPartPosition
	self.RootPartSize = self.RootPart.Size

	self:UpdateThrottling(RootPartPosition)
	self:UpdateBoundingBox()

	for _, Bone in pairs(self.Bones) do
		Bone:PreUpdate(self)
	end
	debug.profileend()
end

--- @within BoneTree
--- @param Delta number -- О”t
--- Calculates forces and updates wind. Also calls Bone:StepPhysics()
function Class:StepPhysics(Delta: number)
	debug.profilebegin("BoneTree")
	local Settings = self.Settings
	local Force = (Settings.Gravity + Settings.Force)

	if Settings.MatchWorkspaceWind == true then
		local GlobalWind = __sb2WorkspaceWind()
		Settings.WindDirection = SafeUnit(GlobalWind)
		Settings.WindSpeed = GlobalWind.Magnitude
	else
		local WindDirection = Lighting:GetAttribute("WindDirection") or DefaultObjectSettings.WindDirection
		local WindSpeed = Lighting:GetAttribute("WindSpeed") or DefaultObjectSettings.WindSpeed

		Settings.WindDirection = SafeUnit(WindDirection)
		Settings.WindSpeed = WindSpeed
	end

	local WindStrength = Lighting:GetAttribute("WindStrength") or DefaultObjectSettings.WindStrength

	Settings.WindStrength = WindStrength

	for _, Bone in pairs(self.Bones) do
		Bone:StepPhysics(self, Force, Delta)
	end
	debug.profileend()
end

--- @within BoneTree
--- @param ColliderObjects table
--- @param Delta number -- О”t
function Class:Constrain(ColliderObjects, Delta: number)
	debug.profilebegin("BoneTree")
	for _, Bone in pairs(self.Bones) do
		Bone:Constrain(self, ColliderObjects, Delta)
	end
	debug.profileend()
end

--- @within BoneTree
--- Resets all bones to their rest positions, and sets skipping updates to true,
function Class:SkipUpdate()
	debug.profilebegin("BoneTree")
	for _, Bone in pairs(self.Bones) do
		Bone:SkipUpdate()
	end

	self.IsSkippingUpdates = true
	debug.profileend()
end

--- @within BoneTree
--- @param Delta number -- О”t
function Class:SolveTransform(Delta: number)
	debug.profilebegin("BoneTree")
	for _, Bone in pairs(self.Bones) do
		Bone:SolveTransform(self, Delta)
	end

	self.IsSkippingUpdates = false
	debug.profileend()
end

--- @within BoneTree
--- Applys all the transforms to bones in serial context.
function Class:ApplyTransform()
	debug.profilebegin("BoneTree")
	for _, Bone in pairs(self.Bones) do
		Bone:ApplyTransform(self)
	end
	debug.profileend()
end

--- @client
--- @within BoneTree
--- @param DRAW_CONTACTS boolean
--- @param DRAW_PHYSICAL_BONE boolean
--- @param DRAW_BONE boolean
--- @param DRAW_AXIS_LIMITS boolean
--- @param DRAW_ROOT_PART boolean
--- @param DRAW_BOUNDING_BOX boolean
--- @param DRAW_ROTATION_LIMITS boolean
--- @param DRAW_ACCELERATION_INFO boolean
function Class:DrawDebug(
	DRAW_CONTACTS: bool,
	DRAW_PHYSICAL_BONE: bool,
	DRAW_BONE: bool,
	DRAW_AXIS_LIMITS: bool,
	DRAW_ROOT_PART: bool,
	DRAW_BOUNDING_BOX: bool,
	DRAW_ROTATION_LIMITS: bool,
	DRAW_ACCELERATION_INFO: bool
)
	debug.profilebegin("BoneTree")
	local LINE_CONNECTING_COLOR = Color3.fromRGB(248, 168, 20)
	local ROOT_PART_BOUNDING_BOX_COLOR = Color3.fromRGB(76, 208, 223)
	local ROOT_PART_FILL_COLOR = Color3.fromRGB(255, 89, 89)
	local OBJECT_MOVE_COLOR = Color3.new(1, 0, 0)
	local OBJECT_VELOCITY_COLOR = Color3.new(0, 1, 0)
	local OBJECT_ACCELERATION_COLOR = Color3.new(0, 0, 1)

	if DRAW_ACCELERATION_INFO then
		local Raised = self.RootPart.Position + Vector3.new(0, self.RootPart.Size.Y * 0.5 + 1, 0)

		Gizmo.SetStyle(OBJECT_MOVE_COLOR, 0, true)
		Gizmo.Arrow:Draw(Raised, Raised + self.ObjectMove, 0.025, 0.1, 6)

		Gizmo.SetStyle(OBJECT_VELOCITY_COLOR, 0, true)
		Gizmo.Arrow:Draw(Raised, Raised + self.ObjectVelocity, 0.025, 0.1, 6)

		Gizmo.SetStyle(OBJECT_ACCELERATION_COLOR, 0, true)
		Gizmo.Arrow:Draw(Raised, Raised + self.ObjectAcceleration, 0.025, 0.1, 6)
	end

	Gizmo.PushProperty("AlwaysOnTop", false)

	if DRAW_BOUNDING_BOX then
		Gizmo.PushProperty("Color3", ROOT_PART_BOUNDING_BOX_COLOR)
		Gizmo.Box:Draw(self.BoundingBoxCFrame, self.BoundingBoxSize, true)
	end

	if DRAW_ROOT_PART then
		Gizmo.PushProperty("Color3", ROOT_PART_BOUNDING_BOX_COLOR)
		Gizmo.Box:Draw(self.RootPart.CFrame, self.RootPart.Size, true)

		Gizmo.SetStyle(ROOT_PART_FILL_COLOR, 0.75, false)
		Gizmo.VolumeBox:Draw(self.RootPart.CFrame, self.RootPart.Size)

		Gizmo.PushProperty("Transparency", 0)
	end

	for i, Bone in pairs(self.Bones) do
		local BonePosition = Bone.Bone.TransformedWorldCFrame.Position
		local ParentBone = self.Bones[Bone.ParentIndex]

		Bone:DrawDebug(self, DRAW_CONTACTS, DRAW_PHYSICAL_BONE, DRAW_BONE, DRAW_AXIS_LIMITS, DRAW_ROTATION_LIMITS)

		if DRAW_PHYSICAL_BONE and i ~= 1 then
			Gizmo.PushProperty("Color3", LINE_CONNECTING_COLOR)
			Gizmo.Ray:Draw(ParentBone.Bone.TransformedWorldCFrame.Position, BonePosition)
		end
	end
	debug.profileend()
end

--- @client
--- @within SmartBone
--- @param Overlay ImOverlay
function Class:DrawOverlay(Overlay: ImOverlay)
	if Config.DEBUG_OVERLAY_TREE_INFO or Config.DEBUG_OVERLAY_TREE_OBJECTS then
		Overlay.Text("Root Part: " .. tostring(self.RootPart.Name))
		Overlay.Text("Root Bone: " .. tostring(self.Root.Name))
		Overlay.Text("Root Part Size: " .. tostring(string.format("%.3f, %.3f, %.3f", self.RootPart.Size.X, self.RootPart.Size.Y, self.RootPart.Size.Z)))
	end

	if Config.DEBUG_OVERLAY_TREE_INFO or Config.DEBUG_OVERLAY_TREE_NUMERICS then
		Overlay.Text("Update Rate: " .. tostring(string.format("%.3f", self.UpdateRate)))
		Overlay.Text("In View: " .. tostring(self.InView))
		Overlay.Text("Accumulated Delta: " .. tostring(string.format("%.3f", self.AccumulatedDelta)))
		Overlay.Text("Force: " .. tostring(string.format("%.3f, %.3f, %.3f", self.Force.X, self.Force.Y, self.Force.Z)))
	end

	local ROOT_BACKGROUND_COLOR = Color3.new(0.486275, 0.431373, 1.000000)
	local ROOT_TEXT_COLOR = Color3.new(1, 1, 1)

	if Config.DEBUG_OVERLAY_BONE then
		for i, Bone in pairs(self.Bones) do
			if Config.DEBUG_OVERLAY_MAX_BONES > 0 then
				if Config.DEBUG_OVERLAY_BONE_OFFSET + Config.DEBUG_OVERLAY_MAX_BONES <= i then
					break
				end
			end

			if Config.DEBUG_OVERLAY_BONE_OFFSET > i then
				continue
			end

			Overlay.Begin("Bone " .. tostring(i), ROOT_BACKGROUND_COLOR, ROOT_TEXT_COLOR)
			Bone:DrawOverlay(Overlay)
			Overlay.End()
		end
	end
end

function Class:Destroy()
	SB_VERBOSE_LOG("Destroy BoneTree")

	
	self.DestroyConnection:Disconnect()
	self.AttributeConnection:Disconnect()
	self.TagConnection:Disconnect()

	-- if self.Settings.MatchWorkspaceWind then
	-- 	self.GlobalWindConnection:Disconnect()
	-- else
	-- 	self.WindDirectionConnection:Disconnect()
	-- 	self.WindSpeedConnection:Disconnect()
	-- 	self.WindStrengthConnection:Disconnect()
	-- end

	for _, Bone in pairs(self.Bones) do
		Bone:Destroy()
	end

	setmetatable(self, nil)
	
end

return Class

end
loaders[node("Dependencies/Config")] = function(script, require)
-- Configuration

return {
	VERSION = "0.5.2",
	-- Controls if when an object is out of activation distance / fov if its bones should be sent back to their rest location.
	RESET_TRANSFORM_ON_SKIP = true,
	-- Wouldn't recommend enabling, controls if we should wait after each collider setup.
	YIELD_ON_COLLIDER_GATHER = false,
	-- Allows for debug tools out of studio
	ALLOW_LIVE_GAME_DEBUG = false,
	-- Maximum distance for field of view checks, if an object is out of this distance its skipped regardless of activation distance.
	FAR_PLANE = 500,
	-- Frequency of which we do frustum checks, 1 being every frame, 2 being every other frame, 3 being every 3rd frame and so on.
	FRUSTUM_FREQ = 2,
	-- Debug info in output, can lag the game.
	LOG_VERBOSE = false,
	-- Controls if we should reset bone positions when .Stop() is called
	RESET_BONE_ON_DESTROY = true,
	-- Enable or disable the startup print
	STARTUP_PRINT_ENABLED = true,
	-- Overlay config, not meant for end users
	DEBUG_OVERLAY_ENABLED = false, -- enable or disable when debug is enabled
	DEBUG_OVERLAY_TREE = true, -- enable tree debug
	DEBUG_OVERLAY_TREE_INFO = false,
	DEBUG_OVERLAY_TREE_OBJECTS = false,
	DEBUG_OVERLAY_TREE_NUMERICS = false,
	DEBUG_OVERLAY_TREE_OFFSET = 0, -- how offset into the roots we should be
	DEBUG_OVERLAY_MAX_TREES = 5, -- -1 for no max
	DEBUG_OVERLAY_BONE = true, -- enable bone debug info
	DEBUG_OVERLAY_BONE_OFFSET = 0, -- how offset into the bone tree we should be
	DEBUG_OVERLAY_MAX_BONES = -1, -- -1 for no max
	DEBUG_OVERLAY_BONE_INFO = false,
	DEBUG_OVERLAY_BONE_NUMERICS = false,
	DEBUG_OVERLAY_BONE_CONSTRAIN = false,
	DEBUG_OVERLAY_BONE_WELD = true,
	DEBUG_OVERLAY_BONE_FORCES = true,
}

end
loaders[node("Dependencies/DefaultObjectSettings")] = function(script, require)
local FORCE_MULTIPLIER = 0.2

return __sb2Freeze({
	Damping = 0.1,
	Stiffness = 0.2,
	Inertia = 0,
	Elasticity = 3,
	AnchorDepth = 0,

	AnchorsRotate = false,

	Constraint = "Spring",
	Force = Vector3.new(0, 1, 0) * FORCE_MULTIPLIER,
	Gravity = -Vector3.new(0, 1, 0) * 25,

	WindType = "Hybrid",
	MatchWorkspaceWind = false,
	WindInfluence = 1,
	WindStrength = 2,
	WindSpeed = 1,
	WindDirection = Vector3.new(1, 0, 0),

	UpdateRate = 60,
	ActivationDistance = 45,
	ThrottleDistance = 15,
})

end
loaders[node("Dependencies/Frustum")] = function(script, require)
--!native
local Dependencies = script.Parent
local Config = require(Dependencies:WaitForChild("Config"))
local Utilities = require(Dependencies:WaitForChild("Utilities"))

local Class = {}

function Class.GetCFrames(camera, distance)
	debug.profilebegin("Frustum")
	local cameraCFrame = camera.CFrame
	local cameraPos = cameraCFrame.Position
	local rightVec, upVec = cameraCFrame.RightVector, cameraCFrame.UpVector

	local distance2 = distance * 0.5
	local farPlaneHeight2 = math.tan(((camera.FieldOfView + 5) * 0.5) * 0.017453) * distance
	local farPlaneWidth2 = farPlaneHeight2 * (camera.ViewportSize.X / camera.ViewportSize.Y)
	local farPlaneCFrame = cameraCFrame * CFrame.new(0, 0, -distance)
	local farPlaneTopRight = farPlaneCFrame * Vector3.new(farPlaneWidth2, farPlaneHeight2, 0)
	local farPlaneBottomLeft = farPlaneCFrame * Vector3.new(-farPlaneWidth2, -farPlaneHeight2, 0)
	local farPlaneBottomRight = farPlaneCFrame * Vector3.new(farPlaneWidth2, -farPlaneHeight2, 0)

	local frustumCFrameInverse = (cameraCFrame * CFrame.new(0, 0, -distance2)):Inverse()

	local rightNormal = upVec:Cross(farPlaneBottomRight - cameraPos).Unit
	local leftNormal = upVec:Cross(farPlaneBottomLeft - cameraPos).Unit
	local topNormal = rightVec:Cross(cameraPos - farPlaneTopRight).Unit
	local bottomNormal = rightVec:Cross(cameraPos - farPlaneBottomRight).Unit
	debug.profileend()
	return frustumCFrameInverse, farPlaneWidth2, farPlaneHeight2, distance2, rightNormal, leftNormal, topNormal, bottomNormal, cameraCFrame
end

function Class.InViewFrustum(
	point,
	frustumCFrameInverse,
	farPlaneWidth2,
	farPlaneHeight2,
	distance2,
	rightNormal,
	leftNormal,
	topNormal,
	bottomNormal,
	cameraCf
)
	debug.profilebegin("Frustum")

	local cameraPos = cameraCf.Position

	-- Check if point lies outside frustum OBB
	local relativeToOBB = frustumCFrameInverse * point
	if
		relativeToOBB.X > farPlaneWidth2
		or relativeToOBB.X < -farPlaneWidth2
		or relativeToOBB.Y > farPlaneHeight2
		or relativeToOBB.Y < -farPlaneHeight2
		or relativeToOBB.Z > distance2
		or relativeToOBB.Z < -distance2
	then
		debug.profileend()
		return false
	end

	-- Check if point lies outside a frustum plane
	local lookToCell = point - cameraPos
	if rightNormal:Dot(lookToCell) < 0 or leftNormal:Dot(lookToCell) > 0 or topNormal:Dot(lookToCell) < 0 or bottomNormal:Dot(lookToCell) > 0 then
		debug.profileend()
		return false
	end

	debug.profileend()
	return true
end

function Class.ObjectInFrustum(
	Object,
	frustumCFrameInverse,
	farPlaneWidth2,
	farPlaneHeight2,
	distance2,
	rightNormal,
	leftNormal,
	topNormal,
	bottomNormal,
	cameraCFrame
)
	local CF = Object.CFrame
	local Size = Object.Size

	-- Allows for really big root parts to still be checked correctly
	local HalfFarPlane = Config.FAR_PLANE * 0.5
	local LinePosition = cameraCFrame.Position + (cameraCFrame.LookVector * HalfFarPlane)

	local Closest = Utilities.ClosestPointOnLine(LinePosition, cameraCFrame.LookVector, HalfFarPlane, CF.Position)
	local Inside, point = Utilities.ClosestPointInBox(CF, Size, Closest)

	if Inside then
		return true
	end

	if
		Class.InViewFrustum(
			point,
			frustumCFrameInverse,
			farPlaneWidth2,
			farPlaneHeight2,
			distance2,
			rightNormal,
			leftNormal,
			topNormal,
			bottomNormal,
			cameraCFrame
		)
	then
		return true
	end

	return false
end

return Class

end
loaders[node("Dependencies/Utilities")] = function(script, require)
local HttpService = game:GetService("HttpService")
local Config = require(script.Parent:WaitForChild("Config"))
local DefaultObjectSettings = require(script.Parent:WaitForChild("DefaultObjectSettings"))

local ColliderTranslations = {
	Block = "Box",
	Ball = "Sphere",
	Capsule = "Capsule",
	Sphere = "Sphere",
	Box = "Box",
	Cylinder = "Cylinder",
}

local function YAxisSafeUnit(Vector: Vector3): Vector3
	if Vector.Magnitude <= 1e-6 then
		return -Vector3.new(0, 1, 0)
	end

	return Vector.Unit
end

local module = {}
module.LogIndent = 0

function module.GetRotationBetween(U: Vector3, V: Vector3)
	local Cos = U:Dot(V)
	local Sin = U:Cross(V).Magnitude
	local Angle = math.atan2(Sin, Cos)
	local W = YAxisSafeUnit(U:Cross(V))

	-- Handle the case where U and V are parallel or anti-parallel
	if Sin < 1e-6 then
		if Cos > 0 then
			return CFrame.new()
		else
			local Perpendicular = (math.abs(U.X) > math.abs(U.Z)) and Vector3.new(-U.Y, U.X, 0) or Vector3.new(0, -U.Z, U.Y)
			return CFrame.fromAxisAngle(Perpendicular.Unit, math.pi)
		end
	end

	return CFrame.fromAxisAngle(W, Angle)
end

function module.GetCFrameAxis(Transform: CFrame, Axis: string)
	local X, Y, Z = Transform:ToEulerAnglesXYZ()
	if Axis == "X" then
		return X
	elseif Axis == "Y" then
		return Y
	elseif Axis == "Z" then
		return Z
	end
	return nil
end

function module.GatherObjectSettings(Object: BasePart)
	local Settings = {}

	local function Expect(Value: any, Type: string, Name: string): boolean
		if typeof(Value) ~= Type then
			warn("[SmartBone][Object] Expected attribute " .. tostring(Name) .. " on " .. tostring(Object.Name) .. " to be of type " .. tostring(Type) .. ", got type " .. tostring(typeof(Value)))
			return false
		end

		return true
	end

	for k, v in pairs(DefaultObjectSettings) do
		local Attrib = Object:GetAttribute(k)

		if Attrib ~= nil then
			if not Expect(Attrib, typeof(v), k) then
				Attrib = nil
			end
		end

		Settings[k] = Attrib == nil and v or Attrib
	end

	return Settings
end

function module.GatherBoneSettings(Bone: Bone)
	local function Attrib(Name: string): any?
		return Bone:GetAttribute(Name)
	end

	local function Expect(Value: any, Type: string, Name: string)
		if typeof(Value) ~= Type then
			warn("[SmartBone][Bone] Expected attribute " .. tostring(Name) .. " on " .. tostring(Bone.Name) .. " to be of type " .. tostring(Type) .. ", got type " .. tostring(typeof(Value)))
		end
	end

	local XAxisLocked = Attrib("XAxisLocked") or false
	local YAxisLocked = Attrib("YAxisLocked") or false
	local ZAxisLocked = Attrib("ZAxisLocked") or false

	local XAxisLimits = Attrib("XAxisLimits") or NumberRange.new(-math.huge, math.huge)
	local YAxisLimits = Attrib("YAxisLimits") or NumberRange.new(-math.huge, math.huge)
	local ZAxisLimits = Attrib("ZAxisLimits") or NumberRange.new(-math.huge, math.huge)

	local Radius = Attrib("Radius") or 0.25

	local RotationLimit = Attrib("RotationLimit") or 180

	local Force = Attrib("Force") or "В¬"
	local Gravity = Attrib("Gravity") or "В¬"

	Expect(XAxisLocked, "boolean", "XAxisLocked")
	Expect(YAxisLocked, "boolean", "YAxisLocked")
	Expect(ZAxisLocked, "boolean", "ZAxisLocked")

	Expect(XAxisLimits, "NumberRange", "XAxisLimits")
	Expect(YAxisLimits, "NumberRange", "YAxisLimits")
	Expect(ZAxisLimits, "NumberRange", "ZAxisLimits")

	Expect(Radius, "number", "Radius")
	Expect(RotationLimit, "number", "RotationLimit")

	if Force ~= "В¬" then
		Expect(Force, "Vector3", "Force")
	end

	if Force ~= "В¬" then
		Expect(Gravity, "Vector3", "Gravity")
	end

	local Settings = {
		AxisLocked = { XAxisLocked, YAxisLocked, ZAxisLocked },
		XAxisLimits = XAxisLimits,
		YAxisLimits = YAxisLimits,
		ZAxisLimits = ZAxisLimits,
		RotationLimit = RotationLimit,
		Radius = Radius,
		Force = Force,
		Gravity = Gravity,
	}

	return Settings
end

function module.ClosestPointOnLine(p0: Vector3, d0: Vector3, len: number, p1: Vector3): Vector3
	local v = p1 - p0
	local k = v:Dot(d0)
	k = math.clamp(k, -len, len)
	return p0 + d0 * k
end

-- IsInside, ClosestPoint, Normal
function module.ClosestPointInBox(cframe: CFrame, size: Vector3, point: Vector3): (boolean, Vector3, Vector3)
	local rel = cframe:PointToObjectSpace(point)
	local sx, sy, sz = size.X, size.X, size.Z
	local rx, ry, rz = rel.X, rel.Y, rel.Z

	if rel ~= rel or size ~= size then -- NaN
		return false, cframe.Position, Vector3.new(0, 1, 0)
	end

	-- constrain to within the box
	local cx = math.clamp(rx, -sx * 0.5, sx * 0.5)
	local cy = math.clamp(ry, -sy * 0.5, sy * 0.5)
	local cz = math.clamp(rz, -sz * 0.5, sz * 0.5)

	if not (cx == rx and cy == ry and cz == rz) then
		local closestPoint = cframe * Vector3.new(cx, cy, cz)
		local normal = (point - closestPoint).unit
		return false, closestPoint, normal
	end

	-- else, they are intersecting, find the surface the point is closest to

	local posX = rx - sx * 0.5
	local posY = ry - sy * 0.5
	local posZ = rz - sz * 0.5
	local negX = -rx - sx * 0.5
	local negY = -ry - sy * 0.5
	local negZ = -rz - sz * 0.5

	local max = math.max(posX, posY, posZ, negX, negY, negZ)
	if max == posX then
		local closestPoint = cframe * Vector3.new(sx * 0.5, ry, rz)
		return true, closestPoint, cframe.XVector
	elseif max == posY then
		local closestPoint = cframe * Vector3.new(rx, sy * 0.5, rz)
		return true, closestPoint, cframe.YVector
	elseif max == posZ then
		local closestPoint = cframe * Vector3.new(rx, ry, sz * 0.5)
		return true, closestPoint, cframe.ZVector
	elseif max == negX then
		local closestPoint = cframe * Vector3.new(-sx * 0.5, ry, rz)
		return true, closestPoint, -cframe.XVector
	elseif max == negY then
		local closestPoint = cframe * Vector3.new(rx, -sy * 0.5, rz)
		return true, closestPoint, -cframe.YVector
	elseif max == negZ then
		local closestPoint = cframe * Vector3.new(rx, ry, -sz * 0.5)
		return true, closestPoint, -cframe.ZVector
	end

	-- Shouldnt reach
	warn("CLOSEST POINT ON BOX FAIL")
	return false, Vector3.new(0, 0, 0), Vector3.new(0, 1, 0)
end

function module.GetCollider(Object: BasePart)
	-- Any shapes which arent defined in the translation table are defaulted to box

	local ColliderModule = Object:FindFirstChild("self.Collider")
	local ColliderDescription

	if ColliderModule and ColliderModule:IsA("ModuleScript") then
		local RawColliderData = require(ColliderModule)
		local ColliderData
		pcall(function()
			ColliderData = HttpService:JSONDecode(RawColliderData)
		end)

		ColliderDescription = ColliderData
	end

	if ColliderDescription then
		return ColliderDescription
	end

	-- Only runs if there was no collider module or the collider data wasn't valid json

	local function GetShapeName(obj)
		local ShapeAttribute = obj:GetAttribute("ColliderShape")

		if ShapeAttribute then
			return ShapeAttribute
		end

		if obj:IsA("Part") then -- Allow meshes and unions to have colliders
			return obj.Shape.Name
		end

		return "Box"
	end

	local ColliderType = ColliderTranslations[GetShapeName(Object)] or "Box"

	ColliderDescription = {
		{
			Type = ColliderType,
			ScaleX = 1,
			ScaleY = 1,
			ScaleZ = 1,
			OffsetX = 0,
			OffsetY = 0,
			OffsetZ = 0,
			RotationX = 0,
			RotationY = 0,
			RotationZ = 0,
		},
	}

	return ColliderDescription
end

function module.SB_INDENT_LOG()
	module.LogIndent += 1
end

function module.SB_UNINDENT_LOG()
	module.LogIndent -= 1
	module.LogIndent = math.max(module.LogIndent, 0)
end

function module.SB_ASSERT_CB(condition, callback, ...)
	if condition == false or condition == nil then
		callback(...)
	end
end

function module.SB_VERBOSE_LOG(message: string)
	if not Config.LOG_VERBOSE then
		return
	end

	local Indent = string.rep("    ", module.LogIndent)

	print(tostring(Indent) .. "[SmartBone][Log]: " .. tostring(message))
end

function module.SB_VERBOSE_WARN(message: string)
	if not Config.LOG_VERBOSE then
		return
	end

	local Indent = string.rep("    ", module.LogIndent)

	warn(tostring(Indent) .. "[SmartBone][Warn]: " .. tostring(message))
end

function module.SB_VERBOSE_ERROR(message: string)
	if not Config.LOG_VERBOSE then
		return
	end

	local Indent = string.rep("    ", module.LogIndent)

	error(tostring(Indent) .. "[SmartBone][Error]: " .. tostring(message))
end

return module

end
loaders[node("Components/Collision/Collider")] = function(script, require)
--!nocheck

local HttpService = game:GetService("HttpService")

local Dependencies = script.Parent.Parent.Parent:WaitForChild("Dependencies")
local CollisionSolvers = script.Parent:WaitForChild("Colliders")
local BoxSolver = require(CollisionSolvers:WaitForChild("Box"))
local CapsuleSolver = require(CollisionSolvers:WaitForChild("Capsule"))
local CylinderSolver = require(CollisionSolvers:WaitForChild("Cylinder"))
local SphereSolver = require(CollisionSolvers:WaitForChild("Sphere"))

local Utilities = require(script.Parent.Parent.Parent:WaitForChild("Dependencies"):WaitForChild("Utilities"))

local SB_VERBOSE_LOG = Utilities.SB_VERBOSE_LOG

local Radians = 0.017453
local Gizmo = require(Dependencies:WaitForChild("Debug"):WaitForChild("Gizmo"))

--- @class Collider
--- Internal class for colliders
--- : Caution:
--- Changes to the syntax in this class will not count to the major version in semver.
--- :::

--- @within Collider
--- @prop Type string

--- @within Collider
--- @prop Scale Vector3

--- @within Collider
--- @prop Offset Vector3

--- @within Collider
--- @prop Rotation Vector3

--- @within Collider
--- @prop PreviousScale Vector3

--- @within Collider
--- @prop PreviousOffset Vector3

--- @within Collider
--- @prop PreviousRotation Vector3

--- @within Collider
--- @private
--- @readonly
--- @prop m_Object BasePart

--- @within Collider
--- @prop InNarrowphase boolean

--- @within Collider
--- @prop ObjectConnection RBXScriptConnection

--- @within Collider
--- @prop Transform CFrame

--- @within Collider
--- @prop Size Vector3

--- @within Collider
--- @prop GUID string

local Class = {}
Class.__index = Class

--- @within Collider
function Class.new()
	local self = setmetatable({
		Type = "Box",
		Scale = Vector3.new(0, 0, 0),
		Offset = Vector3.new(0, 0, 0),
		Rotation = Vector3.new(0, 0, 0),
		Radius = 0,

		PreviousScale = Vector3.new(0, 0, 0),
		PreviousOffset = Vector3.new(0, 0, 0),
		PreviousRotation = Vector3.new(0, 0, 0),
		PreviousObjectPosition = Vector3.new(0, 0, 0),
		PreviousObjectRotation = Vector3.new(0, 0, 0),

		m_Object = nil,

		InNarrowphase = false,

		Transform = CFrame.new(),
		Size = Vector3.new(0, 0, 0),

		GUID = HttpService:GenerateGUID(false),
	}, Class)

	return self
end

--- @within Collider
--- @param Object BasePart
function Class:SetObject(Object: BasePart)
	self.m_Object = Object

	self:UpdateTransform()
end

--- @within Collider
function Class:UpdateTransform()
	debug.profilebegin("Update Transform")
	local Object = self.m_Object
	local ObjectCFrame = Object.CFrame
	local ObjectSize = Object.Size

	local Scale = self.Scale
	local Offset = self.Offset
	local Rotation = self.Rotation

	local ScaledOffset = ObjectSize * Offset
	local ScaledSize = ObjectSize * Scale

	local RotationCFrame = CFrame.Angles(Rotation.X * Radians, Rotation.Y * Radians, Rotation.Z * Radians)

	self.Transform = ObjectCFrame * CFrame.new(ScaledOffset) * RotationCFrame
	self.Size = ScaledSize
	self.Radius = math.sqrt((math.max(ScaledSize.X, ScaledSize.Y, ScaledSize.Z) * 0.5) ^ 2 * 2)
	debug.profileend()
end

--- @within Collider
--- @param Point Vector3
--- @param Radius number
--- @return Vector3 | nil -- Returns nil if specified collider shape is invalid
function Class:GetClosestPoint(Point, Radius)
	if self.m_Object == nil then
		return
	end

	self.InNarrowphase = false

	-- Broadphase influence detection
	local PointDistance = (Point - self.Transform.Position).Magnitude - Radius

	if PointDistance > self.Radius then
		return
	end

	debug.profilebegin("Narrowphase")

	self.InNarrowphase = true

	local Type = self.Type

	-- Determine which collision solver we should send this off to
	local IsInside, ClosestPoint, Normal

	if Type == "Box" then
		IsInside, ClosestPoint, Normal = BoxSolver(self.Transform, self.Size, Point, Radius)
	end

	if Type == "Capsule" then
		IsInside, ClosestPoint, Normal = CapsuleSolver(self.Transform, self.Size, Point, Radius)
	end

	if Type == "Sphere" then
		IsInside, ClosestPoint, Normal = SphereSolver(self.Transform, self.Size, Point, Radius)
	end

	if Type == "Cylinder" then
		IsInside, ClosestPoint, Normal = CylinderSolver(self.Transform, self.Size, Point, Radius)
	end

	debug.profileend()

	return IsInside, ClosestPoint, Normal
end

--- @within Collider
function Class:Step()
	debug.profilebegin("Collider")
	self:UpdateTransform()
	debug.profileend()
end

--- @within Collider
--- @param ColliderObject ColliderObject
--- @param FILL_COLLIDER boolean
--- @param SHOW_INFLUENCE boolean
--- @param SHOW_AWAKE boolean
--- @param SHOW_BROADPHASE boolean
function Class:DrawDebug(ColliderObject, FILL_COLLIDER, SHOW_INFLUENCE, SHOW_AWAKE, SHOW_BROADPHASE)
	local COLLIDER_COLOR = Color3.new(0.509803, 0.933333, 0.427450)
	local FILL_COLOR = Color3.new(0.901960, 0.784313, 0.513725)
	local SLEEP_COLOR = Color3.new(1, 0, 1)
	local BROADPHASE_COLOR = Color3.new(0, 1, 1)
	local INFLUENCE_COLOR = Color3.new(1, 0.3, 0.3)

	local Type = self.Type
	local Transform = self.Transform
	local Size = self.Size

	if not ColliderObject.m_Awake and SHOW_AWAKE then
		COLLIDER_COLOR = SLEEP_COLOR
	end

	if self.InNarrowphase == false and SHOW_BROADPHASE then
		FILL_COLOR = BROADPHASE_COLOR
	end

	if SHOW_INFLUENCE then
		Gizmo.SetStyle(INFLUENCE_COLOR, 0, false)
		Gizmo.Sphere:Draw(Transform, self.Radius, 25, 360)
	end

	if Type == "Box" then
		Gizmo.SetStyle(COLLIDER_COLOR, 0, false)
		Gizmo.Box:Draw(Transform, Size)

		if FILL_COLLIDER then
			Gizmo.SetStyle(FILL_COLOR, 0.75, false)
			Gizmo.VolumeBox:Draw(Transform, Size)
			Gizmo.PushProperty("Transparency", 0)
		end

		return
	end

	if Type == "Capsule" then
		local CapsuleRadius = (Size.Y < Size.Z and Size.Y or Size.Z) * 0.5
		local CapsuleLength = Size.X

		local TransformedTransform = Transform * CFrame.Angles(math.rad(90), -math.rad(90), 0)

		Gizmo.SetStyle(COLLIDER_COLOR, 0, false)
		Gizmo.Capsule:Draw(TransformedTransform, CapsuleRadius, CapsuleLength, 15)

		if FILL_COLLIDER then
			local Top = TransformedTransform.Position + TransformedTransform.UpVector * (CapsuleLength * 0.5)
			local Bottom = TransformedTransform.Position - TransformedTransform.UpVector * (CapsuleLength * 0.5)

			Gizmo.SetStyle(FILL_COLOR, 0.75, false)
			Gizmo.VolumeCylinder:Draw(Transform, CapsuleRadius, CapsuleLength)
			Gizmo.VolumeSphere:Draw(CFrame.new(Top), CapsuleRadius)
			Gizmo.VolumeSphere:Draw(CFrame.new(Bottom), CapsuleRadius)
			Gizmo.PushProperty("Transparency", 0)
		end

		return
	end

	if Type == "Sphere" then
		local Radius = math.min(Size.X, Size.Y, Size.Z) * 0.5

		Gizmo.SetStyle(COLLIDER_COLOR, 0, false)
		Gizmo.Sphere:Draw(Transform, Radius, 15, 360)

		if FILL_COLLIDER then
			Gizmo.SetStyle(FILL_COLOR, 0.75, false)
			Gizmo.VolumeSphere:Draw(Transform, Radius)
			Gizmo.PushProperty("Transparency", 0)
		end

		return
	end

	if Type == "Cylinder" then
		local Radius = (Size.Y < Size.Z and Size.Y or Size.Z) * 0.5

		Gizmo.SetStyle(COLLIDER_COLOR, 0, false)
		Gizmo.Cylinder:Draw(Transform * CFrame.Angles(0, 0, math.rad(90)), Radius, Size.X, 15)

		if FILL_COLLIDER then
			Gizmo.SetStyle(FILL_COLOR, 0.75, false)
			Gizmo.VolumeCylinder:Draw(Transform * CFrame.Angles(0, -math.rad(90), 0), Radius, Size.X, 0, 360)
			Gizmo.PushProperty("Transparency", 0)
		end

		return
	end
end

--- @within Collider
function Class:Destroy()
	SB_VERBOSE_LOG("Collider destroying, object: " .. tostring(self.m_Object))

	setmetatable(self, nil)
end

return Class

end
loaders[node("Components/Collision/ColliderObject")] = function(script, require)
local ColliderClass = require(script.Parent:WaitForChild("Collider"))
local Utilities = require(script.Parent.Parent.Parent:WaitForChild("Dependencies"):WaitForChild("Utilities"))

local SB_VERBOSE_LOG = Utilities.SB_VERBOSE_LOG
local SleepCycleInterval = 1 / 5

























--- @class ColliderObject
--- Internal class for collider
--- : Caution:
--- Changes to the syntax in this class will not count to the major version in semver.
--- :::

--- @within ColliderObject
--- @private
--- @readonly
--- @prop m_Object BasePart

--- @within ColliderObject
--- @readonly
--- @prop Destroyed boolean

--- @within ColliderObject
--- @readonly
--- @prop Colliders {}

local Class = {}
Class.__index = Class

--- @within ColliderObject
--- @param ColliderTable {[number]: {Type: string, ScaleX: number, ScaleY: number, ScaleZ: number, OffsetX: number, OffsetY: number, OffsetZ: number, RotationX: number, RotationY: number, RotationZ: number}}
--- @param Object BasePart
--- @return ColliderObject
function Class.new(ColliderTable: IColliderTable, Object: BasePart): IColliderObject
	local self = setmetatable({
		m_Object = Object,
		m_Awake = true,
		m_LastSleepCycle = 0,
		Destroyed = false,
		Colliders = {},
	}, Class)

	self:m_LoadColliderTable(ColliderTable)

	self.DestroyConnection = Object:GetPropertyChangedSignal("Parent"):Connect(function()
		if Object.Parent == nil then
			self.Destroyed = true
		end
	end)

	return self
end

--- @within ColliderObject
--- @private
--- @param Collider {Type: string, ScaleX: number, ScaleY: number, ScaleZ: number, OffsetX: number, OffsetY: number, OffsetZ: number, RotationX: number, RotationY: number, RotationZ: number}
function Class:m_LoadCollider(Collider: IRawCollider)
	local FormattedScale = Vector3.new(Collider.ScaleX, Collider.ScaleY, Collider.ScaleZ)
	local FormattedOffset = Vector3.new(Collider.OffsetX, Collider.OffsetY, Collider.OffsetZ)
	local FormattedRotation = Vector3.new(Collider.RotationX, Collider.RotationY, Collider.RotationZ)

	local ColliderSolver = ColliderClass.new()
	ColliderSolver.Scale = FormattedScale
	ColliderSolver.Offset = FormattedOffset
	ColliderSolver.Rotation = FormattedRotation
	ColliderSolver.Type = Collider.Type
	ColliderSolver:SetObject(self.m_Object)

	table.insert(self.Colliders, ColliderSolver)
end

--- @within ColliderObject
--- @private
--- @param ColliderTable {[number]: {Type: string, ScaleX: number, ScaleY: number, ScaleZ: number, OffsetX: number, OffsetY: number, OffsetZ: number, RotationX: number, RotationY: number, RotationZ: number}}
function Class:m_LoadColliderTable(ColliderTable: IColliderTable)
	for _, Collider in pairs(ColliderTable) do
		self:m_LoadCollider(Collider)
	end
end

-- Public

--- @within ColliderObject
--- @return BasePart
function Class:GetObject()
	return self.m_Object
end

--- @within ColliderObject
--- @param Point Vector3
--- @param Radius number -- Radius of bone
--- @return {[number]: {ClosestPoint: Vector3, Normal: Vector3}}
function Class:GetCollisions(Point, Radius)
	debug.profilebegin("ColliderObject")
	if not self.m_Object then
		debug.profileend()
		return {}
	end

	if #self.Colliders == 0 then
		debug.profileend()
		return {}
	end

	debug.profilebegin("Sleep Cycle")
	if os.clock() - self.m_LastSleepCycle >= SleepCycleInterval then -- Run sleep conditions every 5th of a second
		self.m_LastSleepCycle = os.clock()

		if self.m_Object.Parent ~= nil then -- If our object is not a descendant of workspace put it to sleep
			self.m_Awake = true
		else
			self.m_Awake = false
		end
	end
	debug.profileend()

	if not self.m_Awake then
		debug.profileend()
		return {}
	end

	local Collisions = {}

	debug.profilebegin("Determine Collisions")
	for _, Collider in pairs(self.Colliders) do
		debug.profilebegin("Determine collision")
		local IsInside, ClosestPoint, Normal = Collider:GetClosestPoint(Point, Radius)
		debug.profileend()

		if IsInside then
			table.insert(Collisions, { ClosestPoint = ClosestPoint, Normal = Normal })
		end
	end
	debug.profileend()
	debug.profileend()

	return Collisions
end

--- @within ColliderObject
function Class:Step()
	debug.profilebegin("ColliderObject")
	for _, Collider in pairs(self.Colliders) do
		Collider:Step()
	end
	debug.profileend()
end

--- @within ColliderObject
--- @param FILL_COLLIDERS boolean
--- @param SHOW_INFLUENCE boolean
--- @param SHOW_AWAKE boolean
--- @param SHOW_BROADPHASE boolean
function Class:DrawDebug(FILL_COLLIDERS, SHOW_INFLUENCE, SHOW_AWAKE, SHOW_BROADPHASE)
	for _, Collider in pairs(self.Colliders) do
		Collider:DrawDebug(self, FILL_COLLIDERS, SHOW_INFLUENCE, SHOW_AWAKE, SHOW_BROADPHASE)
		Collider.InNarrowphase = false
	end
end

--- @within ColliderObject
function Class:Destroy()
	
	SB_VERBOSE_LOG("Collider object destroying, object: " .. tostring(self.m_Object))

	self.DestroyConnection:Disconnect()

	if #self.Colliders ~= 0 then
		for _, Collider in pairs(self.Colliders) do
			Collider:Destroy()
		end
	end

	setmetatable(self, nil)
	
end

return Class

end
loaders[node("Components/Constraints/AxisConstraint")] = function(script, require)
local function SafeUnit(v3)
	if v3.Magnitude == 0 then
		return Vector3.new(0, 0, 0)
	end

	return v3.Unit
end

local inf = math.huge

return function(self, Position, LastPosition, RootCFrame)
	debug.profilebegin("Axis Constraint")
	local RootOffset = RootCFrame:Inverse() * Position

	local X = RootOffset.X
	local Y = RootOffset.Y
	local Z = RootOffset.Z

	local XLimit = self.XAxisLimits
	local YLimit = self.YAxisLimits
	local ZLimit = self.ZAxisLimits

	local XLock = self.AxisLocked[1] and 0 or 1
	local YLock = self.AxisLocked[2] and 0 or 1
	local ZLock = self.AxisLocked[3] and 0 or 1

	-- Most bones probably wont have an axis limit, this allows us to skip all the other stuff
	if XLimit.Min == -inf and XLimit.Max == inf and YLimit.Min == -inf and YLimit.Max == inf and ZLimit.Min == -inf and ZLimit.Max == inf then
		if XLock == 1 and YLock == 1 and ZLock == 1 then
			debug.profileend()
			return Position
		else
			return RootCFrame * Vector3.new(X * XLock, Y * YLock, Z * ZLock)
		end
	end

	-- If our radius is > than the diff between min and max
	-- We do this because its faster than math.min() ВЇ\_(гѓ„)_/ВЇ
	local XMin = XLimit.Min + self.Radius
	local XMax = XMin <= (XLimit.Max - self.Radius) and XLimit.Max - self.Radius or XMin

	local YMin = YLimit.Min + self.Radius
	local YMax = YMin <= (YLimit.Max - self.Radius) and YLimit.Max - self.Radius or YMin

	local ZMin = ZLimit.Min + self.Radius
	local ZMax = ZMin <= (ZLimit.Max - self.Radius) and ZLimit.Max - self.Radius or ZMin

	X = X < XMin and XMin or (X > XMax and XMax or X)
	Y = Y < YMin and YMin or (Y > YMax and YMax or Y)
	Z = Z < ZMin and ZMin or (Z > ZMax and ZMax or Z)

	X *= XLock
	Y *= YLock
	Z *= ZLock

	local WorldSpace = RootCFrame * Vector3.new(X, Y, Z)

	Position = WorldSpace

	local XAxis = RootCFrame.RightVector
	local YAxis = RootCFrame.UpVector
	local ZAxis = RootCFrame.LookVector

	local DifferenceDirection = SafeUnit(Position - LastPosition)

	-- Remove our velocity on the vectors we collided with, stops any weird jittering.
	if X ~= RootOffset.X then
		local Normal = XAxis:Dot(DifferenceDirection) < 0 and -XAxis or XAxis
		self:ClipVelocity(Position, Normal)
	end

	if Y ~= RootOffset.Y then
		local Normal = YAxis:Dot(DifferenceDirection) < 0 and -YAxis or YAxis
		self:ClipVelocity(Position, Normal)
	end

	if Z ~= RootOffset.Z then
		local Normal = ZAxis:Dot(DifferenceDirection) > 0 and -ZAxis or ZAxis
		self:ClipVelocity(Position, Normal)
	end
	debug.profileend()

	return Position
end

end
loaders[node("Components/Constraints/CollisionConstraint")] = function(script, require)
return function(self, Position, Colliders)
	debug.profilebegin("Collision Constraint")
	local Collisions = {}
	local HitParts = {}

	for _, Collider in pairs(Colliders) do
		local ColliderCollisions = Collider:GetCollisions(Position, self.Radius)

		if #ColliderCollisions > 0 then
			table.insert(HitParts, Collider:GetObject())
		end

		for _, Collision in pairs(ColliderCollisions) do
			table.insert(Collisions, Collision)
		end
	end

	for _, Collision in pairs(Collisions) do
		Position = Collision.ClosestPoint + (Collision.Normal * self.Radius)
		-- self:ClipVelocity(Position, Collision.Normal) -- This causes some weird glitching issues, not sure why tbh
	end

	self.CollisionsData = Collisions
	self.CollisionHits = HitParts
	debug.profileend()

	return Position
end

end
loaders[node("Components/Constraints/DistanceConstraint")] = function(script, require)
local function SafeUnit(v3)
	if v3.Magnitude == 0 then
		return Vector3.new(0, 0, 0)
	end

	return v3.Unit
end

return function(self, Position, BoneTree)
	debug.profilebegin("Distance Constraint")
	local ParentBone = BoneTree.Bones[self.ParentIndex]

	if ParentBone then
		local RestLength = self.FreeLength
		local BoneDirection = SafeUnit(Position - ParentBone.Position)

		local RestPosition = ParentBone.Position + (BoneDirection * RestLength)

		debug.profileend()
		return RestPosition
	end

	debug.profileend()
	return
end

end
loaders[node("Components/Constraints/FrictionConstraint")] = function(script, require)
return function(self, Position, LastPosition)
	local Alpha = 1 - self.Friction

	return LastPosition:Lerp(Position, Alpha)
end

end
loaders[node("Components/Constraints/RopeConstraint")] = function(script, require)
local function SafeUnit(v3)
	if v3.Magnitude == 0 then
		return Vector3.new(0, 0, 0)
	end

	return v3.Unit
end

return function(self, Position, BoneTree)
	debug.profilebegin("Rope Constraint")
	local ParentBone = BoneTree.Bones[self.ParentIndex]

	if ParentBone then
		local RestLength = self.FreeLength
		local BoneSub = (Position - ParentBone.Position)
		local BoneDirection = SafeUnit(BoneSub)
		local BoneDistance = BoneSub.Magnitude < RestLength and BoneSub.Magnitude or RestLength

		local RestPosition = ParentBone.Position + (BoneDirection * BoneDistance)

		debug.profileend()
		return RestPosition
	end

	debug.profileend()
	return
end

end
loaders[node("Components/Constraints/RotationConstraint")] = function(script, require)
local function SafeUnit(v3)
	if v3.Magnitude == 0 then
		return Vector3.new(0, 0, 0)
	end

	return v3.Unit
end

return function(self, Position, BoneTree)
	debug.profilebegin("Rotation Constraint")
	local ParentIndex = self.ParentIndex
	local ParentBone = BoneTree.Bones[ParentIndex]

	if not ParentBone then
		debug.profileend()
		return Position
	end

	local ParentBoneLimit = ParentBone.RotationLimit

	if ParentBoneLimit >= 180 then
		debug.profileend()
		return Position
	end

	local GrandParentBone = BoneTree.Bones[ParentBone.ParentIndex]

	if not GrandParentBone then
		debug.profileend()
		return Position
	end

	local ParentBonePosition = ParentBone.Position
	local DefaultDirection = SafeUnit(ParentBone.Position - GrandParentBone.Position)

	local DistanceToParent = (Position - ParentBonePosition).Magnitude
	local DirectionToSelf = SafeUnit(Position - ParentBonePosition)

	if ParentBoneLimit <= 0 then
		debug.profileend()
		return ParentBonePosition + DefaultDirection * DistanceToParent
	end

	local RotationLimit = math.rad(self.RotationLimit)
	local VectorAngle = math.acos(DefaultDirection:Dot(DirectionToSelf))
	local LimitedVector

	if VectorAngle >= RotationLimit then
		local Cross = SafeUnit(DefaultDirection:Cross(DirectionToSelf))
		LimitedVector = CFrame.fromAxisAngle(Cross, RotationLimit) * DefaultDirection
	else
		LimitedVector = DirectionToSelf
	end

	if LimitedVector ~= LimitedVector then -- Somewhat hacky fix
		LimitedVector = DefaultDirection
	end

	Position = ParentBonePosition + LimitedVector * DistanceToParent

	debug.profileend()
	return Position
end

end
loaders[node("Components/Constraints/SpringConstraint")] = function(script, require)
local function __sb2Rotation(cf) return cf - cf.Position end
--!native
return function(self, Position, RestPosition, BoneTree, Delta)
	debug.profilebegin("Spring Constraint")

	local Settings = BoneTree.Settings
	local Stiffness = Settings.Stiffness
	local Elasticity = Settings.Elasticity

	local ParentBone = BoneTree.Bones[self.ParentIndex]

	if ParentBone then
		local RestLength = self.FreeLength

		if Stiffness > 0 or Elasticity > 0 then
			local ParentBoneCFrame = CFrame.new(ParentBone.Position) * __sb2Rotation(ParentBone.TransformOffset)
			RestPosition = RestPosition or (ParentBoneCFrame * CFrame.new(self.LocalTransformOffset.Position)).Position

			local ElasticDifference = RestPosition - Position
			Position += ElasticDifference * (Elasticity * Delta)

			if Stiffness > 0 then
				local StiffDifference = RestPosition - Position
				local Length = StiffDifference.Magnitude
				local MaxLength = RestLength * (1 - Stiffness) * 2
				if Length > MaxLength then
					Position += StiffDifference * ((Length - MaxLength) / Length)
				end
			end
		end

		local Difference = ParentBone.Position - Position
		local Length = Difference.Magnitude
		if Length > 0 then
			Position += Difference * ((Length - RestLength) / Length)
		end
	end
	debug.profileend()

	return Position
end

end
loaders[node("Components/Collision/Colliders/Box")] = function(script, require)
local function SafeUnit(v3)
	if v3.Magnitude == 0 then
		return Vector3.new(0, 0, 0)
	end

	return v3.Unit
end

local function ClosestPointFunc(cframe, size, point)
	local rel = cframe:pointToObjectSpace(point)
	local sx, sy, sz = size.x, size.y, size.z
	local rx, ry, rz = rel.x, rel.y, rel.z

	-- constrain to within the box
	local cx = math.clamp(rx, -sx * 0.5, sx * 0.5)
	local cy = math.clamp(ry, -sy * 0.5, sy * 0.5)
	local cz = math.clamp(rz, -sz * 0.5, sz * 0.5)

	if not (cx == rx and cy == ry and cz == rz) then
		local closestPoint = cframe * Vector3.new(cx, cy, cz)
		local normal = SafeUnit(point - closestPoint)
		return false, closestPoint, normal
	end

	-- else, they are intersecting, find the surface the point is closest to

	local posX = rx - sx * 0.5
	local posY = ry - sy * 0.5
	local posZ = rz - sz * 0.5
	local negX = -rx - sx * 0.5
	local negY = -ry - sy * 0.5
	local negZ = -rz - sz * 0.5

	local max = math.max(posX, posY, posZ, negX, negY, negZ)
	if max == posX then
		local closestPoint = cframe * Vector3.new(sx * 0.5, ry, rz)
		return true, closestPoint, cframe.XVector
	elseif max == posY then
		local closestPoint = cframe * Vector3.new(rx, sy * 0.5, rz)
		return true, closestPoint, cframe.YVector
	elseif max == posZ then
		local closestPoint = cframe * Vector3.new(rx, ry, sz * 0.5)
		return true, closestPoint, cframe.ZVector
	elseif max == negX then
		local closestPoint = cframe * Vector3.new(-sx * 0.5, ry, rz)
		return true, closestPoint, -cframe.XVector
	elseif max == negY then
		local closestPoint = cframe * Vector3.new(rx, -sy * 0.5, rz)
		return true, closestPoint, -cframe.YVector
	elseif max == negZ then
		local closestPoint = cframe * Vector3.new(rx, ry, -sz * 0.5)
		return true, closestPoint, -cframe.ZVector
	end

	-- Shouldnt reach
	warn("CLOSEST POINT ON BOX FAIL")
	return false, cframe.Position, Vector3.new(0, 0, 0)
end

return function(BoxCFrame, BoxSize, Point, Radius) -- Sphere vs Box
	debug.profilebegin("Box Testing")
	local IsInside, ClosestPoint, Normal = ClosestPointFunc(BoxCFrame, BoxSize, Point)

	if IsInside then
		return IsInside, ClosestPoint, Normal
	end

	local DistanceToCp = (ClosestPoint - Point).Magnitude

	IsInside = (DistanceToCp < Radius)
	debug.profileend()
	return IsInside, ClosestPoint, Normal
end

end
loaders[node("Components/Collision/Colliders/Capsule")] = function(script, require)
--!native
local function SafeUnit(v3)
	if v3.Magnitude == 0 then
		return Vector3.new(0, 0, 0)
	end

	return v3.Unit
end

local function solve(p0, d0, len, p1)
	local v = p1 - p0
	local k = v:Dot(d0)
	k = math.clamp(k, -len, len)
	return p0 + d0 * k
end

local function ClosestPointFunc(cframe, length, radius, point)
	local l0 = solve(cframe.Position, cframe.UpVector, length * 0.5, point)

	local distance = (l0 - point).Magnitude
	local normal = SafeUnit(point - l0)
	local is_inside = (distance <= radius)

	return is_inside, l0 + (normal * radius), normal
end

return function(CapsuleCFrame, CapsuleSize, Point, Radius)
	debug.profilebegin("Capsule Testing")
	local CapsuleRadius = (CapsuleSize.Y < CapsuleSize.Z and CapsuleSize.Y or CapsuleSize.Z) * 0.5
	local CapsuleLength = CapsuleSize.X

	CapsuleCFrame *= CFrame.Angles(math.rad(90), -math.rad(90), 0) -- Optomize

	local IsInside, ClosestPoint, Normal = ClosestPointFunc(CapsuleCFrame, CapsuleLength, CapsuleRadius, Point)

	if IsInside then
		return IsInside, ClosestPoint, Normal
	end

	local DistanceToCp = (ClosestPoint - Point).Magnitude

	IsInside = (DistanceToCp < Radius)
	debug.profileend()
	return IsInside, ClosestPoint, Normal
end

end
loaders[node("Components/Collision/Colliders/Cylinder")] = function(script, require)
--!native
local function SafeUnit(v3)
	if v3.Magnitude == 0 then
		return Vector3.new(0, 0, 0)
	end

	return v3.Unit
end

local function solve(p0, d0, len, p1)
	local v = p1 - p0
	local k = v:Dot(d0)
	k = math.clamp(k, -len, len)
	return p0 + d0 * k, k
end

local function ProjectOnPlane(pos, normal, point)
	local d = point - pos
	local v_dot = d:Dot(normal)
	local v = point - v_dot * normal

	return v
end

local function ClosestPointFunc(cframe, size, point)
	local radius = (size.Y < size.Z and size.Y or size.Z) * 0.5
	local length = size.X * 0.5
	local l0, k = solve(cframe.Position, cframe.RightVector, length, point)

	local endPlane = cframe.Position + -cframe.RightVector * length
	local topPlane = cframe.Position + cframe.RightVector * length

	local endPlaneN = -cframe.RightVector
	local topPlaneN = cframe.RightVector

	local projEnd = ProjectOnPlane(endPlane, endPlaneN, point)
	local projTop = ProjectOnPlane(topPlane, topPlaneN, point)

	local function GetFinalProj(proj, o)
		local projDir = SafeUnit(proj - o)
		local projDistance = (proj - o).Magnitude
		return o + projDir * (projDistance < radius and projDistance or radius)
	end

	projEnd = GetFinalProj(projEnd, endPlane)
	projTop = GetFinalProj(projTop, topPlane)

	local radiusDistance = (l0 - point).Magnitude
	local radiusNormal = SafeUnit(point - l0)
	local radiusInside = (radiusDistance <= radius)
	local radiusPosition = l0 + (radiusNormal * radius)

	local d0 = (projTop - point).Magnitude
	local d1 = (projEnd - point).Magnitude
	local d2 = (radiusPosition - point).Magnitude

	local d = math.min(d0, d1, d2)

	if k == length or d == d0 then
		local dot = SafeUnit(point - projTop):Dot(topPlaneN)
		return dot < 0, projTop, topPlaneN
	elseif k == -length or d == d1 then
		local dot = SafeUnit(point - projEnd):Dot(endPlaneN)
		return dot < 0, projEnd, endPlaneN
	end

	return radiusInside, radiusPosition, radiusNormal
end

return function(CylinderCFrame, CylinderSize, Point, Radius) -- IsInside, PushPosition, PushNormal
	debug.profilebegin("Cylinder Testing")
	local IsInside, PushPosition, PushNormal = ClosestPointFunc(CylinderCFrame, CylinderSize, Point)

	if IsInside then
		return IsInside, PushPosition, PushNormal
	end

	local PointDistance = (PushPosition - Point).Magnitude

	IsInside = PointDistance < Radius
	debug.profileend()
	return IsInside, PushPosition, PushNormal
end

end
loaders[node("Components/Collision/Colliders/Sphere")] = function(script, require)
--!native
local function SafeUnit(v3)
	if v3.Magnitude == 0 then
		return Vector3.new(0, 0, 0)
	end

	return v3.Unit
end

local function ClosestPointFunc(position, radius, point)
	local distance = (position - point).Magnitude
	local normal = SafeUnit(point - position)
	local is_inside = (distance <= radius)

	return is_inside, position + (normal * radius), normal
end

return function(Sphere0Point, Sphere0Radius, Sphere1Point, Sphere1Radius)
	debug.profilebegin("Sphere Testing")
	Sphere0Point = Sphere0Point.Position
	Sphere0Radius = math.min(Sphere0Radius.X, Sphere0Radius.Y, Sphere0Radius.Z) * 0.5

	local IsInside, ClosestPoint, Normal = ClosestPointFunc(Sphere0Point, Sphere0Radius, Sphere1Point)

	if IsInside then
		return IsInside, ClosestPoint, Normal
	end

	local DistanceToCp = (ClosestPoint - Sphere1Point).Magnitude

	IsInside = (DistanceToCp < Sphere1Radius)
	debug.profileend()
	return IsInside, ClosestPoint, Normal
end

end
loaders[node("Components/Collision/Colliders/Triangle")] = function(script, require)
--[[

    !! THIS IS NOT MEANT TO BE USED AS A COLLIDER SOLVER, ITS MEANT TO BE USED IN OTHER COLLIDER SOLVERS !!

]]

--!native
local dot = Vector3.new().Dot
local cross = Vector3.new().Cross
local clamp = math.clamp

local function SafeUnit(v3)
	if v3.Magnitude == 0 then
		return Vector3.new(0, 0, 0)
	end

	return v3.Unit
end

local function ClosestPointOnLineSegment(A, B, P)
	local AB = B - A
	local t = dot(P - A, AB) / dot(AB, AB)
	return A + clamp(t, 0, 1) * AB
end

local function ProjectOnPlane(pos, normal, point)
	local d = point - pos
	local v_dot = d:Dot(normal)
	local v = point - v_dot * normal

	return v
end

local function SameSide(p1, p2, a, b)
	local cp1 = cross(b - a, p1 - a)
	local cp2 = cross(b - a, p2 - a)
	if dot(cp1, cp2) >= 0 then
		return true
	else
		return false
	end
end

local function PointInTriangle(p, a, b, c)
	if SameSide(p, a, b, c) and SameSide(p, b, a, c) and SameSide(p, c, a, b) then
		return true
	end

	return false
end

local function ClosestPointOnTri(v0, v1, v2, point) -- ClosestPoint, Normal
	debug.profilebegin("Triangle")
	local Edge0 = ClosestPointOnLineSegment(v0, v1, point)
	local Edge1 = ClosestPointOnLineSegment(v1, v2, point)
	local Edge2 = ClosestPointOnLineSegment(v2, v0, point)

	local Normal = SafeUnit(cross(v1 - v0, v2 - v0))
	local Center = (v0 + v1 + v2) * 0.3333
	local Projected = ProjectOnPlane(Center, Normal, point)

	if PointInTriangle(point, v0, v1, v2) then
		debug.profileend()
		return Projected, Normal
	end

	local d0 = (Edge0 - point).Magnitude
	local d1 = (Edge1 - point).Magnitude
	local d2 = (Edge2 - point).Magnitude

	local d = math.min(d0, d1, d2)

	if d == d0 then
		debug.profileend()
		return Edge0, Normal
	elseif d == d1 then
		debug.profileend()
		return Edge1, Normal
	elseif d == d2 then
		debug.profileend()
		return Edge2, Normal
	end

	debug.profileend()
	return point, Normal
end

return ClosestPointOnTri

end
local Core=require(root)
local configureVisibility=(function()
                                                                         
                                                                              
return function(Core, world, preview)
    local update = Core.m_UpdateViewFrustum
    function Core:m_UpdateViewFrustum()
        local camera = world.CurrentCamera
                                                                             
                                                                             
        if preview or not camera or camera.ViewportSize.X <= 0 or camera.ViewportSize.Y <= 0 then
            for _, tree in ipairs(self.BoneTrees) do
                tree.InView = true
            end
            return
        end
        update(self)
    end
end

end)()
configureVisibility(Core,workspace,true)
local colliderFactory=(function()
                                                                              
                                                                           
                                                                      
return function(collection, preview)
    local shapes = {Block="Box", Ball="Sphere", Box="Box", Sphere="Sphere", Capsule="Capsule", Cylinder="Cylinder"}
    local cached, refreshed = {}, -math.huge
    local function scope(object)
        local parent = object.Parent
        while parent do
            if parent:IsA("Model") then return parent end
            parent = parent.Parent
        end
    end
    return function(core, part)
        local elapsed = 0.5
        return function(dt)
            elapsed = elapsed + dt
            if elapsed < 0.5 then return end
            elapsed = 0
            local now = os.clock()
            if now - refreshed >= 0.5 then
                cached = collection:GetTagged("SmartCollider")
                refreshed = now
            end
            local wanted, count = {}, 0
            local owner, key = scope(part), part:GetAttribute("ColliderKey")
            for _, object in ipairs(cached) do
                local otherKey = object:GetAttribute("ColliderKey")
                local matches = key ~= nil and otherKey ~= nil and tostring(key) == tostring(otherKey)
                if key == nil then matches = otherKey == nil and owner ~= nil and scope(object) == owner end
                if preview then matches = matches and owner ~= nil and scope(object) == owner end
                if object ~= part and object.Parent and object:IsA("BasePart") and matches and count < 32 then
                    local shape = object:GetAttribute("ColliderShape")
                    if not shape and object:IsA("Part") then shape = object.Shape.Name end
                    wanted[object] = shapes[shape] or "Box"
                    count = count + 1
                end
            end
                                                                                
            for index = #core.ColliderObjects, 1, -1 do
                local collider = core.ColliderObjects[index]
                local object = collider:GetObject()
                local shape = wanted[object]
                if not shape or collider.Destroyed or collider.NyawingShape ~= shape then
                    table.remove(core.ColliderObjects, index)
                    collider:Destroy()
                else
                    wanted[object] = nil
                end
            end
            for object, shape in pairs(wanted) do
                core:LoadRawCollider({{Type=shape, ScaleX=1, ScaleY=1, ScaleZ=1,
                    OffsetX=0, OffsetY=0, OffsetZ=0, RotationX=0, RotationY=0, RotationZ=0}}, object)
                core.ColliderObjects[#core.ColliderObjects].NyawingShape = shape
            end
        end
    end
end

end)()(game:GetService("CollectionService"),true)
local adapt=(function()
                                                                                
                                                                                
return function(Core, frame, options)
    local adapter = {}
    function adapter.new(part, roots)
        local core = Core.new()
        local ok, message = pcall(function()
            for _, bone in ipairs(roots) do core:m_CreateBoneTree(part, bone) end
        end)
        if not ok then core:Destroy(); error(message) end
                                                                            
                                                                            
                                                                             
        local sourceMesh = part:IsA("MeshPart") and part.MeshId or part:GetAttribute("SmartBoneSourceMeshId")
        local meshId = type(sourceMesh)=="string" and (sourceMesh:match("[?&]id=(%d+)") or sourceMesh:match("(%d+)$"))
        if meshId == "992000000000093" then
            for _, tree in ipairs(core.BoneTrees) do
                tree.Settings.Gravity = Vector3.new(0, 0, 0)
                tree.Settings.Force = Vector3.new(0, 0, 0)
            end
        end
        local controller = {Settings = {}, ParticleTrees = core.BoneTrees,
            SupportsAnimatedBones = true, StepOnHeartbeat = true}
        controller.Settings.UpdateRate = part:GetAttribute("UpdateRate") or 60
        local refreshColliders = options and options.colliders and options.colliders(core, part)
        function controller:UpdateParameters() end
        function controller:UpdateBones(dt)
            if refreshColliders then refreshColliders(math.min(dt, 0.1)) end
                                                                              
                                                                             
            if options and options.preview then
                for _, tree in ipairs(core.BoneTrees) do
                    tree.InWorkspace = true
                    tree.Settings.ActivationDistance = 2000000
                    tree.Settings.ThrottleDistance = 1000000
                end
            end
            frame.FrameCounter = (frame.FrameCounter + 1) % 131072
                                                                               
            core:StepBoneTrees(math.min(dt, 0.1))
        end
                                                                                  
        function controller:TransformBones() end
        function controller:PreUpdate(tree)
                                                                              
                                                                             
            frame.FrameCounter = (frame.FrameCounter + 1) % 131072
            tree:PreUpdate(1 / 60)
        end
        function controller:ResetParticles(tree) tree:SkipUpdate(); tree:ApplyTransform() end
        function controller:Destroy() core:Destroy() end
        return controller
    end
    return adapter
end

end)()
return adapt(Core,shared,{preview=true,colliders=colliderFactory})
end
local function loadSolver(mode)
if mode=="v1-sync"then return loadSynchronizedV1()end
if mode=="v2-sync"then return(function()
                                                                             
                                                                            
                                                                                  
return function(loadNative)
    local module={}
    function module.new(part,roots)
                                                                             
                                                                           
                                                                          
        local copied=part:Clone()
        assert(copied,"SmartBone source is not cloneable")
        local proxy=Instance.new("Part")
        proxy.Size=part.Size;proxy.CFrame=part.CFrame
        proxy.Material=part.Material;proxy.CustomPhysicalProperties=part.CustomPhysicalProperties
        for name,value in pairs(part:GetAttributes())do proxy:SetAttribute(name,value)end
        if part:IsA("MeshPart")then proxy:SetAttribute("SmartBoneSourceMeshId",part.MeshId)end
        for _,child in ipairs(copied:GetChildren())do child.Parent=proxy end
        copied:Destroy()
        proxy.Name="SampledRootProxy";proxy.Archivable=false;proxy.Anchored=true
        proxy:SetAttribute("SmartBoneInternalProxy",true)
        proxy.Transparency=1;proxy.CanCollide=false;proxy.CastShadow=false
        pcall(function()proxy.CanTouch=false end)
        pcall(function()proxy.CanQuery=false end)
        local pairsByBone,mapping={},{}
        local function match(a,b)
            if a:IsA("Bone")then mapping[a]=b;pairsByBone[#pairsByBone+1]={real=a,proxy=b}end
                                                                               
                                                                       
            local children,used=b:GetChildren(),{}
            for _,child in ipairs(a:GetChildren())do
                local copy
                for _,candidate in ipairs(children)do
                    if not used[candidate]and candidate.ClassName==child.ClassName and candidate.Name==child.Name then copy=candidate;used[candidate]=true;break end
                end
                                                                              
                                                                              
                if child:IsA("Bone")or child:FindFirstChildWhichIsA("Bone",true)then
                    assert(copy,"Proxy bone hierarchy mismatch: "..child:GetFullName())
                end
                if copy then match(child,copy)end
            end
        end
        match(part,proxy)
        for _,pair in ipairs(pairsByBone)do
            pair.owned=false
            for _,root in ipairs(roots)do
                if pair.real==root or pair.real:IsDescendantOf(root)then pair.owned=true;break end
            end
        end
        for _,object in ipairs(proxy:GetDescendants())do
            if object:IsA("LuaSourceContainer")or object:IsA("JointInstance")or object:IsA("WeldConstraint")or object:IsA("Constraint")then object:Destroy()
            elseif object:IsA("ParticleEmitter")or object:IsA("Trail")or object:IsA("Beam")then object.Enabled=false end
        end
        local collection=game:GetService("CollectionService")
        for _,object in ipairs(proxy:GetDescendants())do collection:RemoveTag(object,"SmartBone");collection:RemoveTag(object,"SmartCollider")end
        collection:RemoveTag(proxy,"SmartBone");collection:RemoveTag(proxy,"SmartCollider")
        proxy.CFrame=part.CFrame;proxy.Parent=part.Parent
        local nativeRoots={};for _,bone in ipairs(roots)do nativeRoots[#nativeRoots+1]=assert(mapping[bone],"Missing proxy root")end
        local ok,native=pcall(function()return loadNative().new(proxy,nativeRoots)end)
        if not ok then proxy:Destroy();error(native)end
        local step,accumulated,previousInput=1/60,0,part.CFrame
        local previousAnimation,previousOutput,currentOutput,restFrames={},{},{},{}
        for _,pair in ipairs(pairsByBone)do
            previousAnimation[pair.real]=pair.real.Transform
            restFrames[pair.real]=pair.proxy.CFrame
            previousOutput[pair.real]=pair.proxy.CFrame;currentOutput[pair.real]=pair.proxy.CFrame
        end
        local controller={Settings=native.Settings,ParticleTrees=native.ParticleTrees,SupportsAnimatedBones=true,StepOnHeartbeat=true,OwnsInputReset=true}
                                                                              
                                                                           
        function controller:UpdateParameters(...)
            return native:UpdateParameters(...)
        end
        local changed=part.AttributeChanged:Connect(function(name)proxy:SetAttribute(name,part:GetAttribute(name))end)
        local removed=false
        local function reset(input)
            accumulated=0;proxy.CFrame=input;previousInput=input
                                                                              
                                                                        
            for _,pair in ipairs(pairsByBone)do
                pair.proxy.CFrame=restFrames[pair.real]
                pair.proxy.Transform=pair.real.Transform
            end
            for _,tree in ipairs(native.ParticleTrees)do
                native:PreUpdate(tree)
                for _,point in ipairs(tree.Bones)do
                    point.CalculatedWorldCFrame=point.AnimatedWorldCFrame
                    point.IsSkippingUpdates=false
                end
                native:ResetParticles(tree)
                for _,point in ipairs(tree.Bones)do point.LastPosition=point.Position end
                tree.ObjectPreviousPosition=input.Position
                tree.ObjectVelocity=Vector3.new();tree.ObjectAcceleration=Vector3.new();tree.AccumulatedDelta=0
            end
            for _,pair in ipairs(pairsByBone)do
                previousAnimation[pair.real]=pair.real.Transform
                previousOutput[pair.real]=pair.proxy.CFrame;currentOutput[pair.real]=pair.proxy.CFrame
            end
        end
        function controller:Present()
            if removed then return end
            local alpha=math.clamp(accumulated/step,0,1)
            for _,pair in ipairs(pairsByBone)do
                if pair.owned and pair.real.Parent then pair.real.CFrame=previousOutput[pair.real]:Lerp(currentOutput[pair.real],alpha)end
            end
        end
        function controller:UpdateBones(dt)
            if removed or not part.Parent then return end
            if type(dt)~="number"or dt~=dt or dt<=0 then return end
            local input=part.CFrame
            if dt>.1 or(input.Position-previousInput.Position).Magnitude>8 then reset(input);self:Present();return end
            local animation={};for _,pair in ipairs(pairsByBone)do animation[pair.real]=pair.real.Transform end
            local untilTick=step-accumulated
            accumulated=accumulated+dt
            while accumulated>=step-1e-10 do
                local t=math.clamp(untilTick/dt,0,1)
                proxy.CFrame=previousInput:Lerp(input,t)
                for _,pair in ipairs(pairsByBone)do pair.proxy.Transform=previousAnimation[pair.real]:Lerp(animation[pair.real],t)end
                native:UpdateBones(step)
                for _,pair in ipairs(pairsByBone)do
                    previousOutput[pair.real]=currentOutput[pair.real];currentOutput[pair.real]=pair.proxy.CFrame
                end
                accumulated=accumulated-step;untilTick=untilTick+step
            end
            previousInput=input;previousAnimation=animation
            self:Present()
        end
        function controller:TransformBones()end
        function controller:PreUpdate()reset(part.CFrame)end
        function controller:ResetParticles()end
        function controller:Destroy()
            if removed then return end;removed=true;changed:Disconnect();native:Destroy();proxy:Destroy()
        end
        return controller
    end
    return module
end

end)()(loadNativeSolver)end
return loadLegacySolver()
end
local controller,part,bones,lastPosition,solverMode
local function numbers(text)
    assert(type(text)=='string' and #text<10000)
    local out={};for token in string.gmatch(text,'[^,]+') do local n=tonumber(token);assert(n and n==n and math.abs(n)<10000);table.insert(out,n) end
    return out
end
local function configure(inertia,elasticity,windInfluence,windStrength,windSpeed,windAngle,stiffness,damping,rotationLimit,ribbonWind,ribbonDirection,capeMode,useGravity,ribbonSelection,selectedMode)
    assert(controller,'Start simulation first')
    local function number(value,default,low,high)
        if value==nil then value=default end
        assert(type(value)=='number' and value==value and value>=low and value<=high,'Invalid physics parameter')
        return value
    end
    local values={Inertia=number(inertia,0,0,1),Elasticity=number(elasticity,.5,0,solverMode=='v2-sync'and 12 or 1),
        WindInfluence=number(windInfluence,0,0,1),WindStrength=number(windStrength,1,0,10),
        WindSpeed=number(windSpeed,8,0,30),Stiffness=number(stiffness,part:GetAttribute('Stiffness'),0,1),
        Damping=number(damping,part:GetAttribute('Damping'),0,1),RotationLimit=number(rotationLimit,180,0,180)}
    part:SetAttribute('SmartBoneWindAnimation',ribbonWind==true)
    local rows={}
    for index,direction in (ribbonSelection or ''):gmatch('(%d+):([%a]+)')do
        local bone=bones[tonumber(index)]
        assert(bone and (direction=='mixed'or direction=='horizontal'or direction=='vertical'or direction=='depth'),'Invalid wave bone')
        rows[#rows+1]=bone.Name..':'..direction
    end
    part:SetAttribute('SmartBoneWindBones',selectedMode and table.concat(rows,',')or nil)
    part:SetAttribute('SmartBoneMotionMode',capeMode==true and 'cape'or '')
    part:SetAttribute('SmartBoneUseGravity',useGravity~=false)
    ribbonDirection=ribbonDirection or 'mixed'
    assert(ribbonDirection=='mixed'or ribbonDirection=='horizontal'or ribbonDirection=='vertical'or ribbonDirection=='depth','Invalid ribbon direction')
    part:SetAttribute('SmartBoneWindDirection',ribbonDirection)
    local angle=math.rad(number(windAngle,0,-180,180))
    values.WindDirection=vec(math.cos(angle),0,math.sin(angle))
    for name,value in pairs(values)do
        part:SetAttribute(name,value)
        if solverMode~='v2-sync'then controller:UpdateParameters(name,value)end
    end
    if solverMode=='v2-sync'then
        services.Lighting:SetAttribute('WindDirection',values.WindDirection)
        services.Lighting:SetAttribute('WindStrength',values.WindStrength)
        services.Lighting:SetAttribute('WindSpeed',values.WindSpeed)
        for _,bone in ipairs(bones)do bone:SetAttribute('RotationLimit',values.RotationLimit)end
    end
    return true
end
local function initialize(positionsText,parentsText,rotationsText,stiffness,damping,sizeX,sizeY,sizeZ,x,y,z,yaw,rotationLimit,orientationText,mode)
    if controller then controller:Destroy() end
    if part then part:Destroy()end
    local positions,parents,rotations=numbers(positionsText),numbers(parentsText),numbers(rotationsText)
    assert(#parents>=3 and #parents<=26 and #positions==#parents*3 and #rotations==#parents*9)
    part=make('MeshPart');part.Size=vec(sizeX,sizeY,sizeZ)
    part.Parent=workspace
    solverMode=mode or 'legacy';assert(solverMode=='legacy'or solverMode=='v1-sync'or solverMode=='v2-sync','Invalid solver')
                                                                                
                                                                                     
    part.CFrame=CFrame.new(x or 0,y or 0,z or 0)*CFrame.Angles(0,yaw or 0,0)
    if orientationText then local r=numbers(orientationText);assert(#r==9);part.CFrame=cf(part.Position,r)end
    part.attrs={Stiffness=math.clamp(stiffness,0,1),Damping=math.clamp(damping,0,1),WindInfluence=0,Inertia=0,UpdateRate=60}
    if rotationLimit ~= nil then
        assert(type(rotationLimit)=="number" and rotationLimit==rotationLimit and rotationLimit>=0 and rotationLimit<=180)
        part.attrs.RotationLimit=rotationLimit
    end
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
    if solverMode=='v2-sync'then
                                                                                
                                                                                
                                                                            
        for _,bone in ipairs(bones)do
            if bone.Parent:IsA('Bone')and not bone:FindFirstChildWhichIsA('Bone')then
                local length=(bone.WorldPosition-bone.Parent.WorldPosition).Magnitude
                if length>.00001 then
                    local tail=make('Bone');tail.Name='WorkshopSimulationTail';tail.Parent=bone
                    tail.WorldCFrame=bone.WorldCFrame+bone.WorldCFrame.UpVector*length
                end
            end
        end
    end
                                                                      
    local roots={}
    for i,parentIndex in ipairs(parents) do if parentIndex==0 then table.insert(roots,bones[i]) end end
    controller=loadSolver(solverMode).new(part,roots);controller.InRange=true
    for _,tree in ipairs(controller.ParticleTrees) do tree.ObjectPreviousPosition=part.Position end
    lastPosition=part.Position
    return #bones
end
local function step(dt,x,y,z,yaw,orientationText)
    assert(controller and dt==dt and dt>0 and dt<=(solverMode~='legacy'and 10 or .1))
    local position=vec(x,y,z)
    part.CFrame=CFrame.new(position)*CFrame.Angles(0,yaw,0)
    if orientationText then local r=numbers(orientationText);assert(#r==9);part.CFrame=cf(position,r)end
    if solverMode=='legacy'and(position-lastPosition).Magnitude>8 then
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
return {initialize=initialize,step=step,configure=configure}
