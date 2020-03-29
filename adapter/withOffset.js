
import { getCookie, askFrameMessage } from '../lib/net'


export default function withOffset(audioFactory)
{
	return function(audioCtx) {
		let factory = audioFactory(audioCtx);
		let handler;
		let audio;
		let offset = 0.0;
		let virtual = false;
		let seeking = false;
		let paused = true;

		return function(endpoint, config, connectVolume) {
			function createAudio(currentTime, initialAudio) {
				offset = currentTime;
				virtual = currentTime>0;

				const thisEndpoint = endpoint + (endpoint.indexOf('?')!==-1 ? '&p=' : '?p=')+offset+'&t='+Date.now();
				const thisBridge = {
					ended() { handler===thisAudio && config.ended(); },
					seeking() { handler===thisAudio && config.seeking(); },
					seeked() { handler===thisAudio && config.seeked(); },
					waiting() { handler===thisAudio && config.waiting(); },
					playing() { handler===thisAudio && config.playing(); },
					error(...args) { handler===thisAudio && config.error(...args); },
					durationchange(duration) {
						if (handler===thisAudio) {
							config.durationchange(currentTime+duration);
						}
					},
					canplaythrough() {
						if (handler===thisAudio) {
							audio = thisAudio;
							if (initialAudio) {
								initialAudio = false;
								config.canplaythrough && config.canplaythrough();
							}

							if (seeking) {
								seeking = false;
								config.seeked();
							}

							if (paused===false) {
								thisAudio.play();
							}
						}
					},
					loadeddata() {
						if (handler===thisAudio) {
							const server = getCookie('stream_server');
							server && askFrameMessage(server, 'is_stream_virtual', function(currentVirtual) {
								if (server===getCookie('stream_server')) {
									virtual = !!currentVirtual;
								}
							});
						}
					},
				}

				const thisAudio = factory(thisEndpoint, thisBridge, connectVolume);
				return thisAudio;
			}

			handler = createAudio(0.0, true);

			const control = {
				destroy() {
					handler && handler.destroy();
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
						if (!audio) {
							return true;

						} else if (offset+audio.buffered<currentTime) {
							return true;

						} else if (currentTime<offset) {
							return true;

						} else if (virtual && currentTime<offset+audio.currentTime) {
							return true;
						}

						return false;
					})();

					if (shouldCreateAudio) {
						handler && handler.destroy();
						seeking = true;
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
}
