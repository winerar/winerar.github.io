/**
 * Физика «капли в невесомости».
 *
 * Контур капли — N точек на скруглённом прямоугольнике. Каждая точка может
 * смещаться только по нормали (d), и для этих смещений решается волновое
 * уравнение с затуханием:
 *
 *   d'' = -K·d + T·(d[i-1] + d[i+1] - 2d[i]) - C·d' + F
 *
 *   K — упругость (поверхностное натяжение тянет к исходной форме)
 *   T — связь соседей: по краю бегут волны
 *   C — вязкость
 *   F — внешние силы: потоки воздуха, курсор, волны от клика, инерция при скролле
 *
 * После каждого шага из смещений вычитается среднее — жидкость несжимаема:
 * где край вдавили, в другом месте он выпячивается.
 * Сама капля целиком — масса на пружине: дрейфует, отстаёт при скролле.
 */

const SUBSTEP = 1 / 120
const K = 60
const C = 2.2
const WAVE_SPEED = 700 // px/s — скорость волн по краю
const RIPPLE_SPEED = 520 // px/s — скорость кругов на поверхности
const BODY_K = 8
const BODY_C = 2.0

// свет падает сверху-слева: блик там, каустика — с противоположной стороны
const LX = -0.55
const LY = -0.835

export interface DropElements {
	inner: HTMLElement
	shadow: HTMLElement
	shape: SVGPathElement
	glint: SVGEllipseElement
	glintSmall: SVGEllipseElement
	caustic: SVGEllipseElement
	flows: SVGCircleElement[]
	pointerLight: SVGCircleElement
	ripples: SVGGElement
	pad: number
}

interface Ripple {
	x: number
	y: number
	age: number
	life: number
	ring: SVGCircleElement
	glow: SVGCircleElement
}

const SVG_NS = "http://www.w3.org/2000/svg"

export class Drop {
	visible = false
	private n = 0
	private w = 0
	private h = 0
	private T = 0
	private rx = new Float32Array(0)
	private ry = new Float32Array(0)
	private nx = new Float32Array(0)
	private ny = new Float32Array(0)
	private th = new Float32Array(0)
	private d = new Float32Array(0)
	private v = new Float32Array(0)
	private px = new Float32Array(0)
	private py = new Float32Array(0)

	private bx = 0
	private by = 0
	private bvx = 0
	private bvy = 0
	private hover = 0
	private hoverTarget = 0
	private ptrOn = false
	private ptrX = 0
	private ptrY = 0
	private ptrVX = 0
	private ptrVY = 0
	private ripples: Ripple[] = []
	private ph: number[]

	constructor(
		private els: DropElements,
		private strength: number,
		seed: number,
	) {
		// детерминированные фазы — у каждой капли свой характер
		this.ph = Array.from(
			{ length: 10 },
			(_, i) => ((seed + 1) * 2.399 * (i + 1)) % (Math.PI * 2),
		)
	}

	resize(w: number, h: number) {
		if (w < 2 || h < 2) return
		if (Math.abs(w - this.w) < 0.5 && Math.abs(h - this.h) < 0.5) return
		this.w = w
		this.h = h
		const R = Math.min(28, w / 2, h / 2)
		const L = 2 * (w - 2 * R) + 2 * (h - 2 * R) + 2 * Math.PI * R
		const n = Math.max(24, Math.min(128, Math.round(L / 14)))
		const spacing = L / n
		this.T = (WAVE_SPEED / spacing) ** 2
		if (n !== this.n) {
			this.n = n
			this.rx = new Float32Array(n)
			this.ry = new Float32Array(n)
			this.nx = new Float32Array(n)
			this.ny = new Float32Array(n)
			this.th = new Float32Array(n)
			this.d = new Float32Array(n)
			this.v = new Float32Array(n)
			this.px = new Float32Array(n)
			this.py = new Float32Array(n)
		}
		const segs: Array<
			[number, (u: number) => [number, number, number, number]]
		> = [
			[w - 2 * R, (u) => [R + u, 0, 0, -1]],
			[(Math.PI * R) / 2, (u) => arc(w - R, R, R, -Math.PI / 2 + u / R)],
			[h - 2 * R, (u) => [w, R + u, 1, 0]],
			[(Math.PI * R) / 2, (u) => arc(w - R, h - R, R, u / R)],
			[w - 2 * R, (u) => [w - R - u, h, 0, 1]],
			[(Math.PI * R) / 2, (u) => arc(R, h - R, R, Math.PI / 2 + u / R)],
			[h - 2 * R, (u) => [0, h - R - u, -1, 0]],
			[(Math.PI * R) / 2, (u) => arc(R, R, R, Math.PI + u / R)],
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
			this.th[i] = (i / n) * Math.PI * 2
		}
	}

	pointerMove(x: number, y: number, dt: number) {
		if (this.ptrOn && dt > 0) {
			this.ptrVX = (x - this.bx - this.ptrX) / dt
			this.ptrVY = (y - this.by - this.ptrY) / dt
		}
		this.ptrX = x - this.bx
		this.ptrY = y - this.by
		this.ptrOn = true
		this.hoverTarget = 1
	}

	pointerLeave() {
		this.ptrOn = false
		this.hoverTarget = 0
	}

	poke(x: number, y: number) {
		const lx = x - this.bx
		const ly = y - this.by
		const ring = document.createElementNS(SVG_NS, "circle")
		ring.setAttribute("class", "liquid__ring")
		const glow = document.createElementNS(SVG_NS, "circle")
		glow.setAttribute("class", "liquid__ring-glow")
		this.els.ripples.append(glow, ring)
		const far = Math.max(
			Math.hypot(lx, ly),
			Math.hypot(this.w - lx, ly),
			Math.hypot(lx, this.h - ly),
			Math.hypot(this.w - lx, this.h - ly),
		)
		this.ripples.push({
			x: lx,
			y: ly,
			age: 0,
			life: far / RIPPLE_SPEED + 0.6,
			ring,
			glow,
		})
		if (this.ripples.length > 4) this.dropRipple(0)
		// толчок: капля отплывает от точки касания
		const cx = this.w / 2
		const cy = this.h / 2
		const len = Math.hypot(cx - lx, cy - ly) || 1
		this.bvx += ((cx - lx) / len) * 40 * this.strength
		this.bvy += ((cy - ly) / len) * 40 * this.strength
	}

	private dropRipple(i: number) {
		const r = this.ripples[i]
		r.ring.remove()
		r.glow.remove()
		this.ripples.splice(i, 1)
	}

	step(frameDt: number, t: number, scrollAcc: number) {
		const n = this.n
		if (!n) return
		const s = this.strength
		const { rx, ry, nx, ny, th, d, v, ph } = this
		const T = this.T
		const inertia = clamp(scrollAcc * 0.0006, -7, 7) * s
		const sigma2 = 2 * 70 * 70

		this.hover += (this.hoverTarget - this.hover) * Math.min(1, frameDt * 5)

		// след от движения курсора — жидкость увлекается за пальцем
		if (this.ptrOn) {
			const kick = 0.00004 * s
			for (let i = 0; i < n; i++) {
				const dx = this.ptrX - rx[i]
				const dy = this.ptrY - ry[i]
				const g = Math.exp(-(dx * dx + dy * dy) / sigma2)
				if (g < 0.01) continue
				v[i] += clamp(
					(this.ptrVX * nx[i] + this.ptrVY * ny[i]) * kick * g * 60,
					-40,
					40,
				)
			}
		}
		this.ptrVX *= 0.8
		this.ptrVY *= 0.8

		const steps = Math.max(1, Math.round(frameDt / SUBSTEP))
		const dt = frameDt / steps
		for (let k = 0; k < steps; k++) {
			const tt = t + k * dt
			// медленные «течения воздуха» — низкие моды формы
			const a2 = 3.0 * s
			const a3 = 2.2 * s
			const a4 = 1.4 * s
			const a9 = 0.6 * s
			let mean = 0
			for (let i = 0; i < n; i++) {
				const prev = d[(i - 1 + n) % n]
				const next = d[(i + 1) % n]
				const lap = prev + next - 2 * d[i]
				let target =
					a2 * Math.sin(2 * th[i] + 0.35 * tt + ph[0]) +
					a3 * Math.sin(3 * th[i] - 0.27 * tt + ph[1]) +
					a4 * Math.sin(4 * th[i] + 0.5 * tt + ph[2]) +
					a9 * Math.sin(9 * th[i] + 1.7 * tt + ph[3])
				// инерция: при ускорении страницы жидкость «стекает» назад
				target += inertia * ny[i]
				if (this.ptrOn) {
					const dx = this.ptrX - rx[i]
					const dy = this.ptrY - ry[i]
					target += 9 * s * this.hover * Math.exp(-(dx * dx + dy * dy) / sigma2)
				}
				for (const r of this.ripples) {
					const dist = Math.hypot(rx[i] - r.x, ry[i] - r.y)
					const dd = dist - r.age * RIPPLE_SPEED
					if (dd > -40 && dd < 40) {
						target +=
							14 * s * Math.exp(-(dd * dd) / 200) * Math.exp(-r.age * 1.2)
					}
				}
				const acc = K * (target - d[i]) + T * lap - C * v[i]
				v[i] += acc * dt
			}
			for (let i = 0; i < n; i++) {
				d[i] += v[i] * dt
				mean += d[i]
			}
			// несжимаемость: объём сохраняется
			mean /= n
			for (let i = 0; i < n; i++) d[i] = clamp(d[i] - mean, -18, 18)

			// капля целиком: масса на пружине
			const tx =
				s *
					5 *
					(Math.sin(0.29 * tt + ph[4]) + 0.6 * Math.sin(0.13 * tt + ph[5])) +
				(this.ptrOn
					? ((this.ptrX - this.w / 2) / this.w) * 14 * s * this.hover
					: 0)
			const ty =
				s *
					7 *
					(Math.sin(0.23 * tt + ph[6]) + 0.5 * Math.sin(0.41 * tt + ph[7])) +
				(this.ptrOn
					? ((this.ptrY - this.h / 2) / this.h) * 14 * s * this.hover
					: 0)
			this.bvx += (BODY_K * (tx - this.bx) - BODY_C * this.bvx) * dt
			this.bvy +=
				(BODY_K * (ty - this.by) -
					BODY_C * this.bvy +
					clamp(scrollAcc * 0.012, -160, 160) * s) *
				dt
			this.bx += this.bvx * dt
			this.by += this.bvy * dt
		}

		for (let i = this.ripples.length - 1; i >= 0; i--) {
			this.ripples[i].age += frameDt
			if (this.ripples[i].age > this.ripples[i].life) this.dropRipple(i)
		}

		this.render(t)
	}

	render(t: number) {
		const n = this.n
		if (!n) return
		const { rx, ry, nx, ny, d, px, py } = this
		const pad = this.els.pad
		for (let i = 0; i < n; i++) {
			px[i] = rx[i] + nx[i] * d[i] + pad
			py[i] = ry[i] + ny[i] * d[i] + pad
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

		// блик и каустика скользят по реальному (деформированному) краю
		this.placeHighlight(this.els.glint, LX, LY, 9, 30, 4.5, 40)
		this.placeHighlight(this.els.glintSmall, LX, LY, 15, 5, 2, 40, 30)
		this.placeHighlight(
			this.els.caustic,
			-LX,
			-LY,
			16,
			Math.min(120, this.w * 0.28),
			16,
			6,
		)

		const [f0, f1, f2] = this.els.flows
		const w = this.w
		const h = this.h
		const ph = this.ph
		setCircle(
			f0,
			pad + w * (0.5 + 0.35 * Math.sin(0.11 * t + ph[8])),
			pad + h * (0.5 + 0.3 * Math.cos(0.17 * t + ph[9])),
		)
		setCircle(
			f1,
			pad + w * (0.5 + 0.35 * Math.cos(0.09 * t + ph[1])),
			pad + h * (0.5 + 0.35 * Math.sin(0.13 * t + ph[2])),
		)
		setCircle(
			f2,
			pad + w * (0.5 + 0.3 * Math.sin(0.07 * t + ph[3])),
			pad + h * (0.5 + 0.3 * Math.sin(0.19 * t + ph[4])),
		)
		const fr = (Math.max(w, h) * 0.5).toFixed(0)
		f0.setAttribute("r", fr)
		f1.setAttribute("r", fr)
		f2.setAttribute("r", fr)

		const pl = this.els.pointerLight
		setCircle(pl, this.ptrX + pad, this.ptrY + pad)
		pl.style.opacity = (this.hover * 0.9).toFixed(3)

		for (const r of this.ripples) {
			const rad = Math.max(0.1, r.age * RIPPLE_SPEED)
			const fade = Math.max(0, 1 - r.age / r.life)
			setCircle(r.ring, r.x + pad, r.y + pad)
			setCircle(r.glow, r.x + pad, r.y + pad)
			r.ring.setAttribute("r", rad.toFixed(1))
			r.glow.setAttribute("r", Math.max(0.1, rad - 7).toFixed(1))
			r.ring.style.opacity = (fade * 0.55).toFixed(3)
			r.glow.style.opacity = (fade * 0.5).toFixed(3)
		}

		const rot = this.bx * 0.06
		this.els.inner.style.transform = `translate3d(${this.bx.toFixed(2)}px, ${this.by.toFixed(2)}px, 0) rotate(${rot.toFixed(3)}deg)`
		// тень на «стене» смещается меньше самой капли — ощущение глубины
		this.els.shadow.style.transform = `translate3d(${(this.bx * 0.45).toFixed(2)}px, ${(this.by * 0.45).toFixed(2)}px, 0)`
		this.els.shadow.style.opacity = (0.75 + this.hover * 0.25).toFixed(3)
	}

	/** Ставит эллипс у того участка края, чья нормаль смотрит на (lx, ly) */
	private placeHighlight(
		el: SVGEllipseElement,
		lx: number,
		ly: number,
		inset: number,
		rx: number,
		ry: number,
		sharp: number,
		along = 0,
	) {
		const { px, py } = this
		const n = this.n
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
		// смещение внутрь и немного вдоль касательной
		const cx = sx - snx * inset - sny * along
		const cy = sy - sny * inset + snx * along
		const ang = (Math.atan2(snx, -sny) * 180) / Math.PI
		el.setAttribute(
			"transform",
			`translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${ang.toFixed(1)})`,
		)
		el.setAttribute("rx", rx.toFixed(1))
		el.setAttribute("ry", ry.toFixed(1))
	}

	destroy() {
		for (const r of this.ripples) {
			r.ring.remove()
			r.glow.remove()
		}
		this.ripples = []
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

function setCircle(el: SVGCircleElement, x: number, y: number) {
	el.setAttribute("cx", x.toFixed(1))
	el.setAttribute("cy", y.toFixed(1))
}

function clamp(x: number, a: number, b: number) {
	return x < a ? a : x > b ? b : x
}

// ---------------- общий цикл для всех капель ----------------

const drops = new Set<Drop>()
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
	const prevVel = velS
	velS += (vRaw - velS) * 0.3
	accS += (clamp((velS - prevVel) / dt, -40000, 40000) - accS) * 0.3

	const t = now / 1000
	let any = false
	for (const d of drops) {
		if (!d.visible) continue
		any = true
		d.step(dt, t, accS)
	}
	raf = any ? requestAnimationFrame(frame) : 0
	if (!raf) last = 0
}

export function register(d: Drop) {
	drops.add(d)
	wake()
}

export function unregister(d: Drop) {
	drops.delete(d)
}

export function wake() {
	if (!raf) {
		lastY = window.scrollY
		raf = requestAnimationFrame(frame)
	}
}
