

export default function renderCanvas($canvas, color, innerRadius, percent, clear=true)
{
	const ctx = $canvas.getContext && $canvas.getContext('2d');

	if (ctx) {
		const width = $canvas.width;
		const outerRadius = width/2;
		const ringRadius = Math.max(1, outerRadius-innerRadius);
		const radians = 2*Math.PI*percent;

		const x = ringRadius*Math.cos(radians);
		const y = ringRadius*Math.sin(radians);

		clear && ctx.clearRect(-(width/2), -(width/2), width, width);
		ctx.fillStyle = color;

		ctx.beginPath();
		ctx.arc(0, 0, outerRadius, 0, radians, false);
		ctx.lineTo(x,y);
		ctx.arc(0,0, ringRadius, radians, 0, true);
		ctx.closePath();
		ctx.fill();
	}
}
