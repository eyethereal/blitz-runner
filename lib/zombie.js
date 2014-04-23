var http = require("http");
var https = require("https");
var url = require("url");

var log = require("./logger");

var headerRE = /(.*):(.*)/

// Runs a single step within a given context
exports.run = function(context, step, callback) {

    if (step.variables) {
        context.updateVariables(step.variables);
    }

    log.debugi("step ", step);

    var fullURL = context.substituteVariables(step.fullURL || step.url);

    var opts = url.parse(fullURL);

    opts.method = step.request || "GET";

    if (step.headers) {

        opts.headers = {};

        for(var ix=0; ix<step.headers.length; ix++) {
            var v = step.headers[ix];            
            var hdr = headerRE.exec(v);
            opts.headers[ context.substituteVariables(hdr[1]) ] = context.substituteVariables(hdr[2]);
        }
    }

    // So it can add cookies and the like
    context.preflight(opts);


    // Update content length
    if (step.content && step.content.data) {
        var toSend = [];
        var len = 0;
        for(var ix=0; ix<step.content.data.length; ix++) {
            var el = step.content.data[ix];
            el = context.substituteVariables(el);
            len += el.length;

            toSend.push(el);
        }
        if (!opts.headers) opts.headers = {};
        opts.headers["content-length"] = len;
    }



    if (opts.protocol == "https") {
        var proto = https;
    } else {
        var proto = http;
    }
    log.debugi("Request options ", opts);
    var req = proto.request(opts);
    
    var result = {
        timing: {
            created: Date.now()
        }
        , errors: []
    };
    req.on("response", function(response) {
        log.debug("response");
        result.statusCode = response.statusCode;
        result.headers = response.headers;
        result.timing.responseBegins = Date.now();
        result.data = [];

        response.on("data", function(data) {
            log.debug("response data");
            result.data.push(data);
        });

        response.on("error", function(err) {
            errors.push("response error: "+err);
        });

        response.on("end", function() {
            log.debug("response end");
            result.timing.end = Date.now();

            // Finishing processing
            if (step.xtracts) {
                context.xtract(step.xtracts, result);
            }

            callback(null, result);
        });

        // Set timeout on response???
    });

    req.on("socket", function(socket) {
        socket.setMaxListeners(0);
        socket.on("error", function(e) {
            console.log("Socket thing "+e);
        });
    });

    req.on("error", function(err) {
        log.warning("request error ", err);
        result.timing.error = Date.now();
        result.errors.push(err);
        //callback(err);
        console.trace();

        return false;
    });

    req.setTimeout(step.timeout, function() {        
        result.timing.requestTimeout = Date.now();
    });

    // Send any data if we have that to do
    if (toSend) {
        sent = [];

        for(var ix=0; ix<toSend.length; ix++) {
            var el = toSend[ix];
            sent.push(el);
            req.write( el );
        }

        result.sent = sent;
    }

    req.end();


    // Return a canceler
    return function() {
        log.debugi("req abort function");

        req.setTimeout(0, function() { });
    }
}
