

export function getCookies()
{
	const cookies = {};
	document.cookie.split('; ')
		.map(x => x.split('='))
		.map(([name, value]) => cookies[name] = value);
	return cookies;
}


export function getCookie(name)
{
	return decodeURIComponent(getCookies()[name] || '');
}


let asked = [];
let $iframes = null;
let $iframesLoaded = {};
export function askFrameMessage(server, message, fn)
{
	if ($iframes===null) {
		$iframes = {};

		bindEvent(window, 'message', function(e) {
			for (let [server, message, fn] of asked.splice(0, asked.length)) {
				if ($iframes[server].contentWindow===e.source) {
					const data = e.data ? e.data : e.message;
					if (data && typeof data==='object' && message in data) {
						try { fn(data[message]); } catch (e) {}
						continue;
					}
				}

				asked.push([server, message, fn]);
			}
		});
	}

	if ($iframes[server]===undefined) {
		$iframes[server] = document.createElement('iframe');

		function onLoad(e) {
			$iframes[server].removeEventListener('load', onLoad);
			$iframesLoaded[server] = $iframes[server];
			asked.push([server, message, fn]);
			$iframes[server].contentWindow.postMessage(message, '*');
		}

		$iframes[server].style.display = 'none';
		$iframes[server].addEventListener('load', onLoad);
		$iframes[server].src = server;
	}

	if (!$iframes[server].contentWindow) {
		document.body.appendChild($iframes[server]);
	}

	if ($iframesLoaded[server]) {
		asked.push([server, message, fn]);
		$iframes[server].contentWindow.postMessage(message, '*');
	}
}


function bindEvent(element, eventName, eventHandler) {
	if (element.addEventListener){
		element.addEventListener(eventName, eventHandler, false);

	} else if (element.attachEvent) {
		element.attachEvent('on' + eventName, eventHandler);
	}
}
