import { Container } from "react-bootstrap"
import Brand from "./Brand"
import Contribution from "./Contribution"
import NavList from "./NavList"
import BsNavbar from "react-bootstrap/Navbar"
import { useState } from "react"
import Icon from "../../assets/icons/bars-solid.svg?react"

const Navbar: React.FC = (): JSX.Element => {
	const [expanded, setExpanded] = useState(false)

	return (
		<BsNavbar
			fixed="top"
			expand="lg"
			className="navbar-dark full-width"
			expanded={expanded}
		>
			<Container className="flex-lg-column">
				<Brand />
				<BsNavbar.Toggle
					data-toggle="collapse"
					data-target="#navbarNav"
					aria-controls="navbarNav"
					aria-expanded="false"
					label="Toggle navigation"
					className="border-0 px-1 d-flex d-lg-none flex-column justify-content-around"
					onClick={() => setExpanded(!expanded)}
				>
					<Icon className="navbar-toggler-icon" />
				</BsNavbar.Toggle>
				<BsNavbar.Collapse id="navbarNav" onClick={() => setExpanded(false)}>
					<NavList />
				</BsNavbar.Collapse>
			</Container>
			<Contribution />
		</BsNavbar>
	)
}

export default Navbar
