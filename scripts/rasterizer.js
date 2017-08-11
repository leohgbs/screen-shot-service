/*
 * phantomjs rasteriser server
 *
 * Usage:
 *   phantomjs rasterizer.js [basePath] [port] [defaultViewportSize]
 *
 * This starts an HTTP server waiting for screenshot requests
 */
var system = require('system');
if (typeof(phantom.args) === 'undefined') {
	phantom.args = system.args.slice(1);
}
var basePath = phantom.args[0] || '/tmp/';

var port  = phantom.args[1] || 3001;

var defaultViewportSize = phantom.args[2] || '';
defaultViewportSize = defaultViewportSize.split('x');
defaultViewportSize = {
  width: ~~defaultViewportSize[0] || 1024,
  height: ~~defaultViewportSize[1] || 600
};

var pageSettings = ['javascriptEnabled', 'loadImages', 'localToRemoteUrlAccessEnabled', 'userAgent', 'userName', 'password'];

var server, service;

server = require('webserver').create();

/*
 * Screenshot service
 *
 * Generate a screenshot file on the server under the basePath
 *
 * Usage:
 * GET /
 * url: http://www.google.com
 *
 * Optional headers:
 * filename: google.png
 * width: 1024
 * height: 600
 * clipRect: { "top": 14, "left": 3, "width": 400, "height": 300 }
 *
 * If path is omitted, the service creates it based on the url, removing the
 * protocol and replacing all slashes with dots, e.g
 * http://www.google.com => www.google.com.png
 *
 * width and height represent the viewport size. If the content exceeds these
 * boundaries and has a non-elastic style, the screenshot may have greater size.
 * Use clipRect to ensure the final size of the screenshot in pixels.
 *
 * All settings of the WebPage object can also be set using headers, e.g.:
 * javascriptEnabled: false
 * userAgent: Mozilla/5.0 (iPhone; U; CPU like Mac OS X; en) AppleWebKit/420+
 */
service = server.listen(port, function(request, response) {
  if (request.url == '/healthCheck') {
    response.statusCode = 200;
    response.write('up');
    response.close();
    return;
  }
  if (!request.headers.url) {
    response.statusCode = 400;
    response.write('Error: Request must contain an url header' + "\n");
    response.close();
    return;
  }
  var url = request.headers.url;
  var path = basePath + (request.headers.filename || (url.replace(new RegExp('https?://'), '').replace(/\//g, '.') + '.png'));
  var page = new WebPage();
  page.onResourceError = function(resourceError) {
    page.error_reason = resourceError.errorString;
  };
  var delay = request.headers.delay || 0;
  try {
    page.viewportSize = {
      width: request.headers.width || defaultViewportSize.width,
      height: request.headers.height || defaultViewportSize.height
    };
    if (request.headers.clipRect) {
      page.clipRect = JSON.parse(request.headers.clipRect);
    }
		page.clipRect = page.evaluate(function() {
			return document.querySelector("html").getBoundingClientRect();
		});
    for (name in pageSettings) {
      if (value = request.headers[pageSettings[name]]) {
        value = (value == 'false') ? false : ((value == 'true') ? true : value);
        page.settings[pageSettings[name]] = value;
      }
    }
  } catch (err) {
    response.statusCode = 500;
    response.write('Error while parsing headers: ' + err.message);
    return response.close();
  }
  page.open(url, function(status) {
    if (status == 'success') {
			page.evaluate(function () {
				// Retina screenshots
				/* scale the whole body */
				document.body.style.webkitTransform = "scale(2)";
				document.body.style.webkitTransformOrigin = "0% 0%";
				/* fix the body width that overflows out of the viewport */
				document.body.style.width = "50%";
			});
			// Wait for 'signin-dropdown' to be visible
			waitFor(function() {
				// Check in the page if a specific element is now visible
				return page.evaluate(function() {
					console.log(window.car_detail_data);
					return window.DATAREADY && document.querySelector('.car-detail-img').complete;
				});
			}, function() {
				setTimeout(function () {
					page.render(path);
					response.write('Success: Screenshot saved to ' + path + "\n");
					page.release();
					response.close();
				}, 2000)
			}, 10000);
      // window.setTimeout(function () {
      //   page.render(path);
      //   response.write('Success: Screenshot saved to ' + path + "\n");
      //   page.release();
      //   response.close();
      // }, delay);
    } else {
      response.write('Error: Url returned status ' + status + ' - ' + page.error_reason + "\n");
      page.release();
      response.close();
    }
  });
  // must start the response now, or phantom closes the connection
  response.statusCode = 200;
  response.write('');
});

function waitFor(testFx, onReady, timeOutMillis) {
	var maxtimeOutMillis = timeOutMillis ? timeOutMillis : 3000, //< Default Max Timout is 3s
		start = new Date().getTime(),
		condition = false,
		interval = setInterval(function() {
			if ( (new Date().getTime() - start < maxtimeOutMillis) && !condition ) {
				// If not time-out yet and condition not yet fulfilled
				condition = (typeof(testFx) === "string" ? eval(testFx) : testFx()); //< defensive code
			} else {
				if(!condition) {
					// If condition still not fulfilled (timeout but condition is 'false')
					console.log("'waitFor()' timeout");
					phantom.exit(1);
				} else {
					// Condition fulfilled (timeout and/or condition is 'true')
					console.log("'waitFor()' finished in " + (new Date().getTime() - start) + "ms.");
					typeof(onReady) === "string" ? eval(onReady) : onReady(); //< Do what it's supposed to do once the condition is fulfilled
					clearInterval(interval); //< Stop this interval
				}
			}
		}, 250); //< repeat check every 250ms
}