import { ReactNode, useEffect, useId, useRef } from "react"
import { Drop, register, unregister, wake } from "./engine"

interface ILiquidProps {
	children?: ReactNode
	className?: string
	/** Детерминированное «зерно» — разные капли двигаются по-разному */
	seed?: number
	/** Множитель силы эффекта (1 — карточки, меньше — мелкие элементы) */
	strength?: number
}

const PAD = 40 // запас вокруг карточки, чтобы край мог выпячиваться

/**
 * Капля воды в невесомости с физикой поверхности (см. engine.ts).
 * Объём рисуется в SVG: линза, блик, каустика, кольца волн.
 * Перетаскивать нельзя — только локальные возмущения.
 */
const Liquid: React.FC<ILiquidProps> = ({
	children,
	className = "",
	seed = 0,
	strength = 1,
}) => {
	const rootRef = useRef<HTMLDivElement>(null)
	const innerRef = useRef<HTMLDivElement>(null)
	const shadowRef = useRef<HTMLDivElement>(null)
	const svgRef = useRef<SVGSVGElement>(null)
	const uid = useId().replace(/[^a-zA-Z0-9-]/g, "")
	const id = (name: string) => `lq-${uid}-${name}`

	useEffect(() => {
		const root = rootRef.current
		const inner = innerRef.current
		const shadow = shadowRef.current
		const svg = svgRef.current
		if (!root || !inner || !shadow || !svg) return
		const q = <T extends Element>(sel: string) => svg.querySelector(sel) as T

		const drop = new Drop(
			{
				inner,
				shadow,
				shape: q<SVGPathElement>(".liquid__shape"),
				glint: q<SVGEllipseElement>(".liquid__glint"),
				glintSmall: q<SVGEllipseElement>(".liquid__glint-small"),
				caustic: q<SVGEllipseElement>(".liquid__caustic"),
				flows: Array.from(
					svg.querySelectorAll<SVGCircleElement>(".liquid__flow"),
				),
				pointerLight: q<SVGCircleElement>(".liquid__pointer"),
				ripples: q<SVGGElement>(".liquid__ripples"),
				pad: PAD,
			},
			strength,
			seed,
		)

		const measure = () => {
			drop.resize(root.offsetWidth, root.offsetHeight)
			drop.render(performance.now() / 1000)
		}
		measure()
		root.classList.add("is-ready")

		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
		const ro = new ResizeObserver(measure)
		ro.observe(root)
		if (reduce) return () => ro.disconnect()

		register(drop)
		const io = new IntersectionObserver(([entry]) => {
			drop.visible = entry.isIntersecting
			if (drop.visible) wake()
		})
		io.observe(root)

		let lastT = 0
		const local = (e: PointerEvent): [number, number] => {
			const r = root.getBoundingClientRect()
			return [e.clientX - r.left, e.clientY - r.top]
		}
		const onMove = (e: PointerEvent) => {
			const now = performance.now()
			const [x, y] = local(e)
			drop.pointerMove(x, y, lastT ? (now - lastT) / 1000 : 0)
			lastT = now
		}
		const onLeave = () => {
			drop.pointerLeave()
			lastT = 0
		}
		const onDown = (e: PointerEvent) => {
			const [x, y] = local(e)
			drop.poke(x, y)
		}
		root.addEventListener("pointermove", onMove)
		root.addEventListener("pointerleave", onLeave)
		root.addEventListener("pointerdown", onDown)

		return () => {
			ro.disconnect()
			io.disconnect()
			unregister(drop)
			drop.destroy()
			root.removeEventListener("pointermove", onMove)
			root.removeEventListener("pointerleave", onLeave)
			root.removeEventListener("pointerdown", onDown)
		}
	}, [seed, strength])

	return (
		<div ref={rootRef} className={`liquid ${className}`}>
			<div ref={shadowRef} className="liquid__shadow" aria-hidden="true" />
			<div ref={innerRef} className="liquid__inner">
				<div className="liquid__fallback" aria-hidden="true" />
				<svg
					ref={svgRef}
					className="liquid__svg"
					style={{ inset: -PAD }}
					aria-hidden="true"
					focusable="false"
				>
					<defs>
						<path id={id("shape")} className="liquid__shape" d="" />
						<clipPath id={id("clip")}>
							<use href={`#${id("shape")}`} />
						</clipPath>
						{/* толща воды: светлее в центре линзы, темнее к краям */}
						<radialGradient id={id("body")} cx="0.38" cy="0.3" r="0.85">
							<stop offset="0" stopColor="#4a6788" stopOpacity="0.62" />
							<stop offset="0.55" stopColor="#243345" stopOpacity="0.84" />
							<stop offset="1" stopColor="#141c29" stopOpacity="0.94" />
						</radialGradient>
						{/* ободок: френелевское отражение сверху-слева и розовый контровой свет снизу */}
						<linearGradient id={id("rim")} x1="0" y1="0" x2="1" y2="1">
							<stop offset="0" stopColor="#fff" stopOpacity="0.75" />
							<stop offset="0.3" stopColor="#fff" stopOpacity="0.12" />
							<stop offset="0.65" stopColor="#fff" stopOpacity="0.02" />
							<stop offset="1" stopColor="#ff0183" stopOpacity="0.55" />
						</linearGradient>
						{/* внутренний отсвет у нижнего края — свет, прошедший сквозь толщу */}
						<linearGradient id={id("inner")} x1="0" y1="0" x2="0.35" y2="1">
							<stop offset="0" stopColor="#acbdd2" stopOpacity="0.1" />
							<stop offset="0.5" stopColor="#ff0183" stopOpacity="0" />
							<stop offset="1" stopColor="#ff0183" stopOpacity="0.32" />
						</linearGradient>
						<radialGradient id={id("f0")}>
							<stop offset="0" stopColor="#ff0183" stopOpacity="0.16" />
							<stop offset="1" stopColor="#ff0183" stopOpacity="0" />
						</radialGradient>
						<radialGradient id={id("f1")}>
							<stop offset="0" stopColor="#acbdd2" stopOpacity="0.12" />
							<stop offset="1" stopColor="#acbdd2" stopOpacity="0" />
						</radialGradient>
						<radialGradient id={id("f2")}>
							<stop offset="0" stopColor="#5b7ea8" stopOpacity="0.28" />
							<stop offset="1" stopColor="#5b7ea8" stopOpacity="0" />
						</radialGradient>
						<radialGradient id={id("ptr")}>
							<stop offset="0" stopColor="#fff" stopOpacity="0.13" />
							<stop offset="1" stopColor="#fff" stopOpacity="0" />
						</radialGradient>
						<radialGradient id={id("glint")}>
							<stop offset="0" stopColor="#fff" stopOpacity="0.9" />
							<stop offset="0.5" stopColor="#fff" stopOpacity="0.45" />
							<stop offset="1" stopColor="#fff" stopOpacity="0" />
						</radialGradient>
						<radialGradient id={id("caustic")}>
							<stop offset="0" stopColor="#ff8cc6" stopOpacity="0.55" />
							<stop offset="0.6" stopColor="#ff0183" stopOpacity="0.18" />
							<stop offset="1" stopColor="#ff0183" stopOpacity="0" />
						</radialGradient>
					</defs>

					<use href={`#${id("shape")}`} fill={`url(#${id("body")})`} />
					<g clipPath={`url(#${id("clip")})`}>
						<circle className="liquid__flow" r="0" fill={`url(#${id("f0")})`} />
						<circle className="liquid__flow" r="0" fill={`url(#${id("f1")})`} />
						<circle className="liquid__flow" r="0" fill={`url(#${id("f2")})`} />
						<circle
							className="liquid__pointer"
							r="170"
							fill={`url(#${id("ptr")})`}
						/>
						<g fill="none" stroke={`url(#${id("inner")})`}>
							<use href={`#${id("shape")}`} strokeWidth="34" opacity="0.35" />
							<use href={`#${id("shape")}`} strokeWidth="18" opacity="0.5" />
							<use href={`#${id("shape")}`} strokeWidth="7" opacity="0.7" />
						</g>
						<ellipse
							className="liquid__caustic"
							fill={`url(#${id("caustic")})`}
						/>
						<g className="liquid__ripples" />
					</g>
					<use
						href={`#${id("shape")}`}
						fill="none"
						stroke={`url(#${id("rim")})`}
						strokeWidth="1.6"
					/>
					<ellipse className="liquid__glint" fill={`url(#${id("glint")})`} />
					<ellipse className="liquid__glint-small" fill="#fff" opacity="0.85" />
				</svg>
				<div className="liquid__content">{children}</div>
			</div>
		</div>
	)
}

export default Liquid
