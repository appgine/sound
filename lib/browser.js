

export function isSafari() {
	return /constructor/i.test(window.HTMLElement)
		|| (function (p) { return p.toString() === "[object SafariRemoteNotification]"; })(!window['safari'] || (typeof safari !== 'undefined' && safari.pushNotification))
		|| (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream)
}
