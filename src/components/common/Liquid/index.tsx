import { ReactNode, useEffect, useId, useRef } from "react"
import { Silicone, getLensMap, register, unregister, wake } from "./engine"

interface ILiquidProps {
	children?: ReactNode
	className?: string
	/** Оставлен для совместимости вызовов */
	seed?: number
	/** Множитель силы деформации (1 — карточки, меньше — мелкие элементы) */
	strength?: number
}

const PAD = 80 // запас вокруг компонента, чтобы материал мог тянуться наружу

/**
 * Прозрачный силикон: в покое ровная плита, при нажатии и протягивании
 * мнётся, тянется и упруго возвращается (физика — engine.ts).
 * Перемещать компонент нельзя — только деформировать.
 */
const Liquid: React.FC<ILiquidProps> = ({
	children,
	className = "",
	strength = 1,
}) => {
	const rootRef = useRef<HTMLDivElement>(null)
	const innerRef = useRef<HTMLDivElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)
	const shadowRef = useRef<HTMLDivElement>(null)
	const svgRef = useRef<SVGSVGElement>(null)
	const uid = useId().replace(/[^a-zA-Z0-9-]/g, "")
	const id = (name: string) => `si-${uid}-${name}`

	useEffect(() => {
		const root = rootRef.current
		const inner = innerRef.current
		const content = contentRef.current
		const shadow = shadowRef.current
		const svg = svgRef.current
		if (!root || !inner || !content || !shadow || !svg) return
		const q = <T extends Element>(sel: string) => svg.querySelector(sel) as T

		const lens = q<SVGFEImageElement>(".liquid__lens")
		lens.setAttribute("href", getLensMap())

		const item = new Silicone(
			{
				inner,
				content,
				shadow,
				shape: q<SVGPathElement>(".liquid__shape"),
				glint: q<SVGEllipseElement>(".liquid__glint"),
				sparkle: q<SVGEllipseElement>(".liquid__sparkle"),
				edgeGlow: q<SVGEllipseElement>(".liquid__edge-glow"),
				sheen: q<SVGCircleElement>(".liquid__sheen"),
				dimple: q<SVGGElement>(".liquid__dimple"),
				lens,
				lensMap: q<SVGFEDisplacementMapElement>(".liquid__lens-map"),
				lensFilterId: id("lens"),
				pad: PAD,
			},
			strength,
		)

		const measure = () => {
			item.resize(root.offsetWidth, root.offsetHeight)
			// толщина преломлённой кромки зависит от размера (узкие строки — тоньше)
			const k = Math.min(1, Math.min(root.offsetWidth, root.offsetHeight) / 150)
			svg.querySelectorAll<SVGUseElement>(".liquid__band").forEach((el) => {
				el.setAttribute(
					"stroke-width",
					(Number(el.dataset.w) * Math.max(0.35, k)).toFixed(1),
				)
			})
			item.render()
		}
		measure()
		root.classList.add("is-ready")

		const ro = new ResizeObserver(measure)
		ro.observe(root)
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
		if (reduce) return () => ro.disconnect()

		register(item)
		const io = new IntersectionObserver(([entry]) => {
			item.visible = entry.isIntersecting
		})
		io.observe(root)

		const local = (e: PointerEvent): [number, number] => {
			const r = root.getBoundingClientRect()
			return [e.clientX - r.left, e.clientY - r.top]
		}
		let wasDragged = false
		let pressed = false
		let downX = 0
		let downY = 0

		const onMove = (e: PointerEvent) => {
			// протянули дальше порога — после отпускания клик не считается
			if (pressed && Math.hypot(e.clientX - downX, e.clientY - downY) > 8)
				wasDragged = true
			item.pointerMove(...local(e))
			wake()
		}
		const onLeave = () => {
			item.pointerLeave()
			wake()
		}
		const onUp = () => {
			pressed = false
			item.pointerUp()
			root.classList.remove("is-pressed")
			window.removeEventListener("pointermove", onMove)
			window.removeEventListener("pointerup", onUp)
			window.removeEventListener("pointercancel", onUp)
			root.addEventListener("pointermove", onMove)
			wake()
		}
		const onDown = (e: PointerEvent) => {
			if (e.button !== 0) return
			// мышь: не выделять текст при протягивании (клики по ссылкам работают)
			if (e.pointerType === "mouse") e.preventDefault()
			wasDragged = false
			pressed = true
			downX = e.clientX
			downY = e.clientY
			item.pointerDown(...local(e))
			root.classList.add("is-pressed")
			// пока палец зажат, следим за ним и за пределами компонента
			root.removeEventListener("pointermove", onMove)
			window.addEventListener("pointermove", onMove)
			window.addEventListener("pointerup", onUp)
			window.addEventListener("pointercancel", onUp)
			wake()
		}
		// если материал тянули — это не клик по ссылке
		const onClick = (e: MouseEvent) => {
			if (wasDragged) {
				e.preventDefault()
				e.stopPropagation()
				wasDragged = false
			}
		}

		root.addEventListener("pointermove", onMove)
		root.addEventListener("pointerleave", onLeave)
		root.addEventListener("pointerdown", onDown)
		root.addEventListener("click", onClick, true)

		return () => {
			ro.disconnect()
			io.disconnect()
			unregister(item)
			root.removeEventListener("pointermove", onMove)
			root.removeEventListener("pointerleave", onLeave)
			root.removeEventListener("pointerdown", onDown)
			root.removeEventListener("click", onClick, true)
			window.removeEventListener("pointermove", onMove)
			window.removeEventListener("pointerup", onUp)
			window.removeEventListener("pointercancel", onUp)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [strength])

	const url = (name: string) => `url(#${id(name)})`
	const shape = `#${id("shape")}`

	return (
		<div ref={rootRef} className={`liquid ${className}`}>
			<div ref={shadowRef} className="liquid__shadow" aria-hidden="true" />
			<div ref={innerRef} className="liquid__inner">
				<div className="liquid__fallback" aria-hidden="true" />
				<svg
					ref={svgRef}
					className="liquid__svg"
					style={{
						inset: -PAD,
						width: `calc(100% + ${PAD * 2}px)`,
						height: `calc(100% + ${PAD * 2}px)`,
					}}
					aria-hidden="true"
					focusable="false"
				>
					<defs>
						<path id={id("shape")} className="liquid__shape" d="" />
						<clipPath id={id("clip")}>
							<use href={shape} />
						</clipPath>

						{/* толща силикона: прозрачная, чуть светлее сверху */}
						<linearGradient id={id("body")} x1="0" y1="0" x2="0.15" y2="1">
							<stop offset="0" stopColor="#9fb6d3" stopOpacity="0.2" />
							<stop offset="0.45" stopColor="#2b3d54" stopOpacity="0.42" />
							<stop offset="1" stopColor="#18222f" stopOpacity="0.58" />
						</linearGradient>
						{/* внешняя кромка: отражение света сверху-слева, розовый отсвет снизу */}
						<linearGradient id={id("rim")} x1="0" y1="0" x2="0.6" y2="1">
							<stop offset="0" stopColor="#fff" stopOpacity="0.8" />
							<stop offset="0.35" stopColor="#fff" stopOpacity="0.18" />
							<stop offset="0.7" stopColor="#fff" stopOpacity="0.05" />
							<stop offset="1" stopColor="#ff4fa8" stopOpacity="0.5" />
						</linearGradient>
						<radialGradient id={id("glint")}>
							<stop offset="0" stopColor="#fff" stopOpacity="0.85" />
							<stop offset="0.45" stopColor="#fff" stopOpacity="0.35" />
							<stop offset="1" stopColor="#fff" stopOpacity="0" />
						</radialGradient>
						<radialGradient id={id("edge")}>
							<stop offset="0" stopColor="#ff7cc0" stopOpacity="0.55" />
							<stop offset="0.6" stopColor="#ff0183" stopOpacity="0.16" />
							<stop offset="1" stopColor="#ff0183" stopOpacity="0" />
						</radialGradient>
						<radialGradient id={id("sheen")}>
							<stop offset="0" stopColor="#fff" stopOpacity="0.1" />
							<stop offset="1" stopColor="#fff" stopOpacity="0" />
						</radialGradient>
						{/* вмятина: общая тень, затенённая и освещённая стенки, блик на дне */}
						<radialGradient id={id("dent")}>
							<stop offset="0" stopColor="#0a1019" stopOpacity="0.3" />
							<stop offset="0.7" stopColor="#0a1019" stopOpacity="0.08" />
							<stop offset="1" stopColor="#0a1019" stopOpacity="0" />
						</radialGradient>
						<radialGradient id={id("dentDark")}>
							<stop offset="0.5" stopColor="#05090f" stopOpacity="0.3" />
							<stop offset="1" stopColor="#05090f" stopOpacity="0" />
						</radialGradient>
						<radialGradient id={id("dentLight")}>
							<stop offset="0.55" stopColor="#fff" stopOpacity="0" />
							<stop offset="0.8" stopColor="#fff" stopOpacity="0.16" />
							<stop offset="1" stopColor="#fff" stopOpacity="0" />
						</radialGradient>

						{/* преломление содержимого под вмятиной */}
						<filter
							id={id("lens")}
							x="0"
							y="0"
							width="1"
							height="1"
							primitiveUnits="userSpaceOnUse"
							colorInterpolationFilters="sRGB"
						>
							<feFlood floodColor="rgb(128,128,0)" result="neutral" />
							<feImage
								className="liquid__lens"
								preserveAspectRatio="none"
								result="map"
							/>
							<feComposite
								in="map"
								in2="neutral"
								operator="over"
								result="dmap"
							/>
							<feDisplacementMap
								className="liquid__lens-map"
								in="SourceGraphic"
								in2="dmap"
								scale="0"
								xChannelSelector="R"
								yChannelSelector="G"
							/>
						</filter>
					</defs>

					<use href={shape} fill={url("body")} />
					<g clipPath={url("clip")}>
						{/* преломлённая тёмная кромка и внутреннее отражение у края */}
						<use
							className="liquid__band"
							data-w="48"
							href={shape}
							fill="none"
							stroke="#0b121c"
							strokeWidth="48"
							opacity="0.07"
						/>
						<use
							className="liquid__band"
							data-w="36"
							href={shape}
							fill="none"
							stroke="#0b121c"
							strokeWidth="36"
							opacity="0.08"
						/>
						<use
							className="liquid__band"
							data-w="26"
							href={shape}
							fill="none"
							stroke="#0b121c"
							strokeWidth="26"
							opacity="0.09"
						/>
						<use
							className="liquid__band"
							data-w="17"
							href={shape}
							fill="none"
							stroke="#0b121c"
							strokeWidth="17"
							opacity="0.1"
						/>
						<use
							className="liquid__band"
							data-w="9"
							href={shape}
							fill="none"
							stroke="#0b121c"
							strokeWidth="9"
							opacity="0.1"
						/>
						<use
							className="liquid__band"
							data-w="6"
							href={shape}
							fill="none"
							stroke="#fff"
							strokeWidth="6"
							opacity="0.12"
						/>
						<ellipse className="liquid__edge-glow" fill={url("edge")} />
						<circle className="liquid__sheen" r="160" fill={url("sheen")} />
						<g className="liquid__dimple">
							<ellipse rx="78" ry="78" fill={url("dent")} />
							<ellipse
								cx="-12"
								cy="-12"
								rx="52"
								ry="52"
								fill={url("dentDark")}
							/>
							<ellipse
								cx="10"
								cy="10"
								rx="50"
								ry="50"
								fill={url("dentLight")}
							/>
							<ellipse
								cx="-14"
								cy="-20"
								rx="16"
								ry="5"
								fill={url("glint")}
								transform="rotate(-35 -14 -20)"
							/>
						</g>
					</g>
					<use href={shape} fill="none" stroke={url("rim")} strokeWidth="1.3" />
					<ellipse className="liquid__glint" fill={url("glint")} />
					<ellipse className="liquid__sparkle" fill="#fff" opacity="0.9" />
				</svg>
				<div ref={contentRef} className="liquid__content">
					{children}
				</div>
			</div>
		</div>
	)
}

export default Liquid
