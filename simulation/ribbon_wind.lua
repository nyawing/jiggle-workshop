-- Workshop-only experiment. Apply a travelling transverse force before V1's
-- existing constraints, never replace the solved pose or move the real handle.
return function(solver)
    local new,update=solver.new,solver.UpdateParticles
    function solver.new(part,roots)
        local controller=new(part,roots)
        controller.RibbonSource=part
        return controller
    end
    function solver:UpdateParticles(tree,delta,index)
        local enabled=self.RibbonSource:GetAttribute('WorkshopRibbonWind')==true
        local influence=self.Settings.WindInfluence
        if enabled then self.Settings.WindInfluence=0 end
        update(self,tree,delta,index)
        self.Settings.WindInfluence=influence
        if not enabled then tree.RibbonTime=0;return end
        -- V1 passes elapsed seconds multiplied by ten. This clock therefore
        -- follows fixed simulation ticks and is independent of rendering FPS.
        tree.RibbonTime=(tree.RibbonTime or 0)+delta/10
        local t=tree.RibbonTime
        local frame=self.RibbonSource.CFrame
        local direction=self.RibbonSource:GetAttribute('WorkshopRibbonDirection')or 'mixed'
        local gust=.75+.25*math.sin(t*.73)
        for _,point in ipairs(tree.Particles)do
            if point.ParentIndex>=1 and not point.Anchored then
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

