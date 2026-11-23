local workshopLagRoots,workshopLagBack={},nil
local function applyWorkshopWalkLag(tree)
    if not workshopLagBack or not tree.Root or not workshopLagRoots[tree.Root.Name] then return end
    -- Смещаем только выбранную цепочку. Длину звеньев и контакты
    -- обрабатывает основной солвер.
    local advance=-tree.ObjectMove:Dot(workshopLagBack)
    if advance<=0 then return end
    local offset=workshopLagBack*math.min(.022,advance*.08)
    for _,point in ipairs(tree.Particles) do
        if point.ParentIndex>=1 and not point.Anchored then
            point.Position=point.Position+offset
        end
    end
end
