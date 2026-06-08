// Copyright � 2002-2010 Microchip Technology Inc.  All rights reserved.
// See Microchip TCP/IP Stack documentation for license information.

// Determines when a request is considered "timed out"
var timeOutMS = 5000; // ms

// Stores a queue of AJAX events to process
var ajaxList = new Array();

// Initiates a new AJAX command
//	url: the url to access
//	container: the document ID to fill, or a function to call with response XML (optional)
//	repeat: true to repeat this call indefinitely (optional)
//	data: an URL encoded string to be submitted as POST data (optional)
function newAJAXCommand(url, container, repeat, data)
{
	// Set up our object
	var newAjax = new Object();
	var theTimer = new Date();
	newAjax.url = url;
	newAjax.container = container;
	newAjax.repeat = repeat;
	newAjax.ajaxReq = null;

	// Create and send the request
	if(window.XMLHttpRequest) {
        newAjax.ajaxReq = new XMLHttpRequest();
        newAjax.ajaxReq.open((data==null)?"GET":"POST", newAjax.url, true);
        newAjax.ajaxReq.send(data);
    // If we're using IE6 style (maybe 5.5 compatible too)
    } else if(window.ActiveXObject) {
        newAjax.ajaxReq = new ActiveXObject("Microsoft.XMLHTTP");
        if(newAjax.ajaxReq) {
            newAjax.ajaxReq.open((data==null)?"GET":"POST", newAjax.url, true);
            newAjax.ajaxReq.send(data);
        }
    }

    newAjax.lastCalled = theTimer.getTime();

    // Store in our array
    ajaxList.push(newAjax);
}

// Loops over all pending AJAX events to determine if any action is required
function pollAJAX() {
	var curAjax = new Object();
	var theTimer = new Date();
	var elapsed;

	// Read off the ajaxList objects one by one
	for(i = ajaxList.length; i > 0; i--)
	{
		curAjax = ajaxList.shift();
		if(!curAjax)
			continue;
		elapsed = theTimer.getTime() - curAjax.lastCalled;

		// If we succeeded
		if(curAjax.ajaxReq.readyState == 4 && curAjax.ajaxReq.status == 200) {
			// If it has a container, write the result
			if(typeof(curAjax.container) == 'function'){
				curAjax.container(curAjax.ajaxReq.responseXML.documentElement);
			} else if(typeof(curAjax.container) == 'string') {
				document.getElementById(curAjax.container).innerHTML = curAjax.ajaxReq.responseText;
			} // (otherwise do nothing for null values)

	    	curAjax.ajaxReq.abort();
	    	curAjax.ajaxReq = null;

			// If it's a repeatable request, then do so
			if(curAjax.repeat)
				newAJAXCommand(curAjax.url, curAjax.container, curAjax.repeat);
			continue;
		}

		// If we've waited over 1 second, then we timed out
		if(elapsed > timeOutMS) {
			// Invoke the user function with null input
			if(typeof(curAjax.container) == 'function'){
				curAjax.container(null);
			} else {
				// Show reconnect overlay instead of a blocking alert
				showReconnectOverlay();
			}

	    	curAjax.ajaxReq.abort();
	    	curAjax.ajaxReq = null;

			// If it's a repeatable request, then do so
			if(curAjax.repeat)
				newAJAXCommand(curAjax.url, curAjax.container, curAjax.repeat);
			continue;
		}

		// Otherwise, just keep waiting
		ajaxList.push(curAjax);
	}

	// Call ourselves again in 10 ms
	setTimeout("pollAJAX()", 10);
}

// Parses the xmlResponse returned by an XMLHTTPRequest object
//	xmlData: the xmlData returned
//  field: the field to search for
function getXMLValue(xmlData, field) {
	try {
		if(xmlData.getElementsByTagName(field)[0].firstChild.nodeValue)
			return xmlData.getElementsByTagName(field)[0].firstChild.nodeValue;
		else
			return null;
	} catch(err) { return null; }
}

// Kick off the AJAX Updater
setTimeout("pollAJAX()", 500);

// ---------------------------------------------------------------------------
// Reconnect overlay — shown when the device goes away (flash/reboot).
// Polls a lightweight HEAD request every 2 s; reloads when it comes back.
// ---------------------------------------------------------------------------
var _reconnectActive = false;

function showReconnectOverlay() {
    if (_reconnectActive) return;
    _reconnectActive = true;

    // Build overlay
    var ov = document.createElement('div');
    ov.id = 'led-reconnect-overlay';
    ov.style.cssText = [
        'position:fixed','top:0','left:0','width:100%','height:100%',
        'background:rgba(0,0,0,0.72)','z-index:9999',
        'display:flex','flex-direction:column',
        'align-items:center','justify-content:center',
        'font-family:sans-serif','color:#fff'
    ].join(';');

    var msg = document.createElement('div');
    msg.style.cssText = 'font-size:1.3em;margin-bottom:1em;';
    msg.textContent = 'Device restarting\u2026';

    var dots = document.createElement('div');
    dots.style.cssText = 'font-size:2em;letter-spacing:0.3em;';
    dots.textContent = '\u25cf \u25cf \u25cf';

    ov.appendChild(msg);
    ov.appendChild(dots);
    document.body.appendChild(ov);

    // Animate dots
    var dotStates = ['\u25cf \u25cb \u25cb', '\u25cb \u25cf \u25cb', '\u25cb \u25cb \u25cf'];
    var di = 0;
    var dotTimer = setInterval(function() {
        dots.textContent = dotStates[di % 3];
        di++;
    }, 400);

    // Poll until device answers, then reload
    function tryReconnect() {
        fetch(window.location.origin + '/index.htm', {
            method: 'HEAD',
            cache: 'no-store',
            signal: AbortSignal.timeout(3000)
        }).then(function(r) {
            if (r.ok || r.status === 401 || r.status === 302) {
                clearInterval(dotTimer);
                msg.textContent = 'Reconnected! Reloading\u2026';
                setTimeout(function() { window.location.reload(); }, 500);
            } else {
                setTimeout(tryReconnect, 2000);
            }
        }).catch(function() {
            setTimeout(tryReconnect, 2000);
        });
    }

    // Wait 3 s before first probe — give the device time to boot
    setTimeout(tryReconnect, 3000);
}

// ---------------------------------------------------------------------------
// PLC mode poller — polls status.xml every 3 s.
// Shows the amber banner and disables all interactive elements when
// plc_mode == "1" (APP_TCPIP_SERVING_CONNECTION active on device).
// Hides banner and re-enables controls when plc_mode returns "0".
// ---------------------------------------------------------------------------
(function() {
    var _plcActive = false;

    function _setInteractiveDisabled(disabled) {
        var tags = ['input', 'select', 'textarea', 'button'];
        var i, j, els;
        for (i = 0; i < tags.length; i++) {
            els = document.body.getElementsByTagName(tags[i]);
            for (j = 0; j < els.length; j++) {
                if (disabled) {
                    els[j].setAttribute('data-plc-disabled', '1');
                    els[j].disabled = true;
                } else if (els[j].getAttribute('data-plc-disabled') === '1') {
                    els[j].removeAttribute('data-plc-disabled');
                    els[j].disabled = false;
                }
            }
        }
        var banner = document.getElementById('plc-banner');
        if (banner) { banner.style.display = disabled ? 'block' : 'none'; }
    }

    function _pollPlcMode() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/status.xml', true);
        xhr.timeout = 3000;
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4) { return; }
            if (xhr.status === 200 && xhr.responseXML) {
                var node = xhr.responseXML.getElementsByTagName('plc_mode')[0];
                var mode = node ? node.textContent || node.innerText || '' : '0';
                var isPlc = (mode.trim() === '1');
                if (isPlc !== _plcActive) {
                    _plcActive = isPlc;
                    _setInteractiveDisabled(isPlc);
                }
                // Populate firmware version in footer on first successful response.
                var verSpan = document.getElementById('fw-version');
                if (verSpan && verSpan.textContent === '...') {
                    var verNode = xhr.responseXML.getElementsByTagName('fw_version')[0];
                    if (verNode) { verSpan.textContent = verNode.textContent || verNode.innerText || ''; }
                }
            }
            setTimeout(_pollPlcMode, 3000);
        };
        xhr.ontimeout = function() { setTimeout(_pollPlcMode, 3000); };
        xhr.send();
    }

    // Start after initial page settle
    setTimeout(_pollPlcMode, 1000);
})();
