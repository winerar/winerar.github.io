import { contact } from "../../constants"
import { delay } from "../../utils"
import Liquid from "../common/Liquid"
import Section from "../common/Section"

const items = [
	{
		label: "Email",
		title: "Email",
		href: `mailto:${contact.email}`,
		text: contact.email,
		target: "_top",
	},
	{
		label: "Phone | WhatsApp",
		title: "Phone & WhatsApp",
		href: `tel:${contact.phone}`,
		text: contact.phone,
		target: "_top",
	},
	{
		label: "Telegram",
		title: "Telegram",
		href: contact.telegram,
		text: contact.telegram,
		target: "_blank",
	},
	{
		label: "LinkedIn",
		title: "LinkedIn",
		href: contact.linkedIn,
		text: contact.linkedIn,
		target: "_blank",
	},
	{
		label: "GitHub",
		title: "GitHub",
		href: contact.github,
		text: contact.github,
		target: "_blank",
	},
]

const Contact: React.FC = () => {
	return (
		<Section id="contact">
			<Section.Header title="Contact Information" subtitle="Contact" />
			<div className="fw-bold text-white contact-drops">
				{items.map((item, index) => (
					<div
						data-aos="fade-left"
						data-aos-delay={delay(index + 1)}
						key={item.label}
					>
						<Liquid className="liquid--flat" seed={index + 7} strength={0.5}>
							<p className="mb-0">
								{item.label}:{" "}
								<a
									href={item.href}
									target={item.target}
									className="link-custom"
									title={item.title}
								>
									{item.text}
								</a>
							</p>
						</Liquid>
					</div>
				))}
			</div>
		</Section>
	)
}

export default Contact
