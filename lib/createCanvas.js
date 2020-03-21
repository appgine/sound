

export default function createCanvas($element, scale, defer)
{
	const { width, height } = $element.getBoundingClientRect();

	if (width===0) {
		return defer && defer();
	}

	const $canvas = document.createElement('canvas');
	$canvas.width = width*scale;
	$canvas.height = height*scale;
	$element.appendChild($canvas);

	const ctx = $canvas.getContext('2d');
	ctx.translate(width*scale/2, height*scale/2);
	ctx.rotate(-90/180*Math.PI);
	return $canvas;
}
