
import * as SoundHelper from '../lib/helper.js'


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
		let downloadBuffer = new Uint8Array(0);
		let contentBytes = Infinity;

		let parsed = false;
		let endFrame = 0;
		let currentSource = null;
		let nextSource = null;

		let startTime = 0.0;
		let endTime = 0.0;

		function mergeBuffer(buffer) {
			downloadBuffer = SoundHelper.mergeBuffers([downloadBuffer, SoundHelper.decodeBuffer(buffer, 0)]);

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
			let offset = 0;
			let frame = null;
			while (offset<downloadBuffer.length-10) {
				let header = SoundHelper.resolveFrameHeader(downloadBuffer.slice(offset, offset+6));
				let skipBuffer = header ? 0 : SoundHelper.canSkipBuffer(downloadBuffer.slice(offset));

				if (frame) {
					if (header || skipBuffer) {
						audioFrames.push(frame);
						audioBytes += frame.buffer.length;
						audioDuration += frame.header.duration;

					} else {
						offset -= frame.buffer.length;
						skipBuffer = SoundHelper.canSkipBuffer(downloadBuffer.slice(offset));
						header = null;
					}

					frame = null;
				}

				if (header && offset+header.size>downloadBuffer.length && contentBytes>downloadBytes) {
					break;

				} else if (header) {
					frame = { header, buffer: downloadBuffer.slice(offset, offset+header.size) }
					offset += frame.buffer.length;

				} else if (skipBuffer && offset+skipBuffer>downloadBuffer.length && contentBytes>downloadBytes) {
					break;

				} else if (skipBuffer) {
					offset += skipBuffer;

				} else {
					offset++;
				}
			}

			parsed = downloadBytes>=contentBytes;

			if (frame) {
				if (parsed) {
					audioFrames.push(frame);
					audioBytes += frame.buffer.length;
					audioDuration += frame.header.duration;

				} else {
					offset -= frame.buffer.length;
				}
			}

			downloadBuffer = downloadBuffer.slice(offset);

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

		let decoding = 0;
		function decodeBuffer() {
			if (playing<=0 && seeking===false) {
				return false;

			} else if (decoding>0 || nextSource!==null) {
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

				decoding = 1;
				context.decodeAudioData(buffer.buffer, function(buffer) {
					decoding = 0;

					const volumeNode = context.createGain();
					const source = tmpsource || context.createBufferSource();
					tmpsource = null;
					source.buffer = buffer;

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
					decoding = 2;
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
		const request = new Request(audioUrl, {
			credentials: 'include',
			method: 'POST', // https://bugs.webkit.org/show_bug.cgi?id=199492
			signal: controller.signal,
		});

		window.fetch(request).then(response => {
			if (response.status!==200 && response.status!==206) {
				return audioBridge.error(-1);
			}

			contentBytes = parseInt(response.headers.get('content-length'), 10);

			const reader = response.body.getReader();

			function read() {
				reader.read().then(({ done, value }) => {
					if (value) {
						downloadBytes += value.length;
						mergeBuffer(value);
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
