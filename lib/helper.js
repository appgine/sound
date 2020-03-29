
const versions = {0x0: '2.5', 0x1: 'x', 0x2: '2', 0x3: '1'} // x: 'reserved'
const layers = {0x0: 'x', 0x1: '3', 0x2: '2', 0x3: '1'} // x: 'reserved'

const bitrates = {
	'V1L1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
	'V1L2': [0, 32, 48, 56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320, 384],
	'V1L3': [0, 32, 40, 48,  56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320],
	'V2L1': [0, 32, 48, 56,  64,  80,  96, 112, 128, 144, 160, 176, 192, 224, 256],
	'V2L2': [0,  8, 16, 24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160],
	'V2L3': [0,  8, 16, 24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160],
};

const sample_rates = {
	'1': [44100, 48000, 32000],
	'2': [22050, 24000, 16000],
	'2.5': [11025, 12000,  8000],
};

const samples_length = {
	1:  {1: 384, 2: 1152, 3: 1152}, //MPEGv1,     Layers 1,2,3
	2:  {1: 384, 2: 1152, 3:  576}, //MPEGv2/2.5, Layers 1,2,3
};


export function decodeBuffer(buffer, key) {
	const tmpBuffer = new Uint8Array(buffer.length);

	for (let i=0; i<buffer.length; i++) {
		tmpBuffer[i] = (buffer[i]+256-key)%256;
	}

	return tmpBuffer;
}


export function resolveID3Size(buffer) {
	if (buffer.length<10) {
		return false;

	} else if (String.fromCharCode(...Array.from(buffer.slice(0, 3)))==='ID3') {
		const headerSize = 10;
		const footerSize = 10*(buffer[5] & 0x10);
		const bodySize = ((buffer[6]&0x7f) * 2097152) + ((buffer[7]&0x7f) * 16384) + ((buffer[8]&0x7f) * 128) + (buffer[9]&0x7f)

		return headerSize+footerSize+bodySize;
	}

	return 0;
}


export function resolveFrameHeader(buffer) {
	if (buffer[0]===0xff && buffer[1]&0xe0) {
		const b1 = buffer[1];
		const b2 = buffer[2];
		const b3 = buffer[3];
		const b4 = buffer[4];
		const b5 = buffer[5];

		const version = versions[(b1 & 0x18) >> 3];
		const layer = layers[(b1 & 0x06) >> 1];

		const bitrate_key = 'V' + (version=='2.5' ? '2' : version) + 'L' + layer;
		const bitrate = bitrates[bitrate_key] && bitrates[bitrate_key][(b2 & 0xf0) >> 4] || 0;
		const sample_rate = sample_rates[version] && sample_rates[version][(b2 & 0x0c) >> 2] || 0;

		if (bitrate===0 || sample_rate===0) {
			return null;
		}

		const samples = samples_length[version=='2.5' ? '2' : version][layer];
		const duration = sample_rate>0 ? (samples/sample_rate) : 0;

		const bitrateSize = layer==='1' ? 48 : 144;
		const paddingSize = (layer==='1' ? 4 : 1)*((b2 & 0x02) >> 1);
		const size = Math.floor((bitrateSize*bitrate*1000/sample_rate) + paddingSize);
		const offset = (b4 << 1) | ((b5 & 0x80) >> 7);

		return { bitrate, sample_rate, samples, duration, size, offset };
	}

	return null;
}


export function canSkipBuffer(buffer) {
	if (String.fromCharCode(...Array.from(buffer.slice(0, 3)))==='TAG') {
		return 128;
	}

	return 0;
}


export function mergeBuffers(buffers) {
	const len = buffers.reduce((total, buffer) => total+buffer.length, 0);
	const result = new Uint8Array(len);

	let pointer = 0;
	for (let buffer of buffers) {
		result.set(buffer, pointer);
		pointer += buffer.length;
	}

	return result;
}


export function mergeAudioFrames(context, buffers) {
	const buffer = context.createBuffer(
		buffers[0].numberOfChannels,
		buffers.reduce((total, buffer) => total+buffer.length, 0),
		buffers[0].sampleRate
	);

	for (let channel=0; channel<buffer.numberOfChannels; channel++) {
		const channelData = buffer.getChannelData(channel);

		let pointer = 0;
		for (let j=buffers.length-1; j>=0; j--) {
			let tmpChannelData = buffers[j].getChannelData(channel);

			channelData.set(tmpChannelData, channelData.length-pointer-tmpChannelData.length);
			pointer += tmpChannelData.length;
		}
	}

	return buffer;
}


export function sliceAudioBuffer(context, buffer, offset, length) {
	const bufferLength = Math.min(length-offset, buffer.length-offset)
	const newBuffer = context.createBuffer(buffer.numberOfChannels, bufferLength, buffer.sampleRate);

	for (let channel=0; channel<newBuffer.numberOfChannels; channel++) {
		const channelData = newBuffer.getChannelData(channel);
		channelData.set(buffer.getChannelData(channel).slice(offset, offset+bufferLength), 0);
	}

	return newBuffer;
}


export function canPlay(contentBytes, bufferBytes, bufferDuration, downloadTime) {
	const downloadBytes = bufferBytes/downloadTime;
	const audioBytes = bufferBytes/bufferDuration;

	if (downloadBytes>audioBytes) {
		return true;
	}

	const deficitBytes = ((1.1*contentBytes)/bufferBytes*bufferDuration)*(audioBytes-downloadBytes)
	return 0<bufferBytes-deficitBytes;
}
