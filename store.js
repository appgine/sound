
import * as timer from 'appgine/lib/lib/timer'
import { createConnector } from 'appgine/lib/helpers/createConnector'
import { defaultState, initSound, createSound } from './sound'
export { isFadeSupported } from './sound'

const connectorMonitor = createConnector();
const connectorUrl = createConnector(notify, 0);
connectorUrl.setDefaultDirty(false);

const initialState = {...defaultState(), label: null, nextTrack: false, loading: false, isCurrent: false, initial: true}
const initialControl = {play() {}, pause() {}, toggle() {}, seek() {}, fadeOut() {}};

const fadeOutSounds = [];
let fadeOutSignal = false;
let fadeInTimeout = null;
let fadeInAction = null;

let currentVolume = 100;
let currentTrack = null;
let nextTrack = null;

export function initial(label) {
	if (nextTrack && nextTrack.labels.indexOf(label)!==-1) {
		return {...nextTrack.state, label: nextTrack.label, dirty: nextTrack.dirty, control: nextTrack.control, nextTrack: false, loading: true, isCurrent: false, sound: nextTrack.sound};

	} else if (currentTrack && currentTrack.labels.indexOf(label)!==-1) {
		return {...currentTrack.state, label: currentTrack.label, dirty: currentTrack.dirty, control: currentTrack.control, nextTrack: !!nextTrack, loading: !!currentTrack.state.buffering, isCurrent: true, sound: currentTrack.sound};
	}

	return {...initialState, dirty: false, control: initialControl, nextTrack: !!nextTrack};
}

export function connect(label) {
	return connectorUrl.connect(label);
}

export function initialMonitor() {
	if (currentTrack) {
		return {...currentTrack, ...currentTrack.state, label: currentTrack.label, dirty: currentTrack.dirty, control: currentTrack.control, nextTrack: !!nextTrack, loading: !!(currentTrack.state.buffering || fadeOutSignal || fadeInAction)};
	}

	return {...initialState, dirty: false, control: initialControl, nextTrack: !!nextTrack};
}

export function connectMonitor() {
	return connectorMonitor.connect();
}

export function init() {
	initSound();
}

export function changeVolume(volume) {
	currentVolume = volume;
	fadeOutSounds.forEach(sound => sound.setVolume(Math.min(sound.getVolume(), volume)));

	if (currentTrack) {
		currentTrack.sound.setVolume(fadeInAction ? Math.min(currentTrack.sound.getVolume(), volume) : volume)
	}
}

export function preload(url, labels, label, userAction) {
	initSound();
	const born = Date.now();
	const thisSound = createSound(url);
	labels = Array.isArray(labels) ? labels : [labels];

	let thisTrack = null;
	function createTrack() {
		return thisTrack = thisTrack || {
			url, label, labels,
			sound: thisSound,
			dirty: false,
			state: {...thisSound.getState(), initial: false},
			paused: false,
			control: {
				play() {
					if (nextTrack) {
						nextTrack.paused = false;
					}

					if (thisTrack===currentTrack) {
						thisTrack.sound.play();
					}
				},
				pause(seconds=0) {
					timer.clearTimeout(fadeInTimeout);
					fadeInAction && fadeInAction(false);
					destroyFadeOut();

					if (nextTrack) {
						nextTrack.paused = true;
					}

					if (thisTrack===currentTrack) {
						if (seconds>0) {
							thisTrack.sound.fadeOutQuick(seconds);

						} else {
							thisTrack.sound.pause();
						}
					}
				},
				toggle() {
					if (thisTrack===currentTrack) {
						if (thisTrack.state.ended) {
							thisTrack.sound.seek(0);

						} else if (thisTrack.state.paused) {
							this.play();

						} else {
							this.pause();
						}
					}
				},
				seek(percent) {
					if (thisTrack===nextTrack || thisTrack===currentTrack) {
						if (thisTrack===currentTrack) {
							destroyFadeOut();
						}

						thisTrack.dirty = true;
						thisTrack.sound.seek(percent);
					}
				},
				fadeOut(seconds) {
					thisTrack.sound.fadeOut(seconds);
				}
			}
		};
	}

	nextTrack = userAction ? createTrack() : null;
	timer.setTimeout(notify, 0);

	const track = {
		destroy() {
			if (currentTrack===null || thisSound!==currentTrack.sound) {
				if (nextTrack===thisTrack) {
					nextTrack = null;
				}

				thisSound.destroy();
				timer.setTimeout(notify, 0);
			}
		},
		isReady() {
			return thisSound.isReady();
		},
		isFailed(seconds) {
			return !thisSound.isReady() && (thisSound.isFailed() || (seconds>0 && Date.now()-born>seconds*1000));
		},
		getLastError() {
			return thisSound.getLastError();
		},
		load() {
			paused: false,
			internalDestroy();
			changeSound(createTrack(), false);
		},
		play(fadeOut, fadeIn) {
			fadeOut = currentTrack && currentTrack.state.playing ? Math.max(0, fadeOut) : 0;

			fadeInAction = function(autoplay) {
				fadeInAction = null;
				internalDestroy();
				changeSound(createTrack(), autoplay ? fadeIn : false);
			}

			timer.clearTimeout(fadeInTimeout);

			if (fadeOut>0) {
				currentTrack.sound.fadeOutQuick(fadeOut);
				nextTrack = createTrack();
				fadeInTimeout = timer.setTimeout(() => fadeInAction && fadeInAction(true), fadeOut*1000);
				notify();

			} else {
				fadeInAction(true);
			}
		},
		fade(seconds) {
			timer.clearTimeout(fadeInTimeout);
			fadeInAction = null;

			if (currentTrack) {
				const fadeOutSound = currentTrack.sound;
				fadeOutSignal = true;
				fadeOutSounds.push(fadeOutSound);
				fadeOutSound.fadeOut(seconds);

				timer.setTimeout(function() {
					if (fadeOutSounds.indexOf(fadeOutSound)!==-1) {
						fadeOutSounds.splice(fadeOutSounds.indexOf(fadeOutSound), 1);
						fadeOutSignal = fadeOutSounds.legnth ? fadeOutSignal : false;
						fadeOutSound.destroy();
						notify();
					}
				}, seconds*1000);

				if (seconds>2) {
					timer.setTimeout(function() {
						if (fadeOutSignal && fadeOutSounds.indexOf(fadeOutSound)===fadeOutSounds.length-1) {
							fadeOutSignal = false;
							notify();
						}
					}, 2000);
				}
			}

			thisSound.fadeIn(seconds);
			changeSound(createTrack(), false);
		},
	}

	Object.defineProperties(track, {
		url: { value: url, writable: false },
		labels: { value: labels, writable: false },
		label: { value: label, writable: false },
	})

	return track;
}

function changeSound(thisTrack, fadeIn) {
	initialState.initial = false;
	nextTrack = null;
	currentTrack = thisTrack;

	if (currentTrack.state.paused!==true) {
		notify();
	}

	let autoplay = fadeIn!==false && thisTrack.paused===false && currentTrack.state.position<=0;

	thisTrack.sound.setVolume(currentVolume);
	thisTrack.sound.onstate(onState);
	onState(thisTrack.sound.getState());

	function onState(currentState) {
		if (currentTrack && currentTrack.sound===thisTrack.sound) {
			if (autoplay && currentState.paused) {
				autoplay = false;
				currentTrack.sound.fadeInQuick(fadeIn===true ? 0 : fadeIn);

			} else {
				currentTrack.dirty = false;
				Object.assign(currentTrack.state, {...currentState, initial: false})
				notify();
			}
		}
	}
}

export function destroy(seconds=0) {
	internalDestroy(seconds);
	timer.setTimeout(notify, 0);
}

function internalDestroy(seconds=0) {
	timer.clearTimeout(fadeInTimeout);
	fadeInAction = null;
	destroyFadeOut();
	currentTrack && currentTrack.sound.fadeOut(seconds);
	currentTrack = null;
	nextTrack = null;
}

function destroyFadeOut()
{
	fadeOutSignal = false;
	fadeOutSounds.forEach(sound => sound.destroy());
	fadeOutSounds.splice(0, fadeOutSounds.length);
}

function notify() {
	let connected = false;
	connectorUrl.forEach(handler => {
		const state = initial(handler.props);

		if (state.dirty===false) {
			if (state.isCurrent || (state.loading && state.nextTrack===false)) {
				connected = true;
				handler.dirty = true;
				handler.resolve(state);

			} else if (handler.dirty) {
				handler.dirty = false;
				handler.resolve(state);
			}
		}
	});

	connectorMonitor.forEach(handler => {
		const state = initialMonitor();

		if (state.dirty===false) {
			state.connected = connected;
			handler.resolve(state);
		}
	});
}
