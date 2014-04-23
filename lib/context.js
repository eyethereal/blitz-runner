var log = require("./logger");

// Private array of chars to use for uuids
var CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

/**
 * Generates a universally (more or less) uid by creating a random stream
 * of characters. Should be reasonably fine most of the time.
 */
function randomChars(len, chars) {
    var len = len || 20;
    var chars = chars || CHARS;
    var uuid = [];
    var radix = chars.length;

    for (var i = 0; i < len; i++) uuid[i] = chars[0 | Math.random() * radix];
    return uuid.join('');
};



var parseCookies = function(str, opt) {
    opt = opt || {};
    var obj = {}
    var pairs = str.split(/; */);
    var dec = opt.decode || decodeURIComponent;

    pairs.forEach(function(pair) {
        var eq_idx = pair.indexOf('=')

        // skip things that don't look like key=value
        if (eq_idx < 0) {
            return;
        }

        var key = pair.substr(0, eq_idx).trim()
        var val = pair.substr(++eq_idx, pair.length).trim();

        // quoted values
        if ('"' == val[0]) {
            val = val.slice(1, -1);
        }

        // only assign once
        if (undefined == obj[key]) {
            try {
                obj[key] = dec(val);
            } catch (e) {
                obj[key] = val;
            }
        }
    });

    return obj;
};


module.exports = function() {

    var context = this;

    // Cookies we extract
    var xtracted = {};

    var variables = {};

    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function alphaVar(def) {
        var min = def.min || 1;
        var max = def.max || 10;

        if (max > min) {
            var offset = getRandomInt(min, max);
        } else {
            var offset = 0;
        }

        return randomChars(min+offset);
    }

    function numberVar(def) {
        var min = def.min || 1;
        var max = def.max || 100000;

        if (max > min) {
            var offset = getRandomInt(min, max);
        } else {
            var offset = 0;
        }

        return min + offset;
    }

    function uuidVar(def) {

        // Borrowed from tiny-uuid
        return function(a,b){for(b=a='';a++<36;b+=a*51&52?(a^15?8^Math.random()*(a^20?16:4):4).toString(16):'-');return b};

    }


    context.updateVariables = function(varDef) {
        for(var key in varDef) {
            var def = varDef[key];

            switch(def.type) {
                case 'alpha':
                    var val = alphaVar(def);
                    break;

                case 'number':
                    var val = numberVar(def);
                    break;

                case 'uuid':
                    var val = uuidVar(def);
                    break;

                default:
                    console.error("Unsupported variable type %s", type);
                    process.exit(1);
            }
            variables[key] = val;
        }
    }

    context.substituteVariables = function(str) {

        // A little brutish, but meh
        for(var key in variables) {
            var value = variables[key];

            var re = new RegExp("#{"+key+"}", "g");
            str = str.replace(re, value);
        }
        return str;
    }

    context.xtract = function(xtractSpec, result) {

        if (!xtractSpec) return;

        // First, get any cookies in the result
        var setCookies = result.headers["set-cookie"];
        if (!setCookies) {
            result.errors.push("Expected to extract cookies but no set-cookie header was found");
            return;
        }

        log.warningi("setCookies ", setCookies);

        var cookies = {};
        for (var ix=0; ix<setCookies.length; ix++) {
            var cookieLine = setCookies[ix];

            var someCooks = parseCookies(cookieLine);
            for (var key in someCooks) {
                var val = someCooks[key];
                cookies[key] = val;
            }
        }

        for (var key in xtractSpec) {
            var item = xtractSpec[key];

            if (item.type == "cookie") {
                var val = cookies[key];
                if (!val) {
                    result.errors.push("No "+key+" cookie was found");
                    continue;
                }

                xtracted[key] = val;
            }
        }
    }

    context.preflight = function(requestOpts) {
        // Add up all the cookies
        var out = [];
        for(var key in xtracted) {
            var val = xtracted[key];

            out.push(encodeURIComponent(key)+"="+encodeURIComponent(val));
        }

        if (out.length == 0) return;

        if (!requestOpts.headers) {
            requestOpts.headers = {};
        }

        var existing = requestOpts.headers["cookie"];
        if (existing) out.unshift(existing);

        var all = out.join("; ");

        requestOpts.headers["cookie"] = all;
    }

}

