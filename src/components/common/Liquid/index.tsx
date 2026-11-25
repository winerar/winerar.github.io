import { CSSProperties, ReactNode, useEffect, useId, useRef } from "react"

interface ILiquidProps {
	children?: ReactNode
	className?: string
	/** Детерминированное «зерно» — разные карточки плавают и рябят по-разному */
	seed?: number
	/** Множитель силы эффекта (1 — карточки, меньше — мелкие элементы) */
	strength?: number
}

/**
 * Капля воды в невесомости.
 * - сама по себе медленно дрейфует и меняет форму (CSS);
 * - край струится за счёт SVG-шума (feTurbulence + feDisplacementMap);
 * - на курсор слегка тянется и пружинит, по клику расходится рябь.
 * Перетаскивать нельзя: смещение ограничено несколькими пикселями.
 */
const Liquid: React.FC<ILiquidProps> = ({
	children,
	className = "",
	seed = 0,
	strength = 1,
}) => {
	const rootRef = useRef<HTMLDivElement>(null)
	const innerRef = useRef<HTMLDivElement>(null)
	const surfaceRef = useRef<HTMLDivElement>(null)
	const svgRef = useRef<SVGSVGElement>(null)
	const dispRef = useRef<SVGFEDisplacementMapElement>(null)
	const filterId = `liquid-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`

	useEffect(() => {
		const root = rootRef.current
		const inner = innerRef.current
		const surface = surfaceRef.current
		const svg = svgRef.current
		const disp = dispRef.current
		if (!root || !inner || !surface || !svg || !disp) return

		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches

		// Пауза всей анимации, пока капля вне экрана
		const io = new IntersectionObserver(([entry]) => {
			const visible = entry.isIntersecting
			root.classList.toggle("is-visible", visible)
			if (visible && !reduce) svg.unpauseAnimations()
			else svg.pauseAnimations()
		})
		io.observe(root)
		if (reduce) {
			svg.pauseAnimations()
			return () => io.disconnect()
		}

		// --- пружинная физика ---
		const BASE_DISP = 16 * strength
		const MAX_SHIFT = 10 * strength // px — чтобы не было ощущения перетаскивания
		let x = 0,
			y = 0,
			vx = 0,
			vy = 0 // смещение к курсору
		let tx = 0,
			ty = 0
		let sq = 0,
			vsq = 0 // «сплющивание» (желе)
		let wobble = 0 // дополнительная рябь края
		let hover = 0,
			hoverTarget = 0
		let lastPx = 0,
			lastPy = 0,
			lastT = 0
		let raf = 0

		const tick = () => {
			// мягкая недодемпфированная пружина → капля колышется
			vx = (vx + (tx - x) * 0.05) * 0.86
			vy = (vy + (ty - y) * 0.05) * 0.86
			x += vx
			y += vy
			vsq = (vsq - sq * 0.09) * 0.88
			sq += vsq
			hover += (hoverTarget - hover) * 0.08
			wobble *= 0.95

			inner.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${(1 + sq).toFixed(4)}, ${(1 - sq).toFixed(4)})`
			disp.setAttribute(
				"scale",
				(
					BASE_DISP +
					(hover * 10 + wobble + Math.abs(sq) * 320) * strength
				).toFixed(2),
			)

			const settled =
				Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(vx) + Math.abs(vy) <
					0.02 &&
				Math.abs(sq) + Math.abs(vsq) < 0.0002 &&
				Math.abs(hoverTarget - hover) < 0.005 &&
				wobble < 0.05
			raf = settled ? 0 : requestAnimationFrame(tick)
		}
		const kick = () => {
			if (!raf) raf = requestAnimationFrame(tick)
		}

		const onMove = (e: PointerEvent) => {
			const r = inner.getBoundingClientRect()
			const nx = (e.clientX - r.left) / r.width
			const ny = (e.clientY - r.top) / r.height
			surface.style.setProperty("--mx", `${(nx * 100).toFixed(1)}%`)
			surface.style.setProperty("--my", `${(ny * 100).toFixed(1)}%`)
			tx = (nx - 0.5) * 2 * MAX_SHIFT
			ty = (ny - 0.5) * 2 * MAX_SHIFT

			// резкое движение курсора слегка возмущает поверхность
			const now = performance.now()
			if (lastT) {
				const dt = Math.max(16, now - lastT)
				const speed = Math.hypot(e.clientX - lastPx, e.clientY - lastPy) / dt
				wobble = Math.min(20, wobble + speed * 2)
				vsq += Math.max(
					-0.002,
					Math.min(
						0.002,
						((e.clientX - lastPx - (e.clientY - lastPy)) / dt) * 0.0012,
					),
				)
			}
			lastPx = e.clientX
			lastPy = e.clientY
			lastT = now
			kick()
		}
		const onEnter = () => {
			hoverTarget = 1
			vsq += 0.009
			lastT = 0
			kick()
		}
		const onLeave = () => {
			hoverTarget = 0
			tx = ty = 0
			vsq -= 0.007
			kick()
		}
		const onDown = (e: PointerEvent) => {
			const r = surface.getBoundingClientRect()
			const ripple = document.createElement("span")
			ripple.className = "liquid__ripple"
			const size = Math.max(r.width, r.height) * 1.2
			ripple.style.width = ripple.style.height = `${size}px`
			ripple.style.left = `${e.clientX - r.left - size / 2}px`
			ripple.style.top = `${e.clientY - r.top - size / 2}px`
			surface.appendChild(ripple)
			ripple.addEventListener("animationend", () => ripple.remove(), {
				once: true,
			})
			vsq += 0.022
			wobble = Math.min(30, wobble + 16)
			kick()
		}

		root.addEventListener("pointermove", onMove)
		root.addEventListener("pointerenter", onEnter)
		root.addEventListener("pointerleave", onLeave)
		root.addEventListener("pointerdown", onDown)
		return () => {
			io.disconnect()
			cancelAnimationFrame(raf)
			root.removeEventListener("pointermove", onMove)
			root.removeEventListener("pointerenter", onEnter)
			root.removeEventListener("pointerleave", onLeave)
			root.removeEventListener("pointerdown", onDown)
		}
	}, [strength])

	// разные периоды/фазы для каждой капли — без рандома, чтобы SSG совпадал с клиентом
	const style = {
		"--float-dur": `${11 + ((seed * 3.7) % 6)}s`,
		"--float-delay": `${-((seed * 2.3) % 9)}s`,
		"--morph-dur": `${14 + ((seed * 5.1) % 8)}s`,
		"--morph-delay": `${-((seed * 4.3) % 12)}s`,
		"--flow-dur": `${18 + ((seed * 2.9) % 10)}s`,
	} as CSSProperties

	return (
		<div ref={rootRef} className={`liquid ${className}`} style={style}>
			<div ref={innerRef} className="liquid__inner">
				<div className="liquid__body" style={{ filter: `url(#${filterId})` }} />
				<div ref={surfaceRef} className="liquid__surface" aria-hidden="true" />
				<div className="liquid__content">{children}</div>
				<svg
					ref={svgRef}
					className="liquid__svg"
					aria-hidden="true"
					focusable="false"
				>
					<filter id={filterId} x="-15%" y="-15%" width="130%" height="130%">
						<feTurbulence
							type="fractalNoise"
							baseFrequency="0.006 0.009"
							numOctaves={1}
							seed={seed + 1}
							result="noise"
						>
							<animate
								attributeName="baseFrequency"
								dur={`${16 + (seed % 5) * 2}s`}
								values="0.006 0.009;0.009 0.006;0.006 0.009"
								repeatCount="indefinite"
							/>
						</feTurbulence>
						<feDisplacementMap
							ref={dispRef}
							in="SourceGraphic"
							in2="noise"
							scale={16 * strength}
							xChannelSelector="R"
							yChannelSelector="G"
						/>
					</filter>
				</svg>
			</div>
		</div>
	)
}

export default Liquid
