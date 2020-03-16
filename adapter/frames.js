
import * as SoundHelper from '../lib/helper.js'


export default function create(context) {

	let tmpsource = context.createBufferSource();

	return function(audioUrl, audioBridge, connectVolume) {
		let playing = 0;
		let waiting = true;
		let seeking = false;
		let canplaythrough = false;
		let starttime = 0;
		let position = 0.0;
		let duration = 0.0;

		let audioDuration = 0.0;
		let audioDurationEstimate = 0.0;
		let audioBytes = 0;
		let audioBytesID3 = false;
		let audioFrames = [];

		let downloadStart = context.currentTime;
		let downloadBytes = 0;
		let downloadBuffer = new Uint8Array(0);
		let contentBytes = Infinity;

		let source = null;

		function processBuffer(buffer, done) {
			if (buffer) {
				downloadBytes += buffer.length;
				mergeBuffer(buffer);
			}

			contentBytes = done ? downloadBytes : Math.max(contentBytes, downloadBytes);
		}

		function mergeBuffer(buffer) {
			downloadBuffer = SoundHelper.mergeBuffers([downloadBuffer, SoundHelper.decodeBuffer(buffer, 0)]);

			if (audioBytesID3===false) {
				audioBytesID3 = SoundHelper.resolveID3Size(downloadBuffer);
			}

			if (audioBytesID3===false) {
				return true;

			} else if (audioBytesID3>downloadBuffer.length) {
				return true;

			} else if (audioBytesID3>0) {
				downloadBuffer = downloadBuffer.slice(audioBytesID3);
				audioBytesID3 = -audioBytesID3;
			}

			return decodeBuffer();
		}

		let decoding = 0;
		let frameWindowBuffer = new Uint8Array(0);
		let frameWindowNext = { headers: [], size: 0, size2: 0, startsize: 0, startsamples: 0, endsize: 0, endsamples: 0 };
		function decodeBuffer() {
			if (decoding>0 || downloadBuffer.length===0) {
				return true;
			}

			let frameStart = null;
			let frameEnd = 0;
			let frameBuffer = frameWindowBuffer;
			let frameHeaders = [...frameWindowNext.headers];
			let frameWindow = frameWindowNext;

			while (frameEnd<downloadBuffer.length-10) {
				const frameHeader = SoundHelper.resolveFrameHeader(downloadBuffer.slice(frameEnd, frameEnd+6));

				if (frameHeader) {
					if (frameEnd+frameHeader.size <= downloadBuffer.length) {
						frameStart = frameStart===null ? frameEnd : frameStart;
						frameHeaders.push({ frameHeader, offset: frameEnd });
						frameEnd += frameHeader.size;

					} else if (contentBytes===downloadBytes) {
						frameStart = frameStart===null ? frameEnd : frameStart;
						frameHeaders.push({ frameHeader, offset: frameEnd });
						frameEnd = downloadBuffer.length;
						break;

					} else {
						break;
					}

				} else if (frameStart!==null) {
					frameBuffer = SoundHelper.mergeBuffers([frameBuffer, downloadBuffer.slice(frameStart, frameEnd)]);
					frameStart = null;

				} else if (SoundHelper.canSkipBuffer(downloadBuffer)) {
					frameEnd += SoundHelper.canSkipBuffer(downloadBuffer);

				} else {
					frameEnd++;
				}
			}

			if (frameStart!==null) {
				frameBuffer = SoundHelper.mergeBuffers([frameBuffer, downloadBuffer.slice(frameStart, frameEnd)]);
				frameStart = null;
			}

			if (frameBuffer.length>16384 || contentBytes===downloadBytes) {
				decoding = 1;

				downloadBuffer = downloadBuffer.slice(contentBytes===downloadBytes ? downloadBuffer.length : frameEnd);

				const remainingBytes = Math.max(0, (contentBytes-downloadBytes)+downloadBuffer.length);

				frameWindowNext = { headers: [], size: 0, size2: 0, startsize: 0, startsamples: 0, endsize: 0, endsamples: 0 };

				for (let i=frameHeaders.length-1; i>=0; i--) {
					const { size, samples } = frameHeaders[i].frameHeader;

					if (remainingBytes>0 && frameWindowNext.size<=1024) {
						frameWindowNext.headers.unshift({...frameHeaders[i]});
						frameWindowNext.size += size;

					} else if (remainingBytes>0 && frameWindowNext.size2<=1024) {
						frameWindowNext.headers.unshift({...frameHeaders[i]});
						frameWindowNext.size += size;
						frameWindowNext.size2 += size;
						frameWindowNext.endsize += size;
						frameWindowNext.endsamples += samples;
						frameWindowNext.startsize += size;
						frameWindowNext.startsamples += samples;

					} else {
						frameWindowNext.endsize += size;
						frameWindowNext.endsamples += samples;
					}
				}

				frameWindowBuffer = new Uint8Array(frameWindowNext.size);
				frameWindowNext.size && frameWindowBuffer.set(frameBuffer.slice(-frameWindowNext.size), 0);

				context.decodeAudioData(frameBuffer.buffer, function(buffer) {
					decoding = 0;

					buffer = SoundHelper.sliceAudioBuffer(context, buffer, frameWindow.startsamples, frameWindowNext.endsamples);
					audioFrames.push(buffer);
					audioBytes += frameWindowNext.endsize-frameWindow.startsize;
					audioDuration += buffer.duration;
					audioDurationEstimate = (audioDuration/audioBytes)*remainingBytes;

					if (remainingBytes<=0 || Math.abs(1-duration/(audioDuration + audioDurationEstimate))>0.001) {
						duration = audioDuration + audioDurationEstimate;
						audioBridge.durationchange(duration);
					}

					if (SoundHelper.canPlay(contentBytes+audioBytesID3, audioBytes, audioDuration, context.currentTime-downloadStart)) {
						tryPlayAudio(true);
					}

					decodeBuffer();

				}, function(e) {
					decoding = 2;

					if (remainingBytes>0) {
						audioBridge.error(-3); // corrupt - failed decoding audio
					}
				});

			} else if (frameBuffer.length===0 && frameEnd>1024) {
				decoding = 2;
				audioBridge.error(-3); // corrupt - missing frames
			}
		}

		function stopSource(source) {
			try {
				source && source.disconnect();
				source && source.stop();
			} catch (e) {}
		}

		function tryPlayAudio(_canplaythrough=false) {
			if (audioDuration>=Math.min(duration, position+4.0)) {
				if (canplaythrough===false && _canplaythrough) {
					canplaythrough = true;
					audioBridge.canplaythrough();
				}

				if (source===null) {
					changeSource(createSource(), position);

				} else if (playing===1) {
					playSource(source, position);
				}

			} else if (playing>0 && waiting===false) {
				waiting = true;
				audioBridge.waiting();
			}
		}

		function createSource() {
			if (audioFrames.length>1) {
				audioFrames = [SoundHelper.mergeAudioFrames(context, audioFrames)];
				audioDuration = audioFrames[0].duration;
				duration = audioDuration + audioDurationEstimate;
				audioBridge.durationchange(duration);
			}

			const source = tmpsource || context.createBufferSource();
			source.buffer = audioFrames[0];
			connectVolume(source);
			tmpsource = null;

			return source;
		}

		function changeSource(thisSource, thisPosition) {
			const tmpsource = source;
			source = thisSource;
			position = thisPosition;
			starttime = context.currentTime;
			stopSource(tmpsource);

			if (playing>0) {
				playSource(source, position);
			}

			if (seeking) {
				seeking = false;
				audioBridge.seeked();
			}
		}


		function playSource(thisSource, thisPosition) {
			let nexttimeout = null;
			const thisDuration = thisSource.buffer.duration;

			let nextAudioBind = function() {
				clearTimeout(nexttimeout);

				stopSource(source);
				source = null;
				position = thisDuration;
				starttime = context.currentTime;

				if (position<duration) {
					if (playing>0) {
						tryPlayAudio();
					}

				} else {
					playing = 0;
					audioBridge.ended();
				}
			};

			thisSource.addEventListener('ended', () => {
				clearTimeout(nexttimeout);

				if (thisSource===source && playing===2) {
					nextAudioBind();
				}
			});

			if (thisDuration<duration) {
				nexttimeout = setTimeout(function() {
					if (thisSource===source && playing===2 && thisDuration<audioDuration) {
						nextAudioBind = changeSource.bind(null, createSource(), thisDuration);
					}

				}, Math.max(100, parseInt((thisDuration-thisPosition)*1000, 10)-1000));
			}

			position = thisPosition;
			starttime = context.currentTime;
			thisSource.start(0, thisPosition);

			if (playing===1 || (playing>1 && waiting)) {
				playing = 2;
				waiting = false;
				audioBridge.playing();
			}
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
					processBuffer(value, done);

		    		if (playing<0) {
		    			controller.abort && controller.abort();

		    		} else if (!done) {
		    			read();
		    		}
				}).catch(() => audioBridge.error(-1));
			}

			read();
		}).catch(() => audioBridge.error(-1));

		const control = {
			pause() {
				position = this.currentTime;
				starttime = context.currentTime;
				stopSource(source);
				source = null;
				playing = 0;
			},
			play() {
				if (playing===0) {
					playing = 1;
					waiting = false;
					position = position===duration ? 0.0 : position;
					tryPlayAudio();
				}
			},
			destroy() {
				this.pause();
				playing = -1;
			}
		}

		Object.defineProperty(control, 'currentTime', {
			get() { return position + (source && playing===2 ? context.currentTime-starttime : 0); },
			set(currentTime) {
				stopSource(source);
				source = null;
				position = currentTime;
				seeking = true;
				audioBridge.seeking();
				tryPlayAudio();
			}
		});

		return control;
	};
}
