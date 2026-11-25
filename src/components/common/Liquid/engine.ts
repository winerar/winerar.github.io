/**
 * Физика «прозрачного силикона».
 *
 * В покое компонент — ровный скруглённый прямоугольник. Контур — N точек,
 * у каждой есть двумерное смещение o = (ox, oy) от исходного положения:
 *
 *   o'' = K·(target − o) + T·(o[i−1] + o[i+1] − 2·o[i]) − C·o'
 *
 *   K — упругость материала (тянет к исходной форме)
 *   T — связность: соседние участки деформируются вместе, без «ряби»
 *   C — вязкость: после отпускания 1–2 затухающих колебания, как у силикона
 *
 * target — куда материал «хочет» сместиться под действием пальца:
 *   • нажатие — плита сплющивается, материал растекается в стороны;
 *   • нажатие + протягивание — материал вокруг точки захвата тянется за курсором;
 *   • наведение у края — край слегка подаётся к курсору.
 * Площадь (объём) поддерживается: если один бок вытянули, остальные поджимаются.
 * Сам компонент никуда не уезжает — сдвиг ограничен несколькими пикселями.
 */

const SUBSTEP = 1 / 120
const K = 170
const C = 15
const COUPLING_SPEED = 320 // px/s — насколько «гладко» деформация расходится по краю

export interface SiliconeElements {
	inner: HTMLElement
	content: HTMLElement
	shadow: HTMLElement
	shape: SVGPathElement
	glint: SVGEllipseElement
	sparkle: SVGEllipseElement
	edgeGlow: SVGEllipseElement
	sheen: SVGCircleElement
	dimple: SVGGElement
	lens: SVGFEImageElement
	lensMap: SVGFEDisplacementMapElement
	lensFilterId: string
	pad: number
}

type Arr =
	| "rx"
	| "ry"
	| "nx"
	| "ny"
	| "ox"
	| "oy"
	| "vx"
	| "vy"
	| "tx"
	| "ty"
	| "px"
	| "py"
const ARRS: Arr[] = [
	"rx",
	"ry",
	"nx",
	"ny",
	"ox",
	"oy",
	"vx",
	"vy",
	"tx",
	"ty",
	"px",
	"py",
]

export class Silicone {
	visible = false
	private n = 0
	private w = 0
	private h = 0
	private T = 0
	private rx = new Float32Array(0)
	private ry = new Float32Array(0)
	private nx = new Float32Array(0)
	private ny = new Float32Array(0)
	private ox = new Float32Array(0)
	private oy = new Float32Array(0)
	private vx = new Float32Array(0)
	private vy = new Float32Array(0)
	private tx = new Float32Array(0)
	private ty = new Float32Array(0)
	private px = new Float32Array(0)
	private py = new Float32Array(0)

	// пружины «целого» компонента
	private press = 0 // глубина нажатия 0..1 (с перелётом при отпускании)
	private pressV = 0
	private pressTarget = 0
	private dragX = 0 // вытягивание (px), сглаженное пружиной
	private dragY = 0
	private dragVX = 0
	private dragVY = 0
	private hover = 0
	private hoverTarget = 0

	private ptrOn = false
	private ptrX = 0
	private ptrY = 0
	private grabX = 0
	private grabY = 0
	private pressed = false
	private lensOn = false
	private active = true

	constructor(
		private els: SiliconeElements,
		private strength: number,
	) {}

	resize(w: number, h: number) {
		if (w < 2 || h < 2) return
		if (Math.abs(w - this.w) < 0.5 && Math.abs(h - this.h) < 0.5) return
		this.w = w
		this.h = h
		const R = Math.min(24, w / 2, h / 2)
		const L = 2 * (w - 2 * R) + 2 * (h - 2 * R) + 2 * Math.PI * R
		const n = Math.max(32, Math.min(160, Math.round(L / 10)))
		this.T = (COUPLING_SPEED / (L / n)) ** 2
		if (n !== this.n) {
			this.n = n
			for (const k of ARRS) this[k] = new Float32Array(n)
		}
		const q = (Math.PI * R) / 2
		const segs: Array<
			[number, (u: number) => [number, number, number, number]]
		> = [
			[w - 2 * R, (u) => [R + u, 0, 0, -1]],
			[q, (u) => arc(w - R, R, R, -Math.PI / 2 + u / R)],
			[h - 2 * R, (u) => [w, R + u, 1, 0]],
			[q, (u) => arc(w - R, h - R, R, u / R)],
			[w - 2 * R, (u) => [w - R - u, h, 0, 1]],
			[q, (u) => arc(R, h - R, R, Math.PI / 2 + u / R)],
			[h - 2 * R, (u) => [0, h - R - u, -1, 0]],
			[q, (u) => arc(R, R, R, Math.PI + u / R)],
		]
		for (let i = 0; i < n; i++) {
			let s = (i / n) * L
			let k = 0
			while (k < segs.length - 1 && s > segs[k][0]) {
				s -= segs[k][0]
				k++
			}
			const [x, y, nx, ny] = segs[k][1](Math.min(s, segs[k][0]))
			this.rx[i] = x
			this.ry[i] = y
			this.nx[i] = nx
			this.ny[i] = ny
		}
		this.active = true
	}

	pointerMove(x: number, y: number) {
		this.ptrX = x
		this.ptrY = y
		this.ptrOn = true
		this.hoverTarget = 1
		this.active = true
	}

	pointerLeave() {
		this.ptrOn = false
		this.hoverTarget = 0
		this.active = true
	}

	pointerDown(x: number, y: number) {
		this.grabX = x
		this.grabY = y
		this.ptrX = x
		this.ptrY = y
		this.pressed = true
		this.pressTarget = 1
		this.active = true
	}

	pointerUp() {
		this.pressed = false
		this.pressTarget = 0
		this.active = true
	}

	get busy() {
		return this.active
	}

	step(frameDt: number, scrollAcc: number) {
		const n = this.n
		if (!n) return
		const jolt = Math.abs(scrollAcc) > 1500
		if (!this.active && !jolt) return
		this.active = true
		const s = this.strength
		const { rx, ry, nx, ny, ox, oy, vx, vy, tx, ty } = this
		const T = this.T
		const size = Math.max(this.w, this.h)

		this.hover += (this.hoverTarget - this.hover) * Math.min(1, frameDt * 8)

		// вытягивание: материал вокруг точки захвата следует за курсором (с пределом)
		let wantX = 0
		let wantY = 0
		if (this.pressed) {
			wantX = this.ptrX - this.grabX
			wantY = this.ptrY - this.grabY
			const len = Math.hypot(wantX, wantY)
			const max = 70 * s
			if (len > 0) {
				// чем сильнее тянешь, тем туже идёт (нелинейная жёсткость)
				const eased = max * Math.tanh(len / (max * 1.4))
				wantX *= eased / len
				wantY *= eased / len
			}
		}

		const steps = Math.max(1, Math.round(frameDt / SUBSTEP))
		const dt = frameDt / steps
		const sigGrab2 = 2 * (Math.min(size * 0.45, 190) * Math.max(0.6, s)) ** 2
		const sigPtr2 = 2 * 55 * 55
		const sigPress2 = 2 * (size * 0.55) ** 2
		const inertia = Math.max(-4, Math.min(4, scrollAcc * 0.00025)) * s

		for (let k = 0; k < steps; k++) {
			// пружины целого
			this.pressV +=
				(300 * (this.pressTarget - this.press) - 20 * this.pressV) * dt
			this.press += this.pressV * dt
			this.dragVX += (220 * (wantX - this.dragX) - 19 * this.dragVX) * dt
			this.dragVY += (220 * (wantY - this.dragY) - 19 * this.dragVY) * dt
			this.dragX += this.dragVX * dt
			this.dragY += this.dragVY * dt

			const spread = 7 * s * this.press // растекание при нажатии
			let spreadMean = 0
			for (let i = 0; i < n; i++) {
				let gx = 0
				let gy = 0
				const dxp = rx[i] - this.grabX
				const dyp = ry[i] - this.grabY
				const d2 = dxp * dxp + dyp * dyp
				// нажатие: плита сплющивается и растекается, сильнее всего у пальца
				if (this.press !== 0) {
					const sp = spread * (0.35 + 0.65 * Math.exp(-d2 / sigPress2))
					gx += nx[i] * sp
					gy += ny[i] * sp
					spreadMean += sp
				}
				// протягивание
				if (this.dragX !== 0 || this.dragY !== 0) {
					const g = Math.exp(-d2 / sigGrab2)
					gx += this.dragX * g
					gy += this.dragY * g
				}
				// наведение: край чуть подаётся к курсору
				if (this.ptrOn && !this.pressed) {
					const dx = this.ptrX - rx[i]
					const dy = this.ptrY - ry[i]
					const g =
						Math.exp(-(dx * dx + dy * dy) / sigPtr2) * 3 * s * this.hover
					gx += nx[i] * g
					gy += ny[i] * g
				}
				// инерция при скролле: лёгкое «приседание»
				gy += inertia * Math.abs(ny[i]) * ny[i]
				tx[i] = gx
				ty[i] = gy
			}
			spreadMean /= n

			for (let i = 0; i < n; i++) {
				const a = (i - 1 + n) % n
				const b = (i + 1) % n
				vx[i] +=
					(K * (tx[i] - ox[i]) + T * (ox[a] + ox[b] - 2 * ox[i]) - C * vx[i]) *
					dt
				vy[i] +=
					(K * (ty[i] - oy[i]) + T * (oy[a] + oy[b] - 2 * oy[i]) - C * vy[i]) *
					dt
			}
			let normalMean = 0
			for (let i = 0; i < n; i++) {
				ox[i] += vx[i] * dt
				oy[i] += vy[i] * dt
				normalMean += ox[i] * nx[i] + oy[i] * ny[i]
			}
			// сохранение объёма: средний выход по нормали = только растекание от нажатия
			const corr = (normalMean / n - spreadMean) * 0.35
			for (let i = 0; i < n; i++) {
				ox[i] -= nx[i] * corr
				oy[i] -= ny[i] * corr
			}
		}

		// покой — перестаём считать, форма снова идеально ровная
		let energy =
			Math.abs(this.press - this.pressTarget) +
			Math.abs(this.pressV) +
			Math.abs(this.dragX - wantX) +
			Math.abs(this.dragY - wantY) +
			Math.abs(this.dragVX) +
			Math.abs(this.dragVY) +
			Math.abs(this.hover - this.hoverTarget)
		for (let i = 0; i < n; i += 4) {
			energy +=
				Math.abs(vx[i]) +
				Math.abs(vy[i]) +
				Math.abs(ox[i] - tx[i]) +
				Math.abs(oy[i] - ty[i])
		}
		if (energy < 0.03 && !this.pressed && !jolt) {
			if (!this.ptrOn) {
				ox.fill(0)
				oy.fill(0)
				vx.fill(0)
				vy.fill(0)
				this.press =
					this.pressV =
					this.dragX =
					this.dragY =
					this.dragVX =
					this.dragVY =
						0
			}
			this.active = false
		}

		this.render()
	}

	render() {
		const n = this.n
		if (!n) return
		const { rx, ry, ox, oy, px, py } = this
		const pad = this.els.pad
		for (let i = 0; i < n; i++) {
			px[i] = rx[i] + ox[i] + pad
			py[i] = ry[i] + oy[i] + pad
		}

		// замкнутый сплайн Катмулла–Рома → кубические кривые Безье
		let path = `M${px[0].toFixed(1)} ${py[0].toFixed(1)}`
		for (let i = 0; i < n; i++) {
			const i0 = (i - 1 + n) % n
			const i2 = (i + 1) % n
			const i3 = (i + 2) % n
			path +=
				`C${(px[i] + (px[i2] - px[i0]) / 6).toFixed(1)} ${(py[i] + (py[i2] - py[i0]) / 6).toFixed(1)} ` +
				`${(px[i2] - (px[i3] - px[i]) / 6).toFixed(1)} ${(py[i2] - (py[i3] - py[i]) / 6).toFixed(1)} ` +
				`${px[i2].toFixed(1)} ${py[i2].toFixed(1)}`
		}
		this.els.shape.setAttribute("d", path + "Z")

		// блики живут на реальном (деформированном) крае; свет — сверху-слева
		this.placeOnEdge(
			this.els.glint,
			-0.2,
			-0.98,
			4,
			Math.max(16, this.w * 0.3),
			2,
			30,
		)
		this.placeOnEdge(this.els.sparkle, -0.62, -0.78, 6, 8, 1.5, 60)
		this.placeOnEdge(
			this.els.edgeGlow,
			0.25,
			0.97,
			4,
			Math.max(16, this.w * 0.3),
			3.5,
			20,
		)

		const p = Math.max(0, this.press)
		const lift = this.hover * (1 - Math.min(1, p))

		// блеск поверхности под курсором
		const sh = this.els.sheen
		sh.setAttribute("cx", (this.ptrX + pad).toFixed(1))
		sh.setAttribute("cy", (this.ptrY + pad).toFixed(1))
		sh.style.opacity = (this.hover * (1 - Math.min(1, p)) * 0.8).toFixed(3)

		// вмятина под пальцем: тянется вдоль направления протягивания
		const dl = Math.hypot(this.dragX, this.dragY)
		const ang = (Math.atan2(this.dragY, this.dragX) * 180) / Math.PI
		const stretch = 1 + dl / 70
		const cx = this.grabX + this.dragX * 0.6
		const cy = this.grabY + this.dragY * 0.6
		this.els.dimple.setAttribute(
			"transform",
			`translate(${(cx + pad).toFixed(1)} ${(cy + pad).toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${stretch.toFixed(3)} ${(1 / Math.sqrt(stretch)).toFixed(3)})`,
		)
		this.els.dimple.style.opacity = Math.min(
			1,
			Math.abs(this.press) * 1.2,
		).toFixed(3)

		// преломление: содержимое под пальцем искажается, как сквозь вдавленную линзу
		const lensScale = p * 16 * this.strength
		if (lensScale > 0.3) {
			const r = 90 * stretch
			const lens = this.els.lens
			lens.setAttribute("x", (cx - r).toFixed(1))
			lens.setAttribute("y", (cy - r).toFixed(1))
			lens.setAttribute("width", (r * 2).toFixed(1))
			lens.setAttribute("height", (r * 2).toFixed(1))
			this.els.lensMap.setAttribute("scale", lensScale.toFixed(2))
			if (!this.lensOn) {
				this.els.content.style.filter = `url(#${this.els.lensFilterId})`
				this.lensOn = true
			}
		} else if (this.lensOn) {
			this.els.content.style.filter = ""
			this.lensOn = false
		}

		// весь компонент: сплющивание от нажатия + небольшой сдвиг за пальцем
		const sq = this.press * 0.025
		const bx = this.dragX * 0.1
		const by = this.dragY * 0.1
		this.els.inner.style.transform = `translate3d(${bx.toFixed(2)}px, ${(by - lift * 2).toFixed(2)}px, 0) scale(${(1 + sq).toFixed(4)}, ${(1 - sq).toFixed(4)})`
		// содержимое «вплавлено» в материал — едет вслед за ним
		this.els.content.style.transform = `translate3d(${(this.dragX * 0.12).toFixed(2)}px, ${(this.dragY * 0.12).toFixed(2)}px, 0)`
		// тень: при подъёме — мягче и дальше, при нажатии — плотнее и ближе
		const shadowY = lift * 6 - p * 6
		this.els.shadow.style.transform = `translate3d(${(bx * 0.6).toFixed(2)}px, ${(by * 0.6 + shadowY).toFixed(2)}px, 0) scale(${(1 + p * 0.03).toFixed(3)})`
		this.els.shadow.style.opacity = (0.8 + lift * 0.2 + p * 0.2).toFixed(3)
	}

	/** Ставит эллипс у участка края, чья нормаль смотрит на (lx, ly) */
	private placeOnEdge(
		el: SVGEllipseElement,
		lx: number,
		ly: number,
		inset: number,
		rx: number,
		ry: number,
		sharp: number,
	) {
		const { px, py } = this
		const n = this.n
		const ll = Math.hypot(lx, ly)
		lx /= ll
		ly /= ll
		let sw = 0
		let sx = 0
		let sy = 0
		let snx = 0
		let sny = 0
		for (let i = 0; i < n; i++) {
			const a = (i - 1 + n) % n
			const b = (i + 1) % n
			const tx = px[b] - px[a]
			const ty = py[b] - py[a]
			const len = Math.hypot(tx, ty) || 1
			const nnx = ty / len
			const nny = -tx / len
			const dot = nnx * lx + nny * ly
			if (dot <= 0) continue
			const wgt = dot ** sharp
			sw += wgt
			sx += px[i] * wgt
			sy += py[i] * wgt
			snx += nnx * wgt
			sny += nny * wgt
		}
		if (!sw) return
		sx /= sw
		sy /= sw
		const nl = Math.hypot(snx, sny) || 1
		snx /= nl
		sny /= nl
		const ang = (Math.atan2(snx, -sny) * 180) / Math.PI
		el.setAttribute(
			"transform",
			`translate(${(sx - snx * inset).toFixed(1)} ${(sy - sny * inset).toFixed(1)}) rotate(${ang.toFixed(1)})`,
		)
		el.setAttribute("rx", rx.toFixed(1))
		el.setAttribute("ry", ry.toFixed(1))
	}
}

function arc(
	cx: number,
	cy: number,
	r: number,
	a: number,
): [number, number, number, number] {
	const c = Math.cos(a)
	const s = Math.sin(a)
	return [cx + r * c, cy + r * s, c, s]
}

/** Карта смещений для «линзы» вмятины: R/G = направление от центра */
let lensMapUrl: string | null = null
export function getLensMap(): string {
	if (lensMapUrl) return lensMapUrl
	const S = 128
	const cv = document.createElement("canvas")
	cv.width = cv.height = S
	const ctx = cv.getContext("2d")
	if (!ctx) return ""
	const img = ctx.createImageData(S, S)
	for (let y = 0; y < S; y++) {
		for (let x = 0; x < S; x++) {
			const dx = (x + 0.5) / (S / 2) - 1
			const dy = (y + 0.5) / (S / 2) - 1
			const r = Math.hypot(dx, dy)
			// вогнутая линза: содержимое расходится от центра, к краю эффект гаснет
			const f = r < 1 ? Math.sin(Math.PI * r) * (1 - r) * 1.6 : 0
			const ux = r > 0 ? dx / r : 0
			const uy = r > 0 ? dy / r : 0
			const o = (y * S + x) * 4
			img.data[o] = 128 - ux * f * 127
			img.data[o + 1] = 128 - uy * f * 127
			img.data[o + 2] = 0
			img.data[o + 3] = 255
		}
	}
	ctx.putImageData(img, 0, 0)
	lensMapUrl = cv.toDataURL()
	return lensMapUrl
}

// ---------------- общий цикл ----------------

const items = new Set<Silicone>()
let raf = 0
let last = 0
let lastY = 0
let velS = 0
let accS = 0

function frame(now: number) {
	const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60
	last = now
	const y = window.scrollY
	const vRaw = (y - lastY) / dt
	lastY = y
	const prev = velS
	velS += (vRaw - velS) * 0.3
	accS += (Math.max(-40000, Math.min(40000, (velS - prev) / dt)) - accS) * 0.3

	let any = false
	for (const it of items) {
		if (!it.visible) continue
		it.step(dt, accS)
		if (it.busy) any = true
	}
	// цикл живёт, пока что-то деформировано или страница скроллится
	const scrolling = Math.abs(velS) > 5 || Math.abs(accS) > 50
	raf = any || scrolling ? requestAnimationFrame(frame) : 0
	if (!raf) last = 0
}

export function register(it: Silicone) {
	items.add(it)
}

export function unregister(it: Silicone) {
	items.delete(it)
}

export function wake() {
	if (!raf) {
		lastY = window.scrollY
		raf = requestAnimationFrame(frame)
	}
}

if (typeof window !== "undefined") {
	window.addEventListener("scroll", wake, { passive: true })
}
