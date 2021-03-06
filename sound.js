
import withOffset from './adapter/withOffset'
import createFadeArray from './lib/createFadeArray'
import createVolumeNode from './lib/createVolumeNode'

import adapterAudio from './adapter/audio'
import adapterFrames, { canUse as canUseFrames } from './adapter/frames'

import * as timer from 'appgine/hooks/backgroundTimer'


export function defaultState() {
	return {
		error: false,
		buffering: false,
		playing: false, paused: false, ended: true,
		volume: 1,
		starttime: 0, position: 0.0, duration: 0.0,
	}
}


let _initList = [];
export function onInit(fn) {
	_initList.push(fn);
}


export function isStreamingSupported() {
	return isFadeSupported() && canUseFrames();
}


let audioCtx;
let audioAdapterFactory;
let audioFactory;
export function initSound() {
	if (audioCtx===undefined) {
		audioCtx = null;

		if (isFadeSupported()) {
			audioCtx = new (window.AudioContext || window.webkitAudioContext)();
		}

		_initList.forEach(fn => fn(audioCtx, true));

	} else {
		_initList.forEach(fn => fn(audioCtx, false));
	}

	if (audioAdapterFactory===undefined) {
		if (audioCtx && canUseFrames()) {
			audioAdapterFactory = withOffset(adapterFrames, false);

		} else {
			audioAdapterFactory = withOffset(adapterAudio, true);
		}
	}

	audioFactory = audioFactory || audioAdapterFactory(audioCtx);

	return function(...args) {
		const audio = (audioFactory || audioAdapterFactory(audioCtx))(...args);
		audioFactory = null;
		return audio;
	}
}


export function isFadeSupported() {
	return !!(window.fetch && (window.AudioContext || window.webkitAudioContext));
}


export function createSound(endpoint) {
	const audioFactory = initSound();
	let fadeNode;
	let volumeNode;

	if (audioCtx) {
		fadeNode = audioCtx.createGain();
		fadeNode.gain.value = 0;
		fadeNode.connect(audioCtx.destination);

		volumeNode = audioCtx.createGain();
		volumeNode.connect(fadeNode);

	} else {
		fadeNode = null;
		volumeNode = createVolumeNode();
	}

	const listeners = {state: [], download: []};
	let playing = null;
	let buffering = false;
	let error = false;
	let duration = 0.0;
	let seeking = 0;

	const audioBridge = {
		durationchange(_duration) {
			const changed = Math.ceil(duration)!==Math.ceil(_duration);
			duration = _duration;
			changed && notifyNext();

			if (seeking) {
				buffering = true;
				audio.currentTime = Math.max(0, Math.min(duration-1, duration*Math.max(0, Math.min(1, seeking))));
				seeking = 0;
			}
		},
		canplaythrough() {
			if (playing===null) {
				playing = 0;
				notify();
			}
		},
		ended() {
			playing = -1;
			notify();
		},
		seeking() {
			buffering = true;
			notifyNext();
		},
		seeked() {
			notifyNext();

			if (buffering) {
				buffering = false;

				if (playing<=0) {
					fadePlayer(false, true, audio.currentTime>1 ? 1 : 0);
				}
			}
		},
		waiting() {
			if (error) {
				pauseState(true);

			} else if (playing>0) {
				buffering = true;
				notifyNext();
			}
		},
		error(_error) {
			if (buffering) {
				pauseState(true, notifyNext);
			}

			error = _error||-1;
			notify();
		},
		pause() {
			if (playing>0 || buffering) {
				playing = audio.currentTime>=duration ? -1 : 0;
				buffering = false;
				notify();
				fadePlayer(true, false);
			}
		},
		playing() {
			buffering = false;
			notify();

			if (playing<=0) {
				fadePlayer(true, true);
			}
		},
	};

	function createState() {
		const isBuffering = buffering || seeking || playing===null;
		return {
			error: isBuffering && error!==false,
			buffering: isBuffering,
			playing: isBuffering===false && playing===1, paused: playing===0, ended: playing===-1,
			volume: volumeNode.gain.value,
			starttime: Date.now(), position: Math.min(duration, audio.currentTime), duration,
		};
	}

	let notifytimeout = null;
	function notify() {
		timer.clearBackgroundTimeout(notifytimeout);
		listeners.state.filter(_ => true).forEach(fn => fn(createState()));
	}

	function notifyNext() {
		timer.clearBackgroundTimeout(notifytimeout);
		notifytimeout = timer.setBackgroundTimeout(notify, 100);
	}

	function changeVolume(volume) {
		volumeNode.gain.value = Math.min(volumeNode.gain.maxValue||1.0, Math.max(volumeNode.gain.minValue||0.0, volume/100))
		notifyNext();
	}

	function pauseState(ended=false, fn=notify) {
		if (audio.currentTime>=duration) {
			playing = -1;
			fn();

		} else if (playing>0) {
			playing = ended ? null : 0;
			buffering = false;
			audio.pause();
			fn();
			fadePlayer(true, false);

		} else if (ended && playing!==null) {
			playing = null;
			fn();
		}
	}

	function fadePlayer(quick, isFadeIn, seconds=0) {
		let newFadeNode = null;

		if (fadeNode) {
			fadeNode.gain.cancelScheduledValues(audioCtx.currentTime);

			newFadeNode = audioCtx.createGain();
			newFadeNode.gain.value = isFadeIn ? 1.0 : 0.0;

			if (seconds>0) {
				const fadeArray = createFadeArray(100, fadeNode.gain.value, quick, isFadeIn);
				newFadeNode.gain.setValueCurveAtTime(fadeArray, audioCtx.currentTime, seconds);
			}

			newFadeNode.connect(audioCtx.destination);
			volumeNode.disconnect();
			volumeNode.connect(newFadeNode);
			fadeNode = newFadeNode;
		}

		if (isFadeIn) {
			if (playing < 1) {
				playing = 1;
				audio.play();
				notify();
			}

		} else if (playing>0 && fadeNode) {
			timer.setBackgroundTimeout(() => newFadeNode===fadeNode && pauseState(), seconds*1000);

		} else if (playing>0) {
			pauseState();
		}
	}

	const audio = audioFactory(endpoint, audioBridge, function(source) {
		if (fadeNode===null) {
			volumeNode.connect(source);

		} else if (source instanceof HTMLMediaElement) {
			const audioSource = audioCtx.createMediaElementSource(source);
			audioSource.connect(volumeNode);

		} else if (source instanceof AudioBufferSourceNode) {
			source.connect(volumeNode);

		} else if (source instanceof GainNode) {
			source.connect(volumeNode);
		}
	});

	return {
		getState() {
			return createState();
		},
		getLastError() {
			return audio.getLastError();
		},
		isReady() {
			return playing!==null;
		},
		isFailed() {
			return playing===null && error!==false;
		},
		onstate(fn) {
			listeners.state.push(fn);
			return function() {
				if (listeners.state.indexOf(fn)!==-1) {
					listeners.state.splice(listeners.state.indexOf(fn), 1);
				}
			}
		},
		ondownload(fn) {
			listeners.download.push(fn);
			return function() {
				if (listeners.download.indexOf(fn)!==-1) {
					listeners.download.splice(listeners.download.indexOf(fn), 1);
				}
			}
		},
		getVolume() {
			return volumeNode.gain.value*100;
		},
		setVolume: changeVolume,
		seek(percent) {
			buffering = true;
			seeking = percent;

			if (duration>0) {
				audio.currentTime = Math.max(0, Math.min(duration-1, duration*Math.max(0, Math.min(1, percent))));
				seeking = 0;
			}
		},
		play: fadePlayer.bind(null, false, true, 0),
		pause: () => pauseState(),
		fadeIn: fadePlayer.bind(null, false, true),
		fadeInQuick: fadePlayer.bind(null, true, true),
		fadeOut: fadePlayer.bind(null, false, false),
		fadeOutQuick: fadePlayer.bind(null, true, false),
		stop() {
			pauseState();
			playing = -1;
			audio.currentTime = 0.0;
			notify();
		},
		destroy() {
			listeners.state.splice(0, listeners.state.length);
			listeners.download.splice(0, listeners.download.length);
			pauseState();
			playing = null;
			audio.destroy();
		},
	}
}
