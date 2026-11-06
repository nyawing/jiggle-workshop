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
