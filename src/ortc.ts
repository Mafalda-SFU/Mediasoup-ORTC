import * as h264 from 'h264-profile-level-id';
import * as utils from './utils';
import { supportedRtpCapabilities } from './supportedRtpCapabilities';
import {
	RtpCapabilities,
	MediaKind,
	RtpCodecCapability,
	RtpHeaderExtension,
	RtpParameters,
	RtpCodecParameters,
	RtcpFeedback,
	RtpEncodingParameters,
} from './RtpParameters';

type RtpMapping =
{
	codecs:
	{
		payloadType: number;
		mappedPayloadType: number;
	}[];

	encodings:
	{
		ssrc?: number;
		rid?: string;
		scalabilityMode?: string;
		mappedSsrc: number;
	}[];
};

const DynamicPayloadTypes =
[
	100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
	111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121,
	122, 123, 124, 125, 126, 127, 96, 97, 98, 99
];

/**
 * Validates RtpCapabilities. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtpCapabilities(caps: RtpCapabilities): void
{
	if (typeof caps !== 'object')
	{
		throw new TypeError('caps is not an object');
	}

	// codecs is optional. If unset, fill with an empty array.
	if (caps.codecs && !Array.isArray(caps.codecs))
	{
		throw new TypeError('caps.codecs is not an array');
	}
	else if (!caps.codecs)
	{
		caps.codecs = [];
	}

	for (const codec of caps.codecs)
	{
		validateRtpCodecCapability(codec);
	}

	// headerExtensions is optional. If unset, fill with an empty array.
	if (caps.headerExtensions && !Array.isArray(caps.headerExtensions))
	{
		throw new TypeError('caps.headerExtensions is not an array');
	}
	else if (!caps.headerExtensions)
	{
		caps.headerExtensions = [];
	}

	for (const ext of caps.headerExtensions)
	{
		validateRtpHeaderExtension(ext);
	}
}

/**
 * Validates RtpCodecCapability. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtpCodecCapability(codec: RtpCodecCapability): void
{
	const MimeTypeRegex = new RegExp('^(audio|video)/(.+)', 'i');

	if (typeof codec !== 'object')
	{
		throw new TypeError('codec is not an object');
	}

	// mimeType is mandatory.
	if (!codec.mimeType || typeof codec.mimeType !== 'string')
	{
		throw new TypeError('missing codec.mimeType');
	}

	const mimeTypeMatch = MimeTypeRegex.exec(codec.mimeType);

	if (!mimeTypeMatch)
	{
		throw new TypeError('invalid codec.mimeType');
	}

	// Just override kind with media component of mimeType.
	codec.kind = mimeTypeMatch[1].toLowerCase() as MediaKind;

	// preferredPayloadType is optional.
	if (codec.preferredPayloadType && typeof codec.preferredPayloadType !== 'number')
	{
		throw new TypeError('invalid codec.preferredPayloadType');
	}

	// clockRate is mandatory.
	if (typeof codec.clockRate !== 'number')
	{
		throw new TypeError('missing codec.clockRate');
	}

	// channels is optional. If unset, set it to 1 (just if audio).
	if (codec.kind === 'audio')
	{
		if (typeof codec.channels !== 'number')
		{
			codec.channels = 1;
		}
	}
	else
	{
		delete codec.channels;
	}

	// parameters is optional. If unset, set it to an empty object.
	if (!codec.parameters || typeof codec.parameters !== 'object')
	{
		codec.parameters = {};
	}

	for (const key of Object.keys(codec.parameters))
	{
		let value = codec.parameters[key];

		if (value === undefined)
		{
			codec.parameters[key] = '';
			value = '';
		}

		if (typeof value !== 'string' && typeof value !== 'number')
		{
			throw new TypeError(
				`invalid codec parameter [key:${key}s, value:${value}]`);
		}

		// Specific parameters validation.
		if (key === 'apt')
		{
			if (typeof value !== 'number')
			{
				throw new TypeError('invalid codec apt parameter');
			}
		}
	}

	// rtcpFeedback is optional. If unset, set it to an empty array.
	if (!codec.rtcpFeedback || !Array.isArray(codec.rtcpFeedback))
	{
		codec.rtcpFeedback = [];
	}

	for (const fb of codec.rtcpFeedback)
	{
		validateRtcpFeedback(fb);
	}
}

/**
 * Validates RtcpFeedback. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtcpFeedback(fb: RtcpFeedback): void
{
	if (typeof fb !== 'object')
	{
		throw new TypeError('fb is not an object');
	}

	// type is mandatory.
	if (!fb.type || typeof fb.type !== 'string')
	{
		throw new TypeError('missing fb.type');
	}

	// parameter is optional. If unset set it to an empty string.
	if (!fb.parameter || typeof fb.parameter !== 'string')
	{
		fb.parameter = '';
	}
}

/**
 * Validates RtpHeaderExtension. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtpHeaderExtension(ext: RtpHeaderExtension): void
{

	if (typeof ext !== 'object')
	{
		throw new TypeError('ext is not an object');
	}

	if (ext.kind !== 'audio' && ext.kind !== 'video')
	{
		throw new TypeError('invalid ext.kind');
	}

	// uri is mandatory.
	if (!ext.uri || typeof ext.uri !== 'string')
	{
		throw new TypeError('missing ext.uri');
	}

	// preferredId is mandatory.
	if (typeof ext.preferredId !== 'number')
	{
		throw new TypeError('missing ext.preferredId');
	}

	// preferredEncrypt is optional. If unset set it to false.
	if (ext.preferredEncrypt && typeof ext.preferredEncrypt !== 'boolean')
	{
		throw new TypeError('invalid ext.preferredEncrypt');
	}
	else if (!ext.preferredEncrypt)
	{
		ext.preferredEncrypt = false;
	}

	// direction is optional. If unset set it to sendrecv.
	if (ext.direction && typeof ext.direction !== 'string')
	{
		throw new TypeError('invalid ext.direction');
	}
	else if (!ext.direction)
	{
		ext.direction = 'sendrecv';
	}
}

/**
 * Generate RTP capabilities for the Router based on the given media codecs and
 * mediasoup supported RTP capabilities.
 *
 * @param mediaCodecs
 */
export function generateRouterRtpCapabilities(
	mediaCodecs: RtpCodecCapability[] = []
): RtpCapabilities
{
	// Normalize supported RTP capabilities.
	validateRtpCapabilities(supportedRtpCapabilities);

	if (!Array.isArray(mediaCodecs))
	{
		throw new TypeError('mediaCodecs must be an Array');
	}

	const clonedSupportedRtpCapabilities =
		utils.clone(supportedRtpCapabilities) as RtpCapabilities;
	const dynamicPayloadTypes = utils.clone(DynamicPayloadTypes) as number[];
	const caps: RtpCapabilities =
	{
		codecs           : [],
		headerExtensions : clonedSupportedRtpCapabilities.headerExtensions
	};

	for (const mediaCodec of mediaCodecs)
	{
		// This may throw.
		validateRtpCodecCapability(mediaCodec);

		const matchedSupportedCodec = clonedSupportedRtpCapabilities
			.codecs!
			.find((supportedCodec) => (
				matchCodecs(mediaCodec, supportedCodec, { strict: false }))
			);

		if (!matchedSupportedCodec)
		{
			throw new /*Unsupported*/Error(
				`media codec not supported [mimeType:${mediaCodec.mimeType}]`);
		}

		// Clone the supported codec.
		const codec = utils.clone(matchedSupportedCodec) as RtpCodecCapability;

		// If the given media codec has preferredPayloadType, keep it.
		if (typeof mediaCodec.preferredPayloadType === 'number')
		{
			codec.preferredPayloadType = mediaCodec.preferredPayloadType;

			// Also remove the pt from the list of available dynamic values.
			const idx = dynamicPayloadTypes.indexOf(codec.preferredPayloadType);

			if (idx > -1)
			{
				dynamicPayloadTypes.splice(idx, 1);
			}
		}
		// Otherwise if the supported codec has preferredPayloadType, use it.
		else if (typeof codec.preferredPayloadType === 'number')
		{
			// No need to remove it from the list since it's not a dynamic value.
		}
		// Otherwise choose a dynamic one.
		else
		{
			// Take the first available pt and remove it from the list.
			const pt = dynamicPayloadTypes.shift();

			if (!pt)
			{
				throw new Error('cannot allocate more dynamic codec payload types');
			}

			codec.preferredPayloadType = pt;
		}

		// Ensure there is not duplicated preferredPayloadType values.
		if (caps.codecs!.some((c) => c.preferredPayloadType === codec.preferredPayloadType))
		{
			throw new TypeError('duplicated codec.preferredPayloadType');
		}

		// Merge the media codec parameters.
		codec.parameters = { ...codec.parameters, ...mediaCodec.parameters };

		// Append to the codec list.
		caps.codecs!.push(codec);

		// Add a RTX video codec if video.
		if (codec.kind === 'video')
		{
			// Take the first available pt and remove it from the list.
			const pt = dynamicPayloadTypes.shift();

			if (!pt)
			{
				throw new Error('cannot allocate more dynamic codec payload types');
			}

			const rtxCodec: RtpCodecCapability =
			{
				kind                 : codec.kind,
				mimeType             : `${codec.kind}/rtx`,
				preferredPayloadType : pt,
				clockRate            : codec.clockRate,
				parameters           :
				{
					apt : codec.preferredPayloadType
				},
				rtcpFeedback : []
			};

			// Append to the codec list.
			caps.codecs!.push(rtxCodec);
		}
	}

	return caps;
}

/**
 * Get a mapping of codec payloads and encodings of the given Producer RTP
 * parameters as values expected by the Router.
 *
 * It may throw if invalid or non supported RTP parameters are given.
 *
 * @param params
 * @param caps
 */
export function getProducerRtpParametersMapping(
	params: RtpParameters,
	caps: RtpCapabilities
): RtpMapping
{
	const rtpMapping: RtpMapping =
	{
		codecs    : [],
		encodings : []
	};

	// Match parameters media codecs to capabilities media codecs.
	const codecToCapCodec: Map<RtpCodecParameters, RtpCodecCapability> = new Map();

	for (const codec of params.codecs)
	{
		if (isRtxCodec(codec))
		{
			continue;
		}

		// Search for the same media codec in capabilities.
		const matchedCapCodec = caps.codecs!
			.find((capCodec) => (
				matchCodecs(codec, capCodec, { strict: true, modify: true }))
			);

		if (!matchedCapCodec)
		{
			throw new /*Unsupported*/Error(
				`unsupported codec [mimeType:${codec.mimeType}, payloadType:${codec.payloadType}]`);
		}

		codecToCapCodec.set(codec, matchedCapCodec);
	}

	// Match parameters RTX codecs to capabilities RTX codecs.
	for (const codec of params.codecs)
	{
		if (!isRtxCodec(codec))
		{
			continue;
		}

		// Search for the associated media codec.
		const associatedMediaCodec = params.codecs
			.find((mediaCodec) => mediaCodec.payloadType === codec.parameters.apt);

		if (!associatedMediaCodec)
		{
			throw new TypeError(
				`missing media codec found for RTX PT ${codec.payloadType}`);
		}

		const capMediaCodec = codecToCapCodec.get(associatedMediaCodec);

		// Ensure that the capabilities media codec has a RTX codec.
		const associatedCapRtxCodec = caps.codecs!
			.find((capCodec) => (
				isRtxCodec(capCodec) &&
				capCodec.parameters.apt === capMediaCodec!.preferredPayloadType
			));

		if (!associatedCapRtxCodec)
		{
			throw new /*Unsupported*/Error(
				`no RTX codec for capability codec PT ${capMediaCodec!.preferredPayloadType}`);
		}

		codecToCapCodec.set(codec, associatedCapRtxCodec);
	}

	// Generate codecs mapping.
	for (const [ codec, capCodec ] of codecToCapCodec)
	{
		rtpMapping.codecs.push(
			{
				payloadType       : codec.payloadType,
				mappedPayloadType : capCodec.preferredPayloadType!
			});
	}

	// Generate encodings mapping.
	let mappedSsrc = utils.generateRandomNumber();

	for (const encoding of params.encodings!)
	{
		const mappedEncoding: any = {};

		mappedEncoding.mappedSsrc = mappedSsrc++;

		if (encoding.rid)
		{
			mappedEncoding.rid = encoding.rid;
		}
		if (encoding.ssrc)
		{
			mappedEncoding.ssrc = encoding.ssrc;
		}
		if (encoding.scalabilityMode)
		{
			mappedEncoding.scalabilityMode = encoding.scalabilityMode;
		}

		rtpMapping.encodings.push(mappedEncoding);
	}

	return rtpMapping;
}

/**
 * Generate RTP parameters to be internally used by Consumers given the RTP
 * parameters of a Producer and the RTP capabilities of the Router.
 *
 * @param kind
 * @param params
 * @param caps
 * @param rtpMapping
 */
export function getConsumableRtpParameters(
	kind: string,
	params: RtpParameters,
	caps: RtpCapabilities,
	rtpMapping: RtpMapping
): RtpParameters
{
	const consumableParams: RtpParameters =
	{
		codecs           : [],
		headerExtensions : [],
		encodings        : [],
		rtcp             : {}
	};

	for (const codec of params.codecs)
	{
		if (isRtxCodec(codec))
		{
			continue;
		}

		const consumableCodecPt = rtpMapping.codecs
			.find((entry) => entry.payloadType === codec.payloadType)!
			.mappedPayloadType;

		const matchedCapCodec = caps.codecs!
			.find((capCodec) => capCodec.preferredPayloadType === consumableCodecPt)!;

		const consumableCodec: RtpCodecParameters =
		{
			mimeType     : matchedCapCodec.mimeType,
			payloadType  : matchedCapCodec.preferredPayloadType!,
			clockRate    : matchedCapCodec.clockRate,
			channels     : matchedCapCodec.channels,
			parameters   : codec.parameters, // Keep the Producer codec parameters.
			rtcpFeedback : matchedCapCodec.rtcpFeedback
		};

		consumableParams.codecs.push(consumableCodec);

		const consumableCapRtxCodec = caps.codecs!
			.find((capRtxCodec) => (
				isRtxCodec(capRtxCodec) &&
				capRtxCodec.parameters.apt === consumableCodec.payloadType
			));

		if (consumableCapRtxCodec)
		{
			const consumableRtxCodec: RtpCodecParameters =
			{
				mimeType     : consumableCapRtxCodec.mimeType,
				payloadType  : consumableCapRtxCodec.preferredPayloadType!,
				clockRate    : consumableCapRtxCodec.clockRate,
				parameters   : consumableCapRtxCodec.parameters,
				rtcpFeedback : consumableCapRtxCodec.rtcpFeedback
			};

			consumableParams.codecs.push(consumableRtxCodec);
		}
	}

	for (const capExt of caps.headerExtensions!)
	{

		// Just take RTP header extension that can be used in Consumers.
		if (
			capExt.kind !== kind ||
			(capExt.direction !== 'sendrecv' && capExt.direction !== 'sendonly')
		)
		{
			continue;
		}

		const consumableExt =
		{
			uri        : capExt.uri,
			id         : capExt.preferredId,
			encrypt    : capExt.preferredEncrypt,
			parameters : {}
		};

		consumableParams.headerExtensions!.push(consumableExt);
	}

	// Clone Producer encodings since we'll mangle them.
	const consumableEncodings = utils.clone(params.encodings) as RtpEncodingParameters[];

	for (let i = 0; i < consumableEncodings.length; ++i)
	{
		const consumableEncoding = consumableEncodings[i];
		const { mappedSsrc } = rtpMapping.encodings[i];

		// Remove useless fields.
		delete consumableEncoding.rid;
		delete consumableEncoding.rtx;
		delete consumableEncoding.codecPayloadType;

		// Set the mapped ssrc.
		consumableEncoding.ssrc = mappedSsrc;

		consumableParams.encodings!.push(consumableEncoding);
	}

	consumableParams.rtcp =
	{
		cname       : params.rtcp!.cname,
		reducedSize : true,
		mux         : true
	};

	return consumableParams;
}

/**
 * Check whether the given RTP capabilities can consume the given Producer.
 */
export function canConsume(
	consumableParams: RtpParameters,
	caps: RtpCapabilities
): boolean
{
	// This may throw.
	validateRtpCapabilities(caps);

	const matchingCodecs: RtpCodecParameters[] = [];

	for (const codec of consumableParams.codecs)
	{
		const matchedCapCodec = caps.codecs!
			.find((capCodec) => matchCodecs(capCodec, codec, { strict: true }));

		if (!matchedCapCodec)
		{
			continue;
		}

		matchingCodecs.push(codec);
	}

	// Ensure there is at least one media codec.
	if (matchingCodecs.length === 0 || isRtxCodec(matchingCodecs[0]))
	{
		return false;
	}

	return true;
}

/**
 * Generate RTP parameters for a pipe Consumer.
 *
 * It keeps all original consumable encodings and removes support for BWE. If
 * enableRtx is false, it also removes RTX and NACK support.
 *
 * @param root0
 * @param root0.consumableRtpParameters
 * @param root0.enableRtx
 */
export function getPipeConsumerRtpParameters(
	{
		consumableRtpParameters,
		enableRtx
	}:
	{
		consumableRtpParameters: RtpParameters;
		enableRtx: boolean;
	}
): RtpParameters
{
	const consumerParams: RtpParameters =
	{
		codecs           : [],
		headerExtensions : [],
		encodings        : [],
		rtcp             : consumableRtpParameters.rtcp
	};

	const consumableCodecs =
		utils.clone(consumableRtpParameters.codecs) as RtpCodecParameters[];

	for (const codec of consumableCodecs)
	{
		if (!enableRtx && isRtxCodec(codec))
		{
			continue;
		}

		codec.rtcpFeedback = codec.rtcpFeedback!
			.filter((fb) => (
				(fb.type === 'nack' && fb.parameter === 'pli') ||
				(fb.type === 'ccm' && fb.parameter === 'fir') ||
				(enableRtx && fb.type === 'nack' && !fb.parameter)
			));

		consumerParams.codecs.push(codec);
	}

	// Reduce RTP extensions by disabling transport MID and BWE related ones.
	consumerParams.headerExtensions = consumableRtpParameters.headerExtensions!
		.filter((ext) => (
			ext.uri !== 'urn:ietf:params:rtp-hdrext:sdes:mid' &&
			ext.uri !== 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time' &&
			ext.uri !== 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01'
		));

	const consumableEncodings =
		utils.clone(consumableRtpParameters.encodings) as RtpEncodingParameters[];
	const baseSsrc = utils.generateRandomNumber();
	const baseRtxSsrc = utils.generateRandomNumber();

	for (let i = 0; i < consumableEncodings.length; ++i)
	{
		const encoding = consumableEncodings[i];

		encoding.ssrc = baseSsrc + i;

		if (enableRtx)
		{
			encoding.rtx = { ssrc: baseRtxSsrc + i };
		}
		else
		{
			delete encoding.rtx;
		}

		consumerParams.encodings!.push(encoding);
	}

	return consumerParams;
}

function isRtxCodec(codec: RtpCodecCapability | RtpCodecParameters): boolean
{
	return /.+\/rtx$/i.test(codec.mimeType);
}

function matchCodecs(
	aCodec: RtpCodecCapability | RtpCodecParameters,
	bCodec: RtpCodecCapability | RtpCodecParameters,
	{ strict = false, modify = false } = {}
): boolean
{
	const aMimeType = aCodec.mimeType.toLowerCase();
	const bMimeType = bCodec.mimeType.toLowerCase();

	if (aMimeType !== bMimeType)
	{
		return false;
	}

	if (aCodec.clockRate !== bCodec.clockRate)
	{
		return false;
	}

	if (aCodec.channels !== bCodec.channels)
	{
		return false;
	}

	// Per codec special checks.
	switch (aMimeType)
	{
		case 'audio/multiopus':
		{
			const aNumStreams = aCodec.parameters['num_streams'];
			const bNumStreams = bCodec.parameters['num_streams'];

			if (aNumStreams !== bNumStreams)
			{
				return false;
			}

			const aCoupledStreams = aCodec.parameters['coupled_streams'];
			const bCoupledStreams = bCodec.parameters['coupled_streams'];

			if (aCoupledStreams !== bCoupledStreams)
			{
				return false;
			}

			break;
		}

		case 'video/h264':
		case 'video/h264-svc':
		{
			if (strict)
			{
				const aPacketizationMode = aCodec.parameters['packetization-mode'] || 0;
				const bPacketizationMode = bCodec.parameters['packetization-mode'] || 0;

				if (aPacketizationMode !== bPacketizationMode)
				{
					return false;
				}

				if (!h264.isSameProfile(aCodec.parameters, bCodec.parameters))
				{
					return false;
				}

				let selectedProfileLevelId;

				try
				{
					selectedProfileLevelId =
						h264.generateProfileLevelIdForAnswer(aCodec.parameters, bCodec.parameters);
				}
				catch (error)
				{
					return false;
				}

				if (modify)
				{
					if (selectedProfileLevelId)
					{
						aCodec.parameters['profile-level-id'] = selectedProfileLevelId;
					}
					else
					{
						delete aCodec.parameters['profile-level-id'];
					}
				}
			}

			break;
		}

		case 'video/vp9':
		{
			if (strict)
			{
				const aProfileId = aCodec.parameters['profile-id'] || 0;
				const bProfileId = bCodec.parameters['profile-id'] || 0;

				if (aProfileId !== bProfileId)
				{
					return false;
				}
			}

			break;
		}
	}

	return true;
}
