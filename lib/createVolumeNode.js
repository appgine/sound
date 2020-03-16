

export default function createVolumeNode() {
	let volume = 1.0;
	let connected = [];

	const gain = {};
	Object.defineProperty(gain, 'value', {
		get() { return volume; },
		set(_volume) {
			volume = Math.max(Math.min(_volume, 1.0), 0);
			connected.forEach(source => source.volume = volume);
		}
	});

	return {
		gain,
		connect(source) {
			if (source instanceof HTMLMediaElement) {
				source.volume = volume;
				connected.push(source);
			}
		},
		disconnect() {
			connected = [];
		}
	}
}
