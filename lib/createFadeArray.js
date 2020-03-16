

export default function createFadeArray(numOfValues, fromValue, quick, isFadeIn) {
	const fadeArray = new Float32Array(numOfValues);
	for (let i=0; i<fadeArray.length; i++) {
		if (quick) {
			fadeArray[i] = ((i/fadeArray.length-1)**3 + 1);

		} else {
			const t = i/(fadeArray.length/2);
			fadeArray[i] = 0.5 * (t<1 ? t**3 : (t-2)**3+2);
		}

		if (isFadeIn) {
			fadeArray[i] = fromValue + (1-fromValue)*fadeArray[i];

		} else {
			fadeArray[i] = (1-fadeArray[i]) * fromValue;
		}

		fadeArray[i] = Math.min(fadeArray[i], 1);
	}

	return fadeArray;
}
