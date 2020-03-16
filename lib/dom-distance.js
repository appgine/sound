

export function domDistanceCompare(distance1, distance2)
{
	if (distance1.up===distance2.up) {
		if (distance1.down===distance2.down) {
			if (distance1.across===distance2.across) {
				return 0;
			}

			return distance1.across-distance2.across;
		}

		return distance1.down-distance2.down;
	}

	return distance1.up-distance2.up;
}


export default function distance(elem1, elem2, absolute=false)
{
	if (elem1===elem2) {
		return {up: 0, across: 0, down: 0};
	}

	const parents1 = [elem1];
	const parents2 = [elem2];

	// searches up the DOM from elem1 to the body, stopping and
	// returning if it finds elem2 as a direct ancestor
	while (elem1 = elem1.parentNode) {

		if (elem1 === elem2) {
			return {up: parents1.length, across: 0, down: 0};
		}

		parents1.unshift(elem1);
	}

	// reset value of elem1 for use in the while loop that follows:
	elem1 = parents1[parents1.length - 1];

	// searches up the DOM from elem2 to the body, stopping and
	// returning if it finds elem1 as a direct ancestor
	while (elem2 = elem2.parentNode) {

		if (elem2 === elem1) {
			return {up: 0, across: 0, down: parents2.length};
		}

		parents2.unshift(elem2);
	}

	let gens = 0;
	// finds generation depth from body of first generation of ancestors
	// of elem1 and elem2 that aren't common to both
	while (parents1[gens] === parents2[gens]) {
		gens++;
	}

	if (gens===0) {
		return false;
	}

	let sibs = 0;
	let sibElem = parents1[gens];

	// searches forward across siblings from the earliest non-common ancestor
	// of elem1, looking for earliest non-common ancestor of elem2
	while (sibElem) {
		sibElem = sibElem.nextSibling;
		if (sibElem && sibElem.tagName) {
			sibs++;
			if (sibElem === parents2[gens]) {
				return {
					up: parents1.length - gens - 1,
					across: sibs,
					down: parents2.length - gens - 1
				};
			}
		}
	}

	sibs = 0;
	sibElem = parents1[gens];

	// searches backward across siblings from the earliest non-common ancestor
	// of elem1, looking for earliest non-common ancestor of elem2
	while (sibElem) {
		sibElem = sibElem.previousSibling;
		if (sibElem && sibElem.tagName) {
			sibs--;
			if (sibElem === parents2[gens]) {
				return {
					up: parents1.length - gens - 1,
					across: absolute ? Math.abs(sibs) : sibs,
					down: parents2.length - gens - 1
				};
			}
		}
	}

	return false;
}
