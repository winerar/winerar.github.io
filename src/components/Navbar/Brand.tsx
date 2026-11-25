import { profile } from "../../constants"
import { Navbar as BsNavbar } from "react-bootstrap"
import Logo from "../../assets/icons/logo-dark.svg?react"

const Brand = () => {
	return (
		<BsNavbar.Brand className="mb-lg-4 mx-lg-auto me-auto" href="/">
			<span className="h4 d-flex gap-2 align-items-center mb-0 fw-bold d-lg-none">
				<Logo className="icon-big" />
				<span>{profile.fullName}</span>
			</span>
			<img
				loading="lazy"
				src={profile.avatar}
				alt={profile.fullName}
				className="d-none d-lg-block avatar-drop"
				width={"216px"}
				height={"216px"}
			/>
		</BsNavbar.Brand>
	)
}

export default Brand
