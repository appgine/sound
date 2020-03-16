
import * as SoundStore from '../store'
import createProgress from 'appgine/addons/progress'

const autoplayed = {};


export default function create($element, data) {
	const play = this.dispatch.bind(this, 'play');
	const log = this.dispatch.bind(this, 'tracksample');

	let autoplay = data.autoplay && autoplayed[data.autoplay]===undefined ? 1 : 0;

	autoplayed[data.autoplay] = true;

	this.createTargets(function(targets) {
		targets.first('sample', function($element, { data }) {
			if (autoplay===1) {
				autoplay = 2;
				log(data.label, 'autoplay');
				play($element, data.url, data.labels, data.label);
			}
		});

		targets.every('sample', function($sample, { data }) {
			const state = Object.assign({}, SoundStore.initial(data.label))

			let $pointer = null;
			let renderinterval = null;
			let progress = createProgress($sample, {
				onClick() {
					if ($pointer===null) {
						autoplay = 0;
						log(data.label, 'play');
						play($sample, data.url, data.labels, data.label);
						return true;
					}
				},
				onProgress(percent) {
					if ($pointer) {
						$pointer.style.left = String((percent<0.05 ? 0 : percent)*100) + '%';
					}
				},
				onDone(percent) {
					if ($pointer) {
						clearInterval(renderinterval);
						renderinterval = null;
						log(data.label, 'seek', percent);
						state.control.seek((percent<0.05 ? 0 : percent));
					}
				},
			});

			function render() {
				if ((state.playing || state.paused || state.loading) && !state.nextTrack) {
					if ($pointer===null) {
						$pointer = document.createElement('div');
						$pointer.className = 'trackpointer';
						$sample.appendChild($pointer);
					}

					let position = state.position + (state.playing ? (Date.now()-state.starttime)/1000 : 0.0);

					if (document.hidden!==true && progress.isRunning()===false) {
						$pointer.style.left = String(Math.min(1, position/state.duration)*100) + '%';
					}

					if (renderinterval===null) {
						renderinterval = setInterval(render, 250);
					}

				} else {
					clearInterval(renderinterval);
					renderinterval = null;
					$pointer && $pointer.parentNode.removeChild($pointer);
					$pointer = null;
				}
			}

			const handler = SoundStore.connect(data.label);

			handler.then(function(currentState) {
				Object.assign(state, currentState);
				render();
			});

			render();

			return function() {
				handler();
				clearInterval(renderinterval);
				progress();
				progress = null;
				$pointer && $pointer.parentNode.removeChild($pointer);
				$pointer = null;
			}
		});
	});
}

