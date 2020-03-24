
import * as SoundStore from '../store'
import { dom } from 'appgine/lib/closure'
import createCanvas from '../lib/createCanvas'
import renderCanvasArc from '../lib/renderCanvasArc'


export default function create($element, { url, label, sample }) {
	const state = {};
	const play = this.dispatch.bind(this, 'play');
	const log = this.dispatch.bind(this, 'trackplay');

	const handler = SoundStore.connect(label);
	handler.then(render);

	this.event($element, 'click', e => {
		if (e && dom.getLink(e) && (e.metaKey || e.ctrlKey)) {
			if (state.isCurrent) {
				log(label, 'blank');
				state.control.pause();
			}

		} else if (state.isCurrent) {
			e.preventDefault();
			log(state.label, state.ended || state.paused ? 'play' : 'pause');
			state.control.toggle();

		} else {
			SoundStore.init();
			handler.makeDirty();
			$element.classList.add('btn-loading');

			if (typeof sample === 'string') {
				log(label, 'play');
				play($element, sample, [label], label);

			} else if (sample) {
				log(sample.label, 'play');
				play($element, sample.url, sample.labels, sample.label);

			} else {
				log(label, 'play');
				play($element, null, null, label);
			}
		}
	}, false);

	const progressDuration = 250;
	let $canvas = null;
	let interval = null;
	let timeout = null;
	let frame = null;
	let created = 0;
	let color = null;

	function render(currentState, allowNextRender=null) {
		Object.assign(state, currentState);

		const active = !state.nextTrack && state.isCurrent;
		$element.classList.toggle('active', active);
		$element.classList.toggle('playing', active && state.playing);
		$element.classList.toggle('btn-loading', !state.nextTrack && state.loading);

		if (active) {
			created = created || Date.now()-(allowNextRender ? 200 : 0);
			$canvas = $canvas || createCanvas($element, 4, function() {
				if (allowNextRender) {
					clearTimeout(timeout);
					timeout = setTimeout(() => render(state, false), 0);
				}
			});

			color = color || ($canvas ? window.getComputedStyle($canvas).color : null);

			if ($canvas && created+progressDuration>Date.now()) {
				function renderCanvasProgress() {
					if (created+progressDuration>Date.now()) {
						renderCanvas($canvas, color, 12, (Date.now()-created)/progressDuration);
						frame = requestAnimationFrame(renderCanvasProgress);

					} else {
						render(state);
					}
				}

				cancelAnimationFrame(frame);
				frame = requestAnimationFrame(renderCanvasProgress);

			} else if ($canvas) {
				const bindRenderCanvas = renderCanvas.bind(null, $canvas, color, 12, 1.0);

				clearInterval(interval);
				state.playing && (interval = setInterval(bindRenderCanvas, 150));
				bindRenderCanvas();
			}

		} else if ($canvas) {
			destroyCanvas();
		}
	}

	function renderCanvas($canvas, color, ringRadius, progress) {
		const position = state.position+(state.playing ? (Date.now()-state.starttime)/1000 : 0);
		const percent = Math.min(1, position/state.duration);
		renderCanvasArc($canvas, '#CCC', ringRadius, progress, true);
		renderCanvasArc($canvas, color || 'rgba(0,0,0,0)', ringRadius, percent, false);
	}

	function destroyCanvas() {
		clearTimeout(timeout);
		clearInterval(interval);
		cancelAnimationFrame(frame);
		$canvas && $canvas.parentNode && $canvas.parentNode.removeChild($canvas);
		$canvas = null;
		created = 0;
	}

	render(SoundStore.initial(label), true);

	return function() {
		$element.classList.remove('btn-loading', 'playing');
		destroyCanvas();
		handler();
	}
}
