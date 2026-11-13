-- Shared synchronized input sampler. Never move a physical Handle/character:
-- the native solver runs on an invisible, detached clone and presents LOCAL
-- bone frames on the visible rig. Existing game controllers must not also own it.
return function(loadNative)
    local module={}
    function module.new(part,roots)
        -- Do not insert a second skinned MeshPart into the live avatar. Only
        -- the bone hierarchy is needed by the solver; rendering/attachment
        -- discovery must continue to see exactly one real accessory mesh.
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
            -- Clone does not guarantee GetChildren order. Match named siblings
            -- by class, retaining occurrence order for repeated names.
            local children,used=b:GetChildren(),{}
            for _,child in ipairs(a:GetChildren())do
                local copy
                for _,candidate in ipairs(children)do
                    if not used[candidate]and candidate.ClassName==child.ClassName and candidate.Name==child.Name then copy=candidate;used[candidate]=true;break end
                end
                -- CanTouch=false can remove an engine-owned TouchTransmitter.
                -- Only a missing bone-bearing branch invalidates the mapping.
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
        -- Keep the host controller contract. Native V2 reads live attributes;
        -- its adapter owns parameter compatibility, not the input sampler.
        function controller:UpdateParameters(...)
            return native:UpdateParameters(...)
        end
        local changed=part.AttributeChanged:Connect(function(name)proxy:SetAttribute(name,part:GetAttribute(name))end)
        local removed=false
        local function reset(input)
            accumulated=0;proxy.CFrame=input;previousInput=input
            -- Reset against the authored local rig at its NEW world position,
            -- never against a previously simulated/deformed world pose.
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
