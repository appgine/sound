
import * as SoundHelper from '../lib/helper.js'


export function canUse() {
	return !!(window.fetch && window.ReadableStream && window.ReadableStream);
}


export default function create(context) {

	let tmpsource = context.createBufferSource();

	return function(audioUrl, audioBridge, connectVolume) {
		let playing = 0;
		let buffering = true;
		let seeking = false;
		let canplaythrough = false;
		let duration = 0.0;

		let audioBytes = 0;
		let audioBytesID3 = false;
		let audioDuration = 0.0;
		let audioFrames = [];

		let downloadStart = context.currentTime;
		let downloadBytes = 0;
		let downloadOffset = 0;
		let downloadBuffer = new Uint8Array(0);
		let contentBytes = Infinity;

		let parsed = false;
		let endFrame = 0;
		let currentSource = null;
		let nextSource = null;

		let startTime = 0.0;
		let endTime = 0.0;

		function mergeBuffer(buffer) {
			downloadBuffer = SoundHelper.mergeBuffers([downloadBuffer, buffer]);

			if (audioBytesID3===false) {
				audioBytesID3 = SoundHelper.resolveID3Size(downloadBuffer);
				audioBridge.loadeddata && audioBridge.loadeddata();
			}

			if (audioBytesID3===false) {
				return true;

			} else if (audioBytesID3>downloadBuffer.length) {
				return true;

			} else if (audioBytesID3>0) {
				downloadBuffer = downloadBuffer.slice(audioBytesID3);
				audioBytesID3 = -audioBytesID3;
			}

			return parseBuffer();
		}

		function parseBuffer() {
			let frame = null;
			while (downloadOffset<downloadBuffer.length-10) {
				let header = SoundHelper.resolveFrameHeader(downloadBuffer.slice(downloadOffset, downloadOffset+6));
				let skipBuffer = header ? 0 : SoundHelper.canSkipBuffer(downloadBuffer.slice(downloadOffset));

				if (frame) {
					if (header && header.key!==frame.header.key) {
						header = null;
					}

					if (header || skipBuffer) {
						audioFrames.push(frame);
						audioBytes += frame.buffer.length;
						audioDuration += frame.header.duration;

					} else {
						downloadOffset -= frame.buffer.length;
						skipBuffer = SoundHelper.canSkipBuffer(downloadBuffer.slice(downloadOffset));
						header = null;
					}

					frame = null;
				}

				if (header && downloadOffset+header.size>downloadBuffer.length && contentBytes>downloadBytes) {
					break;

				} else if (header) {
					frame = { header, buffer: downloadBuffer.slice(downloadOffset, downloadOffset+header.size) }
					downloadOffset += frame.buffer.length;

				} else if (skipBuffer) {
					downloadOffset += skipBuffer;

				} else if (downloadOffset>SoundHelper.getMaxFrameSize()) {
					return audioBridge.error(-1);

				} else {
					downloadOffset++;
				}
			}

			parsed = downloadBytes>=contentBytes;

			if (frame) {
				if (parsed) {
					audioFrames.push(frame);
					audioBytes += frame.buffer.length;
					audioDuration += frame.header.duration;

				} else {
					downloadOffset -= frame.buffer.length;
				}
			}

			downloadBuffer = downloadBuffer.slice(downloadOffset);
			downloadOffset = 0;

			const audioDurationEstimate = (audioDuration/audioBytes)*Math.max(0, (contentBytes-downloadBytes)+downloadBuffer.length);

			if (audioDurationEstimate<=0 || Math.abs(1-duration/(audioDuration + audioDurationEstimate))>0.001) {
				duration = audioDuration + audioDurationEstimate;
				audioBridge.durationchange(duration);
			}

			if (SoundHelper.canPlay(contentBytes+audioBytesID3, audioBytes, audioDuration, context.currentTime-downloadStart)) {
				if (canplaythrough===false) {
					canplaythrough = true;
					audioBridge.canplaythrough();
				}
			}

			decodeBuffer();
		}

		let decoding = null;
		function decodeBuffer() {
			if (playing<=0 && seeking===false) {
				return false;

			} else if (decoding || nextSource!==null) {
				return false;
			}

			const startFrame = endFrame;
			const offsetFrame = endFrame>20 ? 20 : endFrame;
			const frames = audioFrames.slice(startFrame-offsetFrame, startFrame+100);

			if (parsed===false && frames.length<100) {
				if (buffering===false && currentSource===null) {
					buffering = true;
					audioBridge.waiting();
				}

			} else if (playing<=0) {
				seeking = false;
				audioBridge.seeked();

			} else if (parsed && frames.length<=offsetFrame) {
				if (currentSource===null) {
					playing = 0;
					audioBridge.ended();
				}

			} else {
				endFrame += frames.length-offsetFrame;

				const buffer = SoundHelper.mergeBuffers(frames.map(({ buffer }) => buffer));
				const samples = frames.reduce((total, { header }) => total+header.samples, 0);
				const duration = samples/frames[0].header.sample_rate/frames.length;

				decoding = buffer;
				context.decodeAudioData(buffer.buffer, function(decodedBuffer) {
					if (decoding!==buffer) {
						return null;
					}

					decoding = null;

					const volumeNode = context.createGain();
					const source = tmpsource || context.createBufferSource();
					tmpsource = null;
					source.buffer = decodedBuffer;

					connectVolume(volumeNode);
					source.connect(volumeNode);

					const thisSource = { volumeNode, source };

					source.addEventListener('ended', () => {
						if (currentSource===thisSource) {
							currentSource.volumeNode.disconnect();
							currentSource = nextSource;
							nextSource = null;

						} else if (nextSource===thisSource) {
							stopSource();
						}

						decodeBuffer();
					});

					if (currentSource===null) {
						currentSource = thisSource;
						currentSource.source.start(context.currentTime, duration*offsetFrame);
						startTime = context.currentTime - (endTime-startTime);
						endTime = context.currentTime + duration*(frames.length-offsetFrame);

						if (seeking) {
							seeking = false;
							audioBridge.seeked();
						}

						if (playing===1 || (playing>1 && buffering)) {
							playing = 2;
							buffering = false;
							audioBridge.playing();
						}

						decodeBuffer();

					} else {
						currentSource.volumeNode.gain.setValueAtTime(0, endTime-duration*10);

						nextSource = thisSource;
						nextSource.volumeNode.gain.value = 0.0;
						nextSource.volumeNode.gain.setValueAtTime(1.0, endTime-duration*10);
						nextSource.source.start(endTime-duration*offsetFrame, 0);
						endTime += duration*(frames.length-offsetFrame);
					}

				}, function(e) {
					audioBridge.error(-3); // corrupt - failed decoding audio
				});
			}
		}

		function stopSource() {
			try { currentSource && currentSource.volumeNode.disconnect(); } catch(e) {}
			try { currentSource && currentSource.source.stop(); } catch(e) {}
			try { nextSource && nextSource.volumeNode.disconnect(); } catch(e) {}
			try { nextSource && nextSource.source.stop(); } catch(e) {}

			currentSource = null;
			nextSource = null;
		}

		const controller = window.AbortController ? new window.AbortController() : {};
		const request = new window.Request(audioUrl, {
			credentials: 'include',
			method: 'POST', // https://bugs.webkit.org/show_bug.cgi?id=199492
			signal: controller.signal,
		});

		window.fetch(request).then(response => {
			if (response.status!==200 && response.status!==206) {
				return audioBridge.error(-1);
			}

			contentBytes = parseInt(response.headers.get('content-length'), 10);

			const contentAudioKey = parseInt(response.headers.get('audio-streaming-key'), 10) || 0;
			const reader = response.body.getReader();

			function read() {
				reader.read().then(({ done, value }) => {
					if (value) {
						downloadBytes += value.length;
						mergeBuffer(SoundHelper.decodeBuffer(value, contentAudioKey));
					}

					contentBytes = done ? downloadBytes : Math.max(contentBytes, downloadBytes);

		    		if (playing<0) {
		    			controller.abort && controller.abort();

		    		} else if (!done) {
		    			read();
		    		}
				}).catch(() => audioBridge.error(-1));
			}

			read();
		}).catch(() => audioBridge.error(-1));

		function pauseState(currentTime) {
			stopSource();
			decoding = null;
			const thisFrame = Math.ceil(endFrame/(endTime-startTime)*currentTime);
			const position = (thisFrame/endFrame)*(endTime-startTime);
			startTime = context.currentTime-position;
			endTime = context.currentTime;
			endFrame = thisFrame;
		}

		const control = {
			pause() {
				if (playing>0) {
					playing = 0;
					pauseState(this.currentTime);
				}
			},
			play() {
				if (playing===0) {
					playing = 1;
					buffering = false;

					if ((endTime-startTime)>=duration) {
						endTime = 0.0;
						startTime = 0.0;
						endFrame = 0;
					}

					decodeBuffer();
				}
			},
			destroy() {
				this.pause();
				playing = -1;
			},
			getLastError() {
				return [];
			},
		}

		Object.defineProperty(control, 'buffered', {
			get() { return audioDuration; },
		});

		Object.defineProperty(control, 'currentTime', {
			get() { return Math.min(endTime, context.currentTime)-startTime },
			set(currentTime) {
				pauseState(currentTime);
				seeking = true;
				audioBridge.seeking();
				decodeBuffer();
			}
		});

		return control;
	};
}
