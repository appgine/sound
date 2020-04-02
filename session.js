
import * as SoundStore from './store'
import * as sound from './sound'
import * as helper from './lib/helper'
import { isSafari } from './lib/browser'

let state = SoundStore.initialMonitor();
let handlers = 0;
let source = null;
let audio = null;
let audioCtx = null;
let audioCanPlay = false;

sound.onInit(function(_audioCtx) {
	audioCtx = audioCtx || _audioCtx;
});

export default function create() {
	const dispatchPlayer = this.dispatch.bind(this, 'player');

	function createAudio() {
		if (audio===null) {
			audio = new Audio();
			audio.type = 'audio/mp4';
			audio.src = 'data:audio/mp4;base64,AAAAGGZ0eXBNNEEgAAACAGlzb21pc28yAAAACGZyZWUAAAFZbWRhdN4CAExhdmM1Ny42NC4xMDEAAjBADgEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcAAAQFbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAJ5AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAy90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAJ5AAAAAAAAAAAAAAAAEBAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAACcQAAAEAAABAAAAAAKnbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAfQAABPIBVxAAAAAAALWhkbHIAAAAAAAAAAHNvdW4AAAAAAAAAAAAAAABTb3VuZEhhbmRsZXIAAAACUm1pbmYAAAAQc21oZAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAACFnN0YmwAAABqc3RzZAAAAAAAAAABAAAAWm1wNGEAAAAAAAAAAQAAAAAAAAAAAAIAEAAAAAAfQAAAAAAANmVzZHMAAAAAA4CAgCUAAQAEgICAF0AVAAAAAAC7gAAAAQoFgICABRWIVuUABoCAgAECAAAAIHN0dHMAAAAAAAAAAgAAAE8AAAQAAAAAAQAAAIAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAFAAAAABAAABVHN0c3oAAAAAAAAAAAAAAFAAAAAVAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAABRzdGNvAAAAAAAAAAEAAAAoAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY1Ny41Ni4xMDE=';
			audio.volume = 0;
			audio.load();

			audio.addEventListener('canplaythrough', function() {
				audioCanPlay = true;
				renderState();
			});

			audio.addEventListener('pause', function() {
				if (audio.ended && state.playing) {
					audio.currentTime = 0.0;
					audio.play();
				}
			});
		}
	}

	let renderSessionInterval;
	function renderState()
	{
		clearInterval(renderSessionInterval);

		if (audioCanPlay) {
			if (audio.paused && state.playing) {
				audio.play();

			} else if (state.paused || state.ended) {
				if (audio.paused===false) {
					audio.pause();
				}
			}
		}

		if (typeof navigator==='object' && navigator.mediaSession) {
			if (state.ended || state.paused) {
				navigator.mediaSession.playbackState = 'paused';

			} else {
				navigator.mediaSession.playbackState = 'playing';

				if (navigator.mediaSession.setPositionState) {
					renderSession();
					renderSessionInterval = setInterval(renderSession, 250);
				}
			}
		}
	}

	function renderSession()
	{
		navigator.mediaSession.setPositionState({
			duration: state.duration,
			playbackRate: 1.0,
			position: Math.min(state.duration, state.position+(Date.now()-state.starttime)/1000),
		});
	}

	function renderSilence() {
		if (audioCtx && state.loading && source===null) {
			const buffer = audioCtx.createBuffer(2, 11520, 44100);
			buffer.getChannelData(0).set(Uint8Array.from(Array(11520).fill(0)));
			buffer.getChannelData(1).set(Uint8Array.from(Array(11520).fill(0)));

			source = audioCtx.createBufferSource();
			source.buffer = buffer;
			source.connect(audioCtx.destination);
			source.addEventListener('ended', function() {
				source = null;
				renderSilence();
			});

			source.start(audioCtx.currentTime, 0);
		}
	}

	this.listen('player-track', function(track) {
		if (audio) {
			audio.title = track.data.name;
		}

		if (window.MediaMetadata) {
			navigator.mediaSession.metadata = new window.MediaMetadata({
				title: track.data.name,
				artist: track.data.album.artistname,
				album: track.data.album.name,
				artwork: [{src: track.data.album.cover}]
			});
		}
	});

	const monitor = SoundStore.connectMonitor();
	monitor.then(function(currentState) {
		state = currentState;

		if (handlers===0) {
			handlers = 1;

			if (typeof navigator==='object' && navigator.mediaSession && navigator.mediaSession.setActionHandler) {
				handlers = 2;
				createAudio();
				navigator.mediaSession.setActionHandler('play', () => state.control.play());
				navigator.mediaSession.setActionHandler('pause', () => state.control.pause());
				navigator.mediaSession.setActionHandler('seekbackward', () => dispatchPlayer('seekbackward'));
				navigator.mediaSession.setActionHandler('seekforward', () => dispatchPlayer('seekforward'));
				navigator.mediaSession.setActionHandler('previoustrack', () => dispatchPlayer('prev'));
				navigator.mediaSession.setActionHandler('nexttrack', () => dispatchPlayer('next'));
			}
		}

		renderState();

		if ('ontouchstart' in document) {
			renderSilence();
		}
	});

	return monitor;
}
