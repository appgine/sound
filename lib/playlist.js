

export function findCurrentTrack(playlist, label) {
	for (let i=0; i<playlist.tracks.length; i++) {
		const samples = playlist.tracks[i].samples;

		for (let j=0; j<samples.length; j++) {
			if (playlist.tracks[i].labels.indexOf(label)!==-1 || samples[j].labels.indexOf(label)!==-1) {
				return formatPlaylistTrack(playlist, i, j);
			}
		}
	}

	return null;
}


export function findNextSound(playlist, currentTrack, allowNextTrack, allowRepeat=true) {
	if (playlist.tracks[currentTrack.track] && playlist.tracks[currentTrack.track].samples[currentTrack.index+1]) {
		if (!playlist.bought || playlist.tracks[currentTrack.track].bought) {
			return formatPlaylistTrack(playlist, currentTrack.track, currentTrack.index+1);
		}
	}

	return allowNextTrack ? findNextTrack(playlist, currentTrack, allowRepeat) : null;
}


export function findNextTrack(playlist, currentTrack, allowRepeat=false) {
	for (let i=1; i<=playlist.tracks.length; i++) {
		const index = (currentTrack.track+i)%playlist.tracks.length;

		if (index>currentTrack.track || allowRepeat) {
			if (playlist.bought===false || playlist.tracks[index].bought || i===playlist.tracks.length) {
				return formatPlaylistTrack(playlist, index, 0)
			}
		}
	}

	return null;
}


export function findPrevTrack(playlist, currentTrack) {
	for (let index=currentTrack.track-1; index>=0; index--) {
		if (playlist.bought===false || playlist.tracks[index].bought) {
			return formatPlaylistTrack(playlist, index, 0)
		}
	}

	return null;
}


export function formatPlaylistTrack({ id, tracks }, i, j)
{
	if (tracks[i] && tracks[i].samples[j]) {
		const track = tracks[i];
		const sample = track.samples[j];

		return {
			track: i,
			index: j,
			data: track,
			url: sample.url,
			label: sample.label,
			labels: [].concat(track.labels, sample.labels),
			samplestart: sample.start>0,
			sampleend: sample.sample===true || track.duration > sample.start+sample.duration,
			playlistid: id,
			ended: false,
		}
	}
}
