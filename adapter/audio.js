
import { getCookie, askFrameMessage } from '../lib/net'

const events = ['ended', 'seeking', 'seeked', 'waiting', 'playing'];


export default function create()
{
	let tmpaudio = new Audio();

	return function(endpoint, config, connectVolume) {
		const audio = tmpaudio || new Audio();
		tmpaudio = null;

		connectVolume(audio);
		audio.crossOrigin = "use-credentials";
		audio.src = endpoint;

		const onLoadedData = () => config.loadeddata();
		const onDurationChange = () => config.durationchange(audio.duration);
		const onHttpError = () => config.error(-1);
		const canPlayThrough = () => config.canplaythrough();

		audio.addEventListener('loadeddata', onLoadedData);
		audio.addEventListener('canplaythrough', canPlayThrough);
		audio.addEventListener('durationchange', onDurationChange);
		audio.addEventListener('error', onHttpError);
		events.forEach(event => config[event] && audio.addEventListener(event, config[event]));

		const control = {
			destroy() {
				events.forEach(event => config[event] && audio.removeEventListener(event, config[event]));
				audio.removeEventListener('error', onHttpError);
				audio.removeEventListener('durationchange', onDurationChange);
				audio.removeEventListener('canplaythrough', canPlayThrough);
				audio.removeEventListener('loadeddata', onLoadedData);
				audio.src = '';
			},
			pause() {
				audio.pause();
			},
			play() {
				audio.play();
			}
		}

		Object.defineProperty(control, 'buffered', {
			get() { return audio.buffered.length===1 && audio.buffered.end(0) || 0.0; }
		});

		Object.defineProperty(control, 'currentTime', {
			get() { return audio.currentTime; },
			set(currentTime) {
				audio.currentTime = Math.max(0.0, currentTime);
			},
		});

		return control;
	}
}
