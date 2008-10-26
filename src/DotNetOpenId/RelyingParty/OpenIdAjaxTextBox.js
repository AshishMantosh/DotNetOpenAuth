﻿// Options that can be set on the host page:
//window.openid_visible_iframe = true; // causes the hidden iframe to show up
//window.openid_trace = true; // causes lots of alert boxes

function trace(msg) {
	if (window.openid_trace) {
		alert(msg);
	}
}

function initAjaxOpenId(box, openid_logo_url, dotnetopenid_logo_url, spinner_url, success_icon_url, failure_icon_url,
		timeout, assertionReceivedCode,
		loginButtonText, loginButtonToolTip, retryButtonText, retryButtonToolTip, busyToolTip,
		identifierRequiredMessage, loginInProgressMessage,
		authenticatedByToolTip, authenticatedAsToolTip, authenticationFailedToolTip,
		discoverCallback, discoveryFailedCallback) {
	box.dnoi_internal = new Object();
	if (assertionReceivedCode) {
		box.dnoi_internal.onauthenticated = function(sender, e) { eval(assertionReceivedCode); }
	}

	box.dnoi_internal.originalBackground = box.style.background;
	box.timeout = timeout;
	box.dnoi_internal.discoverIdentifier = discoverCallback;
	box.dnoi_internal.authenticationRequests = new Array();

	// The possible authentication results
	var authSuccess = new Object();
	var authRefused = new Object();
	var timedOut = new Object();

	function initializeIFrameManagement(maxFrames) {
		var frames = new Array();
		for (var i = 0; i < maxFrames; i++) {
			frames.push(null);
		}
		
		frames.createHiddenFrame = function(url) {
			var iframe = document.createElement("iframe");
			if (!window.openid_visible_iframe) {
				iframe.setAttribute("width", 0);
				iframe.setAttribute("height", 0);
				iframe.setAttribute("style", "display: none");
			}
			iframe.setAttribute("src", url);
			iframe.openidBox = box;
			box.parentNode.insertBefore(iframe, box);
			return iframe;
		};
		frames.assignFrame = function(url) {
			for (var i = 0; i < frames.length; i++) {
				if (frames[i] == null) {
					return frames[i] = frames.createHiddenFrame(url);
				}
			}
		};
		frames.closeFrames = function() {
			anyClosed = false;
			for (var i = 0; i < frames.length; i++) {
				if (frames[i]) {
					frames.closeFrame(frames[i]);
					anyClosed = true;
				}
			}
			return anyClosed;
		};
		frames.closeFrame = function(frame) {
			for (var i = 0; i < frames.length; i++) {
				if (frames[i] == frame) {
					frame.parentNode.removeChild(frame);
					frames[i] = null;
					return true;
				}
			}
		};

		return frames;
	}
	
	box.dnoi_internal.authenticationIFrames = initializeIFrameManagement(10);

	box.dnoi_internal.constructButton = function(text, tooltip, onclick) {
		var button = document.createElement('button');
		button.textContent = text; // Mozilla
		button.value = text; // IE
		button.title = tooltip != null ? tooltip : '';
		button.onclick = onclick;
		button.style.visibility = 'hidden';
		button.style.position = 'absolute';
		button.style.padding = "0px";
		button.style.fontSize = '8px';
		button.style.top = "1px";
		button.style.bottom = "1px";
		button.style.right = "2px";
		box.parentNode.appendChild(button);
		return button;
	}

	box.dnoi_internal.constructIcon = function(imageUrl, tooltip, rightSide, visible, height) {
		var icon = document.createElement('img');
		icon.src = imageUrl;
		icon.title = tooltip != null ? tooltip : '';
		icon.originalTitle = icon.title;
		if (!visible) {
			icon.style.visibility = 'hidden';
		}
		icon.style.position = 'absolute';
		icon.style.top = "2px";
		icon.style.bottom = "2px"; // for FireFox (and IE7, I think)
		if (height) {
			icon.style.height = height; // for Chrome and IE8
		}
		if (rightSide) {
			icon.style.right = "2px";
		} else {
			icon.style.left = "2px";
		}
		box.parentNode.appendChild(icon);
		return icon;
	}

	box.dnoi_internal.prefetchImage = function(imageUrl) {
		var img = document.createElement('img');
		img.src = imageUrl;
		img.style.display = 'none';
		box.parentNode.appendChild(img);
		return img;
	}

	function findParentForm(element) {
		if (element == null || element.nodeName == "FORM") {
			return element;
		}

		return findParentForm(element.parentNode);
	};

	box.parentForm = findParentForm(box);

	function findOrCreateHiddenField(form, name) {
		if (box.hiddenField) {
			return box.hiddenField;
		}

		box.hiddenField = document.createElement('input');
		box.hiddenField.setAttribute("name", name);
		box.hiddenField.setAttribute("type", "hidden");
		form.appendChild(box.hiddenField);
		return box.hiddenField;
	};

	box.dnoi_internal.loginButton = box.dnoi_internal.constructButton(loginButtonText, loginButtonToolTip, function() {
		var discoveryInfo = box.dnoi_internal.authenticationRequests[box.lastDiscoveredIdentifier];
		if (discoveryInfo == null) {
			trace('Ooops!  Somehow the login button click event was invoked, but no openid discovery information for ' + box.lastDiscoveredIdentifier + ' is available.');
			return;
		}
		// The login button always sends a setup message to the first OP.
		var selectedProvider = discoveryInfo[0];
		selectedProvider.trySetup();
		return false;
	});
	box.dnoi_internal.retryButton = box.dnoi_internal.constructButton(retryButtonText, retryButtonToolTip, function() {
		box.timeout += 5000; // give the retry attempt 5s longer than the last attempt
		box.dnoi_internal.performDiscovery(box.value);
		return false;
	});
	box.dnoi_internal.openid_logo = box.dnoi_internal.constructIcon(openid_logo_url, null, false, true);
	box.dnoi_internal.op_logo = box.dnoi_internal.constructIcon('', authenticatedByToolTip, false, false, "16px");
	box.dnoi_internal.spinner = box.dnoi_internal.constructIcon(spinner_url, busyToolTip, true);
	box.dnoi_internal.success_icon = box.dnoi_internal.constructIcon(success_icon_url, authenticatedAsToolTip, true);
	//box.dnoi_internal.failure_icon = box.dnoi_internal.constructIcon(failure_icon_url, authenticationFailedToolTip, true);

	// Disable the display of the DotNetOpenId logo
	//box.dnoi_internal.dnoi_logo = box.dnoi_internal.constructIcon(dotnetopenid_logo_url);
	box.dnoi_internal.dnoi_logo = box.dnoi_internal.openid_logo;

	box.dnoi_internal.setVisualCue = function(state, authenticatedBy, authenticatedAs) {
		box.dnoi_internal.openid_logo.style.visibility = 'hidden';
		box.dnoi_internal.dnoi_logo.style.visibility = 'hidden';
		box.dnoi_internal.op_logo.style.visibility = 'hidden';
		box.dnoi_internal.spinner.style.visibility = 'hidden';
		box.dnoi_internal.success_icon.style.visibility = 'hidden';
		//		box.dnoi_internal.failure_icon.style.visibility = 'hidden';
		box.dnoi_internal.loginButton.style.visibility = 'hidden';
		box.dnoi_internal.retryButton.style.visibility = 'hidden';
		box.title = '';
		if (state == "discovering") {
			box.dnoi_internal.dnoi_logo.style.visibility = 'visible';
			box.dnoi_internal.spinner.style.visibility = 'visible';
			box.dnoi_internal.claimedIdentifier = null;
			box.title = '';
			window.status = "Discovering OpenID Identifier '" + box.value + "'...";
		} else if (state == "authenticated") {
			var opLogo = box.dnoi_internal.deriveOPFavIcon();
			if (opLogo) {
				box.dnoi_internal.op_logo.src = opLogo;
				box.dnoi_internal.op_logo.style.visibility = 'visible';
				box.dnoi_internal.op_logo.title = box.dnoi_internal.op_logo.originalTitle.replace('{0}', authenticatedBy.getHost());
			} else {
				box.dnoi_internal.openid_logo.style.visibility = 'visible';
			}
			box.dnoi_internal.success_icon.style.visibility = 'visible';
			box.dnoi_internal.success_icon.title = box.dnoi_internal.success_icon.originalTitle.replace('{0}', authenticatedAs);
			box.title = box.dnoi_internal.claimedIdentifier;
			window.status = "Authenticated as " + box.value;
		} else if (state == "setup") {
			var opLogo = box.dnoi_internal.deriveOPFavIcon();
			if (opLogo) {
				box.dnoi_internal.op_logo.src = opLogo;
				box.dnoi_internal.op_logo.style.visibility = 'visible';
			} else {
				box.dnoi_internal.openid_logo.style.visibility = 'visible';
			}
			box.dnoi_internal.loginButton.style.visibility = 'visible';
			box.dnoi_internal.claimedIdentifier = null;
			window.status = "Authentication requires setup.";
		} else if (state == "failed") {
			box.dnoi_internal.openid_logo.style.visibility = 'visible';
			//box.dnoi_internal.failure_icon.style.visibility = 'visible';
			box.dnoi_internal.retryButton.style.visibility = 'visible';
			box.dnoi_internal.claimedIdentifier = null;
			window.status = authenticationFailedToolTip;
			box.title = authenticationFailedToolTip;
		} else if (state = '' || state == null) {
			box.dnoi_internal.openid_logo.style.visibility = 'visible';
			box.title = '';
			box.dnoi_internal.claimedIdentifier = null;
			window.status = null;
		} else {
			box.dnoi_internal.claimedIdentifier = null;
			trace('unrecognized state ' + state);
		}
	}

	box.dnoi_internal.isBusy = function() {
		// TODO: code here
	};

	box.dnoi_internal.onSubmit = function() {
		if (box.lastAuthenticationResult != 'authenticated') {
			if (box.dnoi_internal.isBusy()) {
				alert(loginInProgressMessage);
			} else {
				if (box.value.length > 0) {
					// submitPending will be true if we've already tried deferring submit for a login,
					// in which case we just want to display a box to the user.
					if (box.dnoi_internal.submitPending) {
						alert(identifierRequiredMessage);
					} else {
						// The user hasn't clicked "Login" yet.  We'll click login for him,
						// after leaving a note for ourselves to automatically click submit
						// when login is complete.
						box.dnoi_internal.submitPending = box.dnoi_internal.submitButtonJustClicked;
						if (box.dnoi_internal.submitPending == null) {
							box.dnoi_internal.submitPending = true;
						}
						box.dnoi_internal.loginButton.onclick();
						return false; // abort submit for now
					}
				} else {
					return true;
				}
			}
			return false;
		}
		return true;
	};

	box.dnoi_internal.setLastSubmitButtonClicked = function(evt) {
		var button;
		if (evt.target) {
			button = evt.target;
		} else {
			button = evt.srcElement;
		}

		box.dnoi_internal.submitButtonJustClicked = button;
	};

	// box.hookAllSubmitElements = function(searchNode) {
		var inputs = document.getElementsByTagName('input');
		for (var i = 0; i < inputs.length; i++) {
			var el = inputs[i];
			if (el.type == 'submit') {
				if (el.attachEvent) {
					el.attachEvent("onclick", box.dnoi_internal.setLastSubmitButtonClicked);
				} else {
					el.addEventListener("click", box.dnoi_internal.setLastSubmitButtonClicked, true);
				}
			}
		}
	//};

	box.dnoi_internal.deriveOPFavIcon = function() {
		if (!box.hiddenField) return;
		var authResult = new Uri(box.hiddenField.value);
		var opUri;
		if (authResult.getQueryArgValue("openid.op_endpoint")) {
			opUri = new Uri(authResult.getQueryArgValue("openid.op_endpoint"));
		} else if (authResult.getQueryArgValue("openid.user_setup_url")) {
			opUri = new Uri(authResult.getQueryArgValue("openid.user_setup_url"));
		} else return null;
		var favicon = opUri.getAuthority() + "/favicon.ico";
		return favicon;
	};

	box.dnoi_internal.createDiscoveryInfo = function(discoveryInfo, identifier) {
		this.identifier = identifier;
		this.claimedIdentifier = discoveryInfo.claimedIdentifier;
		trace('Discovered claimed identifier: ' + this.claimedIdentifier);

		// Add extra tracking bits and behaviors.
		this.findSuccessfulRequest = function() {
			for (var i = 0; i < this.length; i++) {
				if (this[i].result == authSuccess) {
					return this[i];
				}
			}
		};
		this.busy = function() {
			for (var i = 0; i < this.length; i++) {
				if (this[i].busy()) {
					return true;
				}
			}
		};
		this.abortAll = function() {
			// Abort all other asynchronous authentication attempts that may be in progress.
			for (var i = 0; i < this.length; i++) {
				this[i].abort();
			}
		};

		this.length = discoveryInfo.requests.length;
		for (var i = 0; i < discoveryInfo.requests.length; i++) {
			this[i] = new box.dnoi_internal.createTrackingRequest(discoveryInfo.requests[i], identifier);
		}
	};

	box.dnoi_internal.createTrackingRequest = function(requestInfo, identifier) {
		this.immediate = new Uri(requestInfo.immediate);
		this.setup = new Uri(requestInfo.setup);
		this.endpoint = new Uri(requestInfo.endpoint);
		this.identifier = identifier;

		this.host = this.immediate.getHost();

		this.getDiscoveryInfo = function() {
			return box.dnoi_internal.authenticationRequests[this.identifier];
		}

		this.busy = function() {
			return this.iframe != null || this.popup != null;
		};

		this.completeAttempt = function() {
			if (!this.busy()) return false;
			if (this.iframe) {
				box.dnoi_internal.authenticationIFrames.closeFrame(this.iframe);
				this.iframe = null;
			}
			if (this.popup) {
				this.popup.close();
				this.popup = null;
			}
			if (this.timeout) {
				window.clearTimeout(this.timeout);
				this.timeout = null;
			}

			if (!this.getDiscoveryInfo().busy() && this.getDiscoveryInfo().findSuccessfulRequest() == null) {
				trace('No asynchronous authentication attempt is in progress.  Display setup view.');
				// visual cue that auth failed
				box.dnoi_internal.setVisualCue('setup');
				box.lastAuthenticationResult = 'setup';
			}

			return true;
		};

		this.authenticationTimedOut = function() {
			if (this.completeAttempt()) {
				trace(this.host + " timed out");
				this.result = timedOut;
			}
		};
		this.authSuccess = function(authUri) {
			if (this.completeAttempt()) {
				trace(this.host + " authenticated!");
				this.result = authSuccess;
				this.response = authUri;
				box.dnoi_internal.authenticationRequests[this.identifier].abortAll();
			}
		};
		this.authFailed = function() {
			if (this.completeAttempt()) {
				//trace(this.host + " failed authentication");
				this.result = authRefused;
			}
		};
		this.abort = function() {
			if (this.completeAttempt()) {
				trace(this.host + " aborted");
				// leave the result as whatever it was before.
			}
		};

		this.tryImmediate = function() {
			this.abort(); // ensure no concurrent attempts
			var self = this; // closure so that timer handler has the right instance
			this.timeout = setTimeout(function() { self.authenticationTimedOut(); }, box.timeout);
			this.iframe = box.dnoi_internal.authenticationIFrames.assignFrame(this.immediate);
			//trace('initiating auth attempt with: ' + this.immediate);
		};
		this.trySetup = function() {
			this.abort(); // ensure no concurrent attempts
			self.waiting_openidBox = box;
			this.popup = window.open(this.setup, 'opLogin', 'status=0,toolbar=0,location=1,resizable=1,scrollbars=1,width=800,height=600');
		};
	};

	/*****************************************
	* Flow
	*****************************************/

	/// <summary>Called to initiate discovery on some identifier.</summary>
	box.dnoi_internal.performDiscovery = function(identifier) {
		box.dnoi_internal.authenticationIFrames.closeFrames();
		box.dnoi_internal.setVisualCue('discovering');
		box.lastDiscoveredIdentifier = identifier;
		box.lastAuthenticationResult = null;
		box.dnoi_internal.discoverIdentifier(identifier, box.dnoi_internal.discoveryResult, box.dnoi_internal.discoveryFailed);
	};

	/// <summary>Callback that is invoked when discovery fails.</summary>
	box.dnoi_internal.discoveryFailed = function(message, identifier) {
		box.lastAuthenticationResult = 'failed';
		box.dnoi_internal.setVisualCue('failed');
		if (message) { box.title = message; }
	}

	/// <summary>Callback that is invoked when discovery results are available.</summary>
	/// <param name="discoveryResult">The JSON object containing the OpenID auth requests.</param>
	/// <param name="identifier">The identifier that discovery was performed on.</param>
	box.dnoi_internal.discoveryResult = function(discoveryResult, identifier) {
		// Deserialize the JSON object and store the result if it was a successful discovery.
		discoveryResult = eval('(' + discoveryResult + ')');
		// Store the discovery results and added behavior for later use.
		box.dnoi_internal.authenticationRequests[identifier] = discoveryBehavior = new box.dnoi_internal.createDiscoveryInfo(discoveryResult, identifier);

		// Only act on the discovery event if we're still interested in the result.
		// If the user already changed the identifier since discovery was initiated,
		// we aren't interested in it any more.
		if (identifier == box.lastDiscoveredIdentifier) {
			if (discoveryResult.requests.length > 0) {
				for (var i = 0; i < discoveryResult.requests.length; i++) {
					discoveryBehavior[i].tryImmediate();
				}
			} else {
				box.dnoi_internal.discoveryFailed(null, identifier);
			}
		}
	}

	/// <summary>Invoked by RP web server when an authentication has completed.</summary>
	/// <remarks>The duty of this method is to distribute the notification to the appropriate tracking object.</remarks>
	box.dnoi_internal.openidAuthResult = function(resultUrl) {
		self.waiting_openidBox = null;
		//trace('openidAuthResult ' + resultUrl);
		var resultUri = new Uri(resultUrl);

		// Find the tracking object responsible for this request.
		var discoveryInfo = box.dnoi_internal.authenticationRequests[resultUri.getQueryArgValue('dotnetopenid.userSuppliedIdentifier')];
		if (discoveryInfo == null) {
			trace('openidAuthResult called but no userSuppliedIdentifier parameter was found.  Exiting function.');
			return;
		}
		var tracker = discoveryInfo[resultUri.getQueryArgValue('index')];
		trace('Auth result for ' + tracker.host + ' (' + resultUri.getQueryArgValue('index') + ') received:\n' + resultUrl);

		if (isAuthSuccessful(resultUri)) {
			tracker.authSuccess(resultUri);

			// stick the result in a hidden field so the RP can verify it
			var hiddenField = findOrCreateHiddenField(box.parentForm, "openidAuthData");
			hiddenField.setAttribute("value", resultUri.toString());
			trace("set openidAuthData = " + resultUri.queryString);
			if (hiddenField.parentNode == null) {
				box.parentForm.appendChild(hiddenField);
			}
			// TODO: clear the openidAuthData field when the auth goes invalid (cause the user changed the identifier).

			// visual cue that auth was successful
			box.dnoi_internal.claimedIdentifier = discoveryInfo.claimedIdentifier;
			box.dnoi_internal.setVisualCue('authenticated', tracker.endpoint, discoveryInfo.claimedIdentifier);
			box.lastAuthenticationResult = 'authenticated';
			if (box.dnoi_internal.onauthenticated) {
				box.dnoi_internal.onauthenticated(box);
			}
			if (box.dnoi_internal.submitPending) {
				// We submit the form BEFORE resetting the submitPending so
				// the submit handler knows we've already tried this route.
				if (box.dnoi_internal.submitPending == true) {
					box.parentForm.submit();
				} else {
					box.dnoi_internal.submitPending.click();
				}
			}
		} else {
			tracker.authFailed();
		}

		box.dnoi_internal.submitPending = null;
	};

	function isAuthSuccessful(resultUri) {
		if (isOpenID2Response(resultUri)) {
			return resultUri.getQueryArgValue("openid.mode") == "id_res";
		} else {
			return resultUri.getQueryArgValue("openid.mode") == "id_res" && !resultUri.containsQueryArg("openid.user_setup_url");
		}
	};

	function isOpenID2Response(resultUri) {
		return resultUri.containsQueryArg("openid.ns");
	};

	box.onblur = function(event) {
		var discoveryInfo = box.dnoi_internal.authenticationRequests[box.value];
		if (discoveryInfo == null) {
			if (box.value.length > 0) {
				box.dnoi_internal.performDiscovery(box.value);
			} else {
				box.dnoi_internal.setVisualCue();
			}
		} else {
			if ((priorSuccess = discoveryInfo.findSuccessfulRequest())) {
				box.dnoi_internal.setVisualCue('authenticated', priorSuccess.endpoint, discoveryInfo.claimedIdentifier);
			}
		}
		return true;
	};
	box.onkeyup = function(event) {
		box.dnoi_internal.setVisualCue();
		return true;
	};
	box.getClaimedIdentifier = function() { return box.dnoi_internal.claimedIdentifier; };
}

function Uri(url) {
	this.originalUri = url;

	this.toString = function() {
		return this.originalUri;
	};

	this.getAuthority = function() {
		var authority = this.getScheme() + "://" + this.getHost();
		return authority;
	}

	this.getHost = function() {
		var hostStartIdx = this.originalUri.indexOf("://") + 3;
		var hostEndIndex = this.originalUri.indexOf("/", hostStartIdx);
		if (hostEndIndex < 0) hostEndIndex = this.originalUri.length;
		var host = this.originalUri.substr(hostStartIdx, hostEndIndex - hostStartIdx);
		return host;
	}

	this.getScheme = function() {
		var schemeStartIdx = this.indexOf("://");
		return this.originalUri.substr(this.originalUri, schemeStartIdx);
	}

	this.trimFragment = function() {
		var hashmark = this.originalUri.indexOf('#');
		if (hashmark >= 0) {
			return new Uri(this.originalUri.substr(0, hashmark));
		}
		return this;
	};

	this.appendQueryVariable = function(name, value) {
		var pair = encodeURI(name) + "=" + encodeURI(value);
		if (this.originalUri.indexOf('?') >= 0) {
			this.originalUri = this.originalUri + "&" + pair;
		} else {
			this.originalUri = this.originalUri + "?" + pair;
		}
	};

	function KeyValuePair(key, value) {
		this.key = key;
		this.value = value;
	};

	this.Pairs = new Array();

	var queryBeginsAt = this.originalUri.indexOf('?');
	if (queryBeginsAt >= 0) {
		this.queryString = url.substr(queryBeginsAt + 1);
		var queryStringPairs = this.queryString.split('&');

		for (var i = 0; i < queryStringPairs.length; i++) {
			var pair = queryStringPairs[i].split('=');
			this.Pairs.push(new KeyValuePair(unescape(pair[0]), unescape(pair[1])))
		}
	};

	this.getQueryArgValue = function(key) {
		for (var i = 0; i < this.Pairs.length; i++) {
			if (this.Pairs[i].key == key) {
				return this.Pairs[i].value;
			}
		}
	};

	this.containsQueryArg = function(key) {
		return this.getQueryArgValue(key);
	};

	this.indexOf = function(args) {
		return this.originalUri.indexOf(args);
	};

	return this;
};
