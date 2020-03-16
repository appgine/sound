
import { getCookie, askFrameMessage } from '../lib/net'

const events = ['ended', 'seeking', 'seeked', 'waiting', 'playing'];


export default function create()
{
	let tmpaudio = new Audio();
	let audio;
	let handler;
	let offset = 0.0;
	let virtual = false;
	let paused = true;

	return function(endpoint, config, connectVolume) {
		function createAudio(currentTime, initialAudio) {
			offset = currentTime;
			virtual = currentTime>0;

			const thisAudio = tmpaudio || new Audio();
			tmpaudio = null;

			connectVolume(thisAudio);
			thisAudio.crossOrigin = "use-credentials";
			thisAudio.src = endpoint + (endpoint.indexOf('?')!==-1 ? '&p=' : '?p=')+offset+'&t='+Date.now();

			const onDurationChange = () => config.durationchange(currentTime+thisAudio.duration);
			const onHttpError = () => config.error(-1);
			const canPlayThrough = () => {
				audio = thisAudio;
				initialAudio && config.canplaythrough && config.canplaythrough();
				initialAudio = false;
				paused===false && thisAudio.play();
			};

			const onLoadedData = () => {
				const server = getCookie('stream_server');
				server && askFrameMessage(server, 'is_stream_virtual', function(currentVirtual) {
					if (server===getCookie('stream_server')) {
						virtual = !!currentVirtual;
					}
				});
			}

			thisAudio.addEventListener('loadeddata', onLoadedData);
			thisAudio.addEventListener('canplaythrough', canPlayThrough);
			thisAudio.addEventListener('durationchange', onDurationChange);
			thisAudio.addEventListener('error', onHttpError);
			events.forEach(event => config[event] && thisAudio.addEventListener(event, config[event]));

			return function() {
				events.forEach(event => config[event] && thisAudio.removeEventListener(event, config[event]));
				thisAudio.removeEventListener('error', onHttpError);
				thisAudio.removeEventListener('durationchange', onDurationChange);
				thisAudio.removeEventListener('canplaythrough', canPlayThrough);
				thisAudio.removeEventListener('loadeddata', onLoadedData);
				thisAudio.src = '';
				audio = null;
			}
		}

		handler = createAudio(0.0, true);

		const control = {
			destroy() {
				handler && handler();
				handler = null;
			},
			pause() {
				if (paused===false) {
					paused = true;
					audio && audio.pause();
				}
			},
			play() {
				paused = false;
				audio && audio.play();
			}
		}

		Object.defineProperty(control, 'currentTime', {
			get() { return offset+(audio && audio.currentTime || 0.0); },
			set(currentTime) {
				currentTime = Math.max(0.0, currentTime);

				const shouldCreateAudio = (function() {
					if (!audio || audio.buffered.length!==1) {
						return true;

					} else if (offset+audio.buffered.end(0)<currentTime) {
						return true;

					} else if (currentTime<offset) {
						return true;

					} else if (virtual && currentTime<offset+audio.currentTime) {
						return true;
					}

					return false;
				})();

				if (shouldCreateAudio) {
					handler && handler();
					config.seeking();
					config.waiting();
					handler = createAudio(Math.round(currentTime*10)/10 || 0.0, false);

				} else {
					audio.currentTime = currentTime-offset;
				}
			},
		});

		return control;
	}
}
