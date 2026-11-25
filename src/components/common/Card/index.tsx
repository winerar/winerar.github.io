import { ICardComponent } from "../../../types"
import { delay } from "../../../utils"
import Image from "./components/Image"
import Liquid from "../Liquid"

const Card: ICardComponent = ({
	index = 0,
	children,
	className = "",
	image,
}) => {
	return (
		<div
			className={className}
			data-aos="fade-up"
			data-aos-delay={`${delay(index)}`}
		>
			<Liquid className="card-custom service" seed={index}>
				{image && <Image src={image.src} alt={image?.alt} />}
				<div className="p-4">{children}</div>
			</Liquid>
		</div>
	)
}

Card.Image = Image

export default Card
