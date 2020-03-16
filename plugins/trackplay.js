
import * as SoundStore from '../store'
import { dom } from 'appgine/lib/closure'


export default function create($element, { url, label, sample }) {
	const state = {};
	const play = this.dispatch.bind(this, 'play');
	const log = this.dispatch.bind(this, 'trackplay');

	const handler = SoundStore.connect(label);
	handler.then(render);

	function onClick(e) {
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

			if (sample) {
				log(sample.label, 'play');
				play($element, sample.url, sample.labels, sample.label);

			} else {
				log(label, 'play');
				play($element, null, null, label);
			}
		}
	}

	function render(currentState) {
		Object.assign(state, currentState);
		$element.classList.toggle('active', !state.nextTrack && state.isCurrent);
		$element.classList.toggle('playing', !state.nextTrack && state.playing);
		$element.classList.toggle('btn-loading', !state.nextTrack && state.loading);
	}

	render(SoundStore.initial(label));

	$element.addEventListener('click', onClick, false);
	return function() {
		$element.classList.remove('btn-loading', 'playing');
		$element.removeEventListener('click', onClick, false);
		handler();
	}
}
