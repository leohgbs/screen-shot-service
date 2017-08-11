var utils = require('../lib/utils');
var join = require('path').join;
var fs = require('fs');
var path = require('path');
var request = require('request');
var qiniu = require('qiniu');
var config = require('config').qiniu;
var accessKey = config.accessKey;
var secretKey = config.secretKey;
var bucket = config.bucket;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var options = {
	scope: bucket
};
var putPolicy = new qiniu.rs.PutPolicy(options);
var uploadToken=putPolicy.uploadToken(mac);

module.exports = function(app, useCors) {
  var rasterizerService = app.settings.rasterizerService;
  var fileCleanerService = app.settings.fileCleanerService;

  // routes
  app.get('/screen', function(req, res, next) {
    if (!req.param('url', false)) {
      return res.redirect('/usage.html');
    }

    var url = utils.url(req.param('url'));
    // required options
    var options = {
      uri: 'http://localhost:' + rasterizerService.getPort() + '/',
      headers: { url: url }
    };
    ['width', 'height', 'clipRect', 'javascriptEnabled', 'loadImages', 'localToRemoteUrlAccessEnabled', 'userAgent', 'userName', 'password', 'delay', 'upload'].forEach(function(name) {
      if (req.param(name, false)) options.headers[name] = req.param(name);
    });

    var filename = Math.random().toString(36).substr(2) + '.png';
    options.headers.filename = filename;

    var filePath = join(rasterizerService.getPath(), filename);

    var callbackUrl = req.param('callback', false) ? utils.url(req.param('callback')) : false;
    console.log('Request for %s - Rasterizing it', url);
    processImageUsingRasterizer(options, filePath, res, callbackUrl, function(err) { if(err) next(err); });
  });

  var processImageUsingRasterizer = function(rasterizerOptions, filePath, res, url, callback) {
    if (url) {
      // asynchronous
      res.send('Will post screenshot to ' + url + ' when processed');
      callRasterizer(rasterizerOptions, function(error) {
        if (error) return callback(error);
        postImageToUrl(filePath, url, callback);
      });
    } else {
      // synchronous

			callRasterizer(rasterizerOptions, function(error) {
				if (error) return callback(error);
				if (rasterizerOptions.headers["upload"]) {
					uploadQiniu(filePath, res, callback)
				} else {
					sendImageInResponse(filePath, res, callback);
				}
				});
    }
  }

  var callRasterizer = function(rasterizerOptions, callback) {
    request.get(rasterizerOptions, function(error, response, body) {
      if (error || response.statusCode != 200) {
        console.log('Error while requesting the rasterizer: %s', error.message);
        rasterizerService.restartService();
        return callback(new Error(body));
      }
      else if (body.indexOf('Error: ') == 0) {
        var errmsg = body.substring(7);
        console.log('Error while requesting the rasterizer: %s', errmsg);
        return callback(new Error(errmsg));
      }
      callback(null);
    });
  }

  var postImageToUrl = function(imagePath, url, callback) {
    console.log('Streaming image to %s', url);
    var fileStream = fs.createReadStream(imagePath);
    fileStream.on('end', function() {
      fileCleanerService.addFile(imagePath);
    });
    fileStream.on('error', function(err){
      console.log('Error while reading file: %s', err.message);
      callback(err);
    });
    fileStream.pipe(request.post(url, function(err) {
      if (err) console.log('Error while streaming screenshot: %s', err);
      callback(err);
    }));
  }

  var sendImageInResponse = function(imagePath, res, callback) {
    console.log('Sending base64 image in response');
    if (useCors) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Expose-Headers", "Content-Type");
    }
		var img = fs.readFileSync(imagePath);
		var byteImg = new Buffer(img).toString("base64")
		// send base64
		res.writeHead(200, {
			'Content-Type': 'image/png',
			'Content-Length': byteImg.length
		});
		res.end(byteImg, function (err) {
			fileCleanerService.addFile(imagePath);
			callback(err);
		});
  }

	var uploadQiniu = function(localFile, res, callback) {
		var config = new qiniu.conf.Config();
		// 空间对应的机房
		config.zone = qiniu.zone.Zone_z2;
		var formUploader = new qiniu.form_up.FormUploader(config);
		var putExtra = new qiniu.form_up.PutExtra();
		var key = Math.random().toString(36).substr(2);
		// 文件上传
		formUploader.putFile(uploadToken, key, localFile, putExtra, function(respErr, respBody, respInfo) {
			if (respErr) {
				callback(respErr);
			}
			res.setHeader('Content-Type', 'application/json')
			res.end(JSON.stringify(respBody), function () {
				fileCleanerService.addFile(localFile);
			})
		});
	}
};