
import { uri } from 'appgine/lib/closure'
import * as errorhub from 'appgine/errorhub'
import * as SoundStore from '../store'
import domDistance, { domDistanceCompare } from '../lib/dom-distance'
import { findCurrentTrack, findNextSound, findNextTrack, findPrevTrack, formatPlaylistTrack } from '../lib/playlist'
export { isFadeSupported } from '../store'

export default function create(enabled, state, bridge) {
	enabled = !!enabled;

	let playerState = SoundStore.initialMonitor();

	const logFailed = this.dispatch.bind(this, 'player-failed');
	const logSource = this.dispatch.bind(this, 'player-source');

	const settings = {
		fadeTime: false,
		sampleTime: false,
		repeat: false,
	}

	let updateinterval = null;
	state.initial({
		visible: false,
		rendering: null,
		autoPlaySource: false,
		autoPlayTrack: false,
		seeking: false,
		labels: [],
		playlist: {
			id: null,
			current: null,
			name: '',
			tracks: [],
			bought: false,
			loading: false,
			disabled: [],
		},
	});

	const targets = this.createTargets();
	const ajax = this.ajax.bind(this);

	function canToggleBought() {
		const numOfBoughtTracks = state.playlist.tracks.filter(track => track.bought).length;
		return numOfBoughtTracks>0 && numOfBoughtTracks<state.playlist.tracks.length;
	}

	function setPlaylistBought(toggled) {
		state.playlist.bought = toggled && canToggleBought();

		let index = 1;
		state.playlist.tracks.forEach(function(row) {
			row.playlistIndex = index;
			index += !state.playlist.bought || row.bought>0;
		});
	}

	function setCurrentTrack(thisTrack) {
		if (thisTrack.playlistid===state.playlist.id) {
			state.labels = thisTrack.labels;
		}

		currentTrack = thisTrack;
		destroyNextSound();
		setPlaylistBought(state.playlist.bought && thisTrack.data.bought>0);
		bridge.changeCurrentTrack(currentTrack);
	}

	function stopPlayer() {
		SoundStore.destroy(2);
		playerState = SoundStore.initialMonitor();
		clearInterval(updateinterval);
		updateinterval = null;
		currentTrack = null;
		destroyNextSound();
		state.labels = [];
		state.playlist.id = null;
		state.playlist.current = null;
		state.playlist.tracks = [];
		state.playlist.loading = false;
		state.playlist.bought = false;
		render(false);
	}

	function destroyNextSound() {
		nextTrack = null;
		nextSound && nextSound.destroy();
		nextSound = null;
		nextSoundAction = null;
	}

	function findCurrentSource($element) {
		let best = null;
		for (let target of targets.findAll('source')) {
			if ($element) {
				const distance = domDistance($element, target.$target, true);

				if (distance) {
					distance.data = target.data;
					distance.disabled = state.playlist.disabled.indexOf(target.data)!==-1

					if (best===null) {
						best = distance

					} else if (domDistanceCompare(best, distance)>0) {
						best = distance;

					} else if (domDistanceCompare(best, distance)===0 && best.disabled && !distance.disabled) {
						best = distance;
					}
				}

			} else if (state.playlist.disabled.indexOf(target.data)===-1) {
				return target.data;
			}
		}

		return best && best.data;
	}

	let currentTrack = null;
	let nextTrack = null;
	let nextSound = null;
	let nextSoundAction = null;

	function onPlayEvent($element, url, labels, label) {
		destroyNextSound();

		let nextLabels = [];
		if (label) {
			nextTrack = findCurrentTrack(state.playlist, label);

			if (nextTrack) {
				nextLabels = nextTrack.labels;
				nextSound = SoundStore.preload(nextTrack.url, nextTrack.labels, nextTrack.label, true);

			} else if (url && labels) {
				nextLabels = labels;
				nextSound = SoundStore.preload(url, labels, label, true)
			}

			nextSoundAction = nextSound;
		}

		const nextSource = $element && findCurrentSource($element);

		if (nextSource && state.playlist.id!==nextSource) {
			loadSource(nextSource, nextLabels, false);
		}

		if (nextSoundAction && nextTrack===null && state.playlist.loading===false) {
			logFailed('play');
			stopPlayer();

		} else if (nextSoundAction || nextTrack) {
			render(true);
		}
	}

	this.listen('play', onPlayEvent);
	this.listen('autoplay', function($element, url, labels, label) {
		if (nextTrack && nextTrack.label===label) {
			nextSoundAction = nextSound;

		} else if (currentTrack===null || currentTrack.label!==label) {
			onPlayEvent($element, url, labels, label);
		}
	});

	targets.complete(updateActivePlaylist);

	targets.every(['container', 'source', 'playlist'], function($container) {
		$container.classList.toggle('hidden', enabled===false);
	});

	targets.every(['source', 'playlist'], function($btn, target) {
		const source = typeof target.data==='string' ? target.data : target.data.source;
		const label = typeof target.data==='object' && target.data.label || null;
		const playBought = typeof target.data==='object' && target.data.playBought || false;

		if (state.autoPlaySource===false && uri.isSame(source)) {
			state.autoPlaySource = true;
			logSource(source, 'autoplay');
			toggleSource(source, label, playBought, false);
		}
	});

	targets.every('playlist', function($btn, target) {
		const source = typeof target.data==='string' ? target.data : target.data.source;
		const label = typeof target.data==='object' && target.data.label || null;
		const playBought = typeof target.data==='object' && target.data.playBought || false;

		function onClick(e) {
			e && e.preventDefault();
			toggleSource(source, label, playBought, true);
		}

		$btn.addEventListener('click', onClick);
		return function() {
			$btn.removeEventListener('click', onClick)
			$btn.classList.remove('active');
		}
	});

	const monitor = SoundStore.connectMonitor();

	monitor.then(function(currentState) {
		if (updateinterval===null && (state.visible || nextSound || nextSoundAction)) {
			updateinterval = setInterval(update, 250);
		}

		if (currentState.label && nextSound===null && nextTrack && nextTrack.label===currentState.label) {
			setCurrentTrack(nextTrack);
		}

		const shouldUpdate = playerState.playing && currentState.ended;
		playerState = currentState;
		shouldUpdate && update();
		shouldUpdate ? setTimeout(render, 0) : render();
	});

	function toggleSource(source, label, playBought, play=false) {
		const active = state.visible && (state.playlist.id===source || (label && state.labels.indexOf(label)!==-1));
		state.autoPlayTrack = true;

		if (active) {
			logSource(source, playerState.ended || playerState.paused ? 'play' : 'pause');
			playerState.paused && bridge.userAction();
			playerState.control.toggle();

		} else {
			loadSource(source, [label], playBought, function() {
				if (play || playerState.paused || playerState.ended) {
					const thisNextTrack = findNextTrack(state.playlist, {track: -1});
					thisNextTrack && loadTrack(thisNextTrack.track, thisNextTrack.index);
				}
			});
		}
	}

	function loadSource(source, labels, playBought, fn) {
		if (state.playlist.id!==source) {
			state.playlist.id = source;
			state.playlist.loading = true;
			state.labels = labels;

			SoundStore.init();

			render(true);

			setTimeout(function() {
				logSource(source, 'load');
				ajax(source, function(status, response) {
					if (state.playlist.id===source) {
						const tracks = response && response.json && Array.isArray(response.json.playlist) ? response.json.playlist : [];

						if (tracks.length===0) {
							state.playlist.disabled.push(state.playlist.id);
							state.playlist.id = state.playlist.current;
							state.playlist.loading = false;

							if (currentTrack===null) {
								logFailed('empty');
								return stopPlayer();

							} else if (nextSound && nextTrack===null) {
								logFailed('empty-next');
								return destroyNextSound();
							}

							return render();
						}

						state.playlist.current = state.playlist.id;
						state.playlist.name = response && response.json && response.json.name || '';
						state.playlist.tracks = tracks.map((row, i) => ((row.track = i), row));
						state.playlist.loading = false;
						setPlaylistBought(!!playBought);

						fn && fn();

						if (currentTrack && currentTrack.label && currentTrack.label===playerState.label) {
							currentTrack = findCurrentTrack(state.playlist, playerState.label) || currentTrack;
						}

						const nextTrackLabel = (nextTrack || nextSound || nextSoundAction || {}).label;
						nextTrack = nextTrackLabel && findCurrentTrack(state.playlist, nextTrackLabel) || nextTrack || null;

						if (nextTrack && nextSound===null && playerState.label && nextTrack.label===playerState.label) {
							setCurrentTrack(nextTrack);

						} else if (nextTrack===null && (nextSound || nextSoundAction)) {
							logFailed('next');
							stopPlayer();
						}

						render((currentTrack || nextTrack) ? true : undefined);
					}
				});
			}, 0);
		}
	}

	function loadTrack(i, j) {
		const thisNextTrack = formatPlaylistTrack(state.playlist, i, j);

		if (thisNextTrack && nextTrack && nextTrack.track===i && nextTrack.index===j && nextTrack.label===thisNextTrack.label) {
			nextSoundAction = nextSound;
			render(true);

		} else if (thisNextTrack) {
			destroyNextSound();
			nextTrack = thisNextTrack;
			nextSound = nextTrack && SoundStore.preload(nextTrack.url, nextTrack.labels, nextTrack.label, true);
			nextSoundAction = nextSound;
			render(true);
		}
	}

	function playNextSound(sound, pending) {
		const { position, duration } = computePlayerState();

		let endOffset = 0;
		let fn = sound.play.bind(null, Math.max(0, settings.sampleTime), nextTrack && nextTrack.samplestart && Math.max(0, settings.sampleTime) || 0);

		if (!nextTrack) {
			if (state.visible && settings.fadeTime>0 && playerState.playing) {
				fn = sound.fade.bind(null, settings.fadeTime);
			}

			return fn;

		} else if (!currentTrack || playerState.error) {
			return fn;
		}

		if (pending===null && nextTrack.track<=currentTrack.track && nextTrack.index===0 && settings.repeat===false) {
			endOffset = Math.max(0, settings.sampleTime);
			fn = sound.play.bind(null, endOffset, false);

		} else if (currentTrack.track===nextTrack.track && currentTrack.playlistid===nextTrack.playlistid) {
			endOffset = Math.max(0, settings.sampleTime);
			fn = sound.play.bind(null, endOffset, endOffset);

		} else if (pending===null && state.autoPlayTrack===false) {
			endOffset = currentTrack.sampleend ? Math.max(0, settings.sampleTime) : 0;
			fn = sound.play.bind(null, endOffset, false);

		} else if (state.visible && settings.fadeTime>0 && playerState.playing) {
			endOffset = settings.fadeTime;
			fn = sound.fade.bind(null, settings.fadeTime);

		} else if (settings.sampleTime>0 && (currentTrack.sampleend || position<duration)) {
			endOffset = settings.sampleTime;
			fn = sound.play.bind(null, settings.sampleTime, nextTrack.samplestart && settings.sampleTime || 0);
		}

		if (pending || duration-position <= endOffset) {
			return fn;
		}

		return false;
	}

	function updateActivePlaylist() {
		targets.findAll('playlist', function(target) {
			const source = typeof target.data==='string' ? target.data : target.data.source;
			const label = typeof target.data==='object' && target.data.label || null;
			const active = (((state.visible || state.playlist.loading) && state.playlist.id===source) || (label && state.labels.indexOf(label)!==-1));
			const playing = active && (playerState.playing || playerState.buffering || state.playlist.loading || nextSoundAction);

			target.$element.classList.toggle('active', active);
			target.$element.classList.toggle('playing', playing);
			target.$element.disabled = state.playlist.disabled.indexOf(source)!==-1;
		});

		let connected = false;
		targets.findAll('source', function(target) {
			connected = connected || state.playlist.id===target.data;
		});

		if (enabled===false && playerState.playing && connected===false && playerState.connected===false) {
			stopPlayer();
		}
	}

	function render(visible) {
		visible = visible===undefined ? (state.rendering ? state.rendering.visible : state.visible) : visible;

		if (!enabled) {
			state.visible = visible;
			updateActivePlaylist();
			return false;
		}

		if (state.rendering) {
			state.rendering.visible = visible;
			return true;

		} else if (visible) {
			const track = currentTrack || nextTrack;
			const props = {
				player: {
					...playerState,
					loading: playerState.loading || nextSoundAction!==null || state.playlist.loading,
				},
				name: state.playlist.name,
				playlist: state.playlist.bought ? state.playlist.tracks.filter(track => track.bought) : state.playlist.tracks,
				track: track ? {
					...track.data,
					index: track.track,
					indexSample: track.index,
				} : null,
				nextTrack: (nextSoundAction && nextTrack) ? {
					...nextTrack.data,
					index: nextTrack.track,
					indexSample: nextTrack.index,
				} : null,
				playerState: computePlayerState,
				settings: {...settings},
				enable: {
					next: track && !!findNextTrack(state.playlist, (nextSoundAction && nextTrack) || track),
					prev: track && !!findPrevTrack(state.playlist, (nextSoundAction && nextTrack) || track),
				},
			}

			const changed = state.visible!==true;
			bridge.show(props, changed);

			if (changed) {
				state.visible = true;
				state.rendering = { visible: true };
			}

		} else if (state.visible) {
			state.visible = false;
			bridge.hide();
		}

		bridge.render(state.visible, playerState.playing);
		updateActivePlaylist();
	}

	function update() {
		const computedPlayerState = computePlayerState();

		if (state.visible || nextSoundAction) {
			if (nextSound) {
				nextTrack = nextTrack || findCurrentTrack(state.playlist, nextSound.label);

				const thisNextFn = nextSound.isReady() && playNextSound(nextSound, nextSoundAction);
				const isUserAction = nextSoundAction!==null;

				if (thisNextFn) {
					nextSoundAction = nextSound;
					nextSound = null;
					state.seeking = false;

					setTimeout(function() {
						thisNextFn();
						isUserAction && bridge.userAction();
					}, 0);

				} else if (nextSound.isFailed()) {
					logFailed('sound', nextSound.label);
					errorhub.dispatch(0, 'playerState.failed', new Error('playerState.failed'), nextTrack && nextTrack.url || 'unknown track');
					return stopPlayer();
				}

			} else if (nextSoundAction===null && playerState.error) {
				nextTrack = currentTrack && findNextSound(state.playlist, currentTrack, enabled && state.autoPlayTrack, false)
				nextSound = nextTrack && SoundStore.preload(nextTrack.url, nextTrack.labels, nextTrack.label, false);
				nextSoundAction = null;

				if (!nextTrack) {
					logFailed('error');
					errorhub.dispatch(0, 'playerState.error', new Error('playerState.error'), currentTrack.url);
					return stopPlayer();
				}

			} else if (nextSoundAction===null && playerState.playing && playerState.duration-computedPlayerState.position<Math.max(0, settings.fadeTime, settings.sampleTime)+6) {
				nextTrack = currentTrack && findNextSound(state.playlist, currentTrack, enabled);
				nextSound = nextTrack && SoundStore.preload(nextTrack.url, nextTrack.labels, nextTrack.label, false);
				nextSoundAction = null;
		 	}
		}

		bridge.update(computedPlayerState);
	}

	function computePlayerState(percent=null) {
		let duration = parseInt(playerState.duration, 10);
		let position = Math.min(duration, playerState.position + (playerState.playing ? (Date.now()-playerState.starttime)/1000 : 0.0));

		if (currentTrack && currentTrack.ended) {
			position = playerState.duration;

		} else if (state.seeking) {
			position = playerState.duration*state.seeking;

		} else if (!currentTrack) {
			if (!nextTrack || nextTrack.label!==playerState.label) {
				position = 0;
			}
		}

		let positionTrack = position;
		let positionWidth = '0%';
		let bufferedWidth = '0%';

		const track = currentTrack || nextTrack;

		if (track) {
			const sample = track.data.samples[track.index];
			const left = track.data.duration>0 ? sample.start/track.data.duration*100 : 0;
			const width = track.data.duration>0 ? sample.duration/track.data.duration*100 : 0;

			positionTrack += sample.start;
			positionWidth = String(left+width*(playerState.duration>0 ? position/playerState.duration : 0))+'%';
			bufferedWidth = String(left+width)+'%';
		}

		return { duration, position, positionTrack, positionWidth, bufferedWidth }
	}

	setTimeout(render, 0);

	const playerApi = {
		getCurrentLabel: () => currentTrack && currentTrack.label,
		play: () => playerState.control.play(),
		pause: () => playerState.control.pause(),
		prev: () => {
			const prevTrack = currentTrack && findPrevTrack(state.playlist, currentTrack);
			prevTrack && loadTrack(prevTrack.track, prevTrack.index);
		},
		next: () => {
			const nextTrack = currentTrack && findNextTrack(state.playlist, currentTrack);
			nextTrack && loadTrack(nextTrack.track, nextTrack.index);
		},
		seek(percent) {
			clearInterval(updateinterval);
			updateinterval = null;
			playerState.control.seek(percent);
		},
		setAutoPlay: (autoPlayTrack=true) => state.autoPlayTrack = !!autoPlayTrack,
		onTrack: index => loadTrack(index, 0),
		onTrackIndex: index => currentTrack && loadTrack(currentTrack.track, index),
		stopPlayer,
		update,
		render,
		canToggleBought,
		setPlaylistBought(toggled) {
			setPlaylistBought(toggled);
			render();
		},
		updateSource() {
			const id = state.playlist.id;

			if (state.playlist.loading===false && id) {
				state.playlist.id = null;
				loadSource(id, state.labels, state.playlist.bought, function() {
					const tracks = [
						currentTrack && [currentTrack.track, currentTrack.index],
						currentTrack && [currentTrack.track, 0],
						[0, 0],
					].filter(_ => _);

					for (let [track, index] of tracks) {
						const thisTrack = formatPlaylistTrack(state.playlist, track, index)

						if (thisTrack) {
							if (currentTrack===null || currentTrack.label!==thisTrack.label) {
								loadTrack(track, index);
							}

							break;
						}
					}
				});
			}
		},
		changeVolume: SoundStore.changeVolume,
		changeFadeTime: fadeTime => settings.fadeTime = SoundStore.isFadeSupported() ? fadeTime : false,
		changeSampleTime: sampleTime => settings.sampleTime = SoundStore.isFadeSupported() ? sampleTime : false,
		destroy() {
			enabled = false;
			monitor();
			clearInterval(updateinterval);
		}
	}

	Object.defineProperty(playerApi, 'playerState', {
		get() { return playerState; }
	});

	return playerApi;
}
